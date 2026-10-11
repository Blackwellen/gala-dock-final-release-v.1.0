-- Transactional email (release spec §76–77). Every in-app notification of an email-worthy kind is mirrored into an outbox, honouring
-- the user's preferences (security and money mail can't be switched off). A worker drains the outbox through the configured provider;
-- with no provider configured rows stay queued (BLOCKED_EXTERNAL_CONFIGURATION) and nothing is lost. Marketing is never sent from here.
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  to_email text not null,
  category text not null,                                -- maps to a preference key
  subject text not null, body text not null, link text,
  notification_id uuid,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','suppressed')),
  attempts integer not null default 0, last_error text, provider_id text,
  lease_until timestamptz, created_at timestamptz not null default now(), sent_at timestamptz,
  unique (notification_id)
);
create index if not exists email_outbox_queue_idx on public.email_outbox(created_at) where status in ('queued','failed');
alter table public.email_outbox enable row level security;
drop policy if exists email_outbox_own on public.email_outbox;
create policy email_outbox_own on public.email_outbox for select using (user_id = (select auth.uid()) or public.has_admin_permission('support'));

-- kind → (category, mandatory). Mandatory categories ignore opt-outs: account security, payments/refunds, legal notices.
create or replace function public.email_category(p_kind text) returns table (category text, mandatory boolean) language sql immutable as $$
  select case
    when p_kind in ('security') then 'security'
    when p_kind ~ '(payment|payout|refund|invoice|dispute|cancellation)' then 'payments'
    when p_kind ~ '(ticket|waitlist|transfer)' then 'tickets'
    when p_kind ~ '(quote|request|hold|booking|standby|emergency|opportunit)' then 'quotes'
    when p_kind ~ '(message)' then 'messages'
    when p_kind ~ '(reminder|deadline|expiry)' then 'reminders'
    when p_kind ~ '(event|incident|agent)' then 'event_updates'
    else null end,
  p_kind in ('security') or p_kind ~ '(payment|payout|refund|invoice|dispute|cancellation)';
$$;

create or replace function public.trg_notification_email() returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; addr text; prefs jsonb;
begin
  select * into c from public.email_category(new.kind);
  if c.category is null then return new; end if;
  select u.email, p.notifications into addr, prefs from auth.users u left join public.profiles p on p.id = u.id where u.id = new.user_id;
  if addr is null then return new; end if;
  if not c.mandatory and coalesce((prefs ->> c.category)::boolean, true) = false then return new; end if;
  insert into public.email_outbox(user_id, to_email, category, subject, body, link, notification_id)
    values (new.user_id, addr, c.category, left(new.title, 200), left(coalesce(new.body, ''), 4000), new.link, new.id) on conflict (notification_id) do nothing;
  return new;
exception when others then return new;   -- email must never block the in-app notification
end $$;
drop trigger if exists gd_notification_email on public.notifications;
create trigger gd_notification_email after insert on public.notifications for each row execute function public.trg_notification_email();

-- Lease a batch for the worker (service role).
create or replace function public.claim_email_batch(p_limit integer default 25) returns setof public.email_outbox
language sql security definer set search_path = '' as $$
  update public.email_outbox o set status = 'sending', lease_until = now() + interval '2 minutes', attempts = o.attempts + 1
  where o.id in (select x.id from public.email_outbox x where (x.status = 'queued' or (x.status = 'failed' and x.attempts < 5 and x.created_at > now() - interval '2 days')
      or (x.status = 'sending' and x.lease_until < now())) order by x.created_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning o.*;
$$;
revoke all on function public.claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

select cron.unschedule('email-outbox') where exists (select 1 from cron.job where jobname = 'email-outbox');
select cron.schedule('email-outbox', '*/2 * * * *', $$select public.dispatch_worker('/api/cron/email')$$);
