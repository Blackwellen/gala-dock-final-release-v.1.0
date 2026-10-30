-- Q05 Communications & Notification Foundation (cards 163–168). Additive and backward-compatible: the deployed code keeps using
-- threads/messages (marketplace build-item threads) and conversations/conversation_messages (direct/enquiry) unchanged.
--  1. Canonical thread model = conversations + participants + conversation_messages. Legacy threads map onto it through
--     message_thread_links (one canonical conversation per legacy thread); inbox_threads / inbox_messages (security_invoker views,
--     caller's RLS applies) present both sources as one model, each message exactly once.
--  2. send_context_message(): event / booking / quote / listing context threads, advisory-locked per context + parties so two
--     concurrent first messages never create two threads, idempotent per client message id (retries never duplicate).
--  3. Notifications: dedupe_key (one notification per key), notification_categories (transactional vs marketing — PECR),
--     notify() service API; marketing needs a confirmed double-opt-in subscription.
--  4. Email: provider webhook events (bounce/complaint → suppression list), suppression checked before every send.
--  5. Marketing subscriptions (newsletter / product updates, double opt-in) and public contact submissions (signed-out).

-- 1. Canonical threads ---------------------------------------------------------------------------------------------------------
alter table public.conversation_messages add column if not exists client_msg_id uuid;
create unique index if not exists conversation_messages_client_msg on public.conversation_messages(conversation_id, client_msg_id) where client_msg_id is not null;
alter table public.conversations add column if not exists context_key text;
create index if not exists conversations_context_key_idx on public.conversations(context_key) where context_key is not null;

create table if not exists public.message_thread_links (
  thread_id uuid primary key references public.threads(id) on delete cascade,
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  linked_at timestamptz not null default now()
);
alter table public.message_thread_links enable row level security;
revoke all on table public.message_thread_links from public, anon, authenticated;
grant select on table public.message_thread_links to authenticated;
grant all on table public.message_thread_links to service_role;
drop policy if exists message_thread_links_read on public.message_thread_links;
create policy message_thread_links_read on public.message_thread_links for select to authenticated using (public.can_access_conversation(conversation_id));

-- Backfill: a legacy thread and a conversation about the same build item are the same canonical thread (oldest conversation wins).
insert into public.message_thread_links(thread_id, conversation_id)
select distinct on (t.id) t.id, c.id from public.threads t join public.conversations c on c.build_item_id = t.build_item_id
 where t.build_item_id is not null and not exists (select 1 from public.message_thread_links l where l.conversation_id = c.id)
 order by t.id, c.created_at
on conflict do nothing;

create or replace view public.inbox_threads with (security_invoker = true) as
  select c.id, 'conversation'::text as source, c.kind, c.subject, c.event_id, c.listing_id, c.build_item_id, c.context_key,
         coalesce(greatest(c.last_message_at, (select max(m.created_at) from public.message_thread_links l join public.messages m on m.thread_id = l.thread_id where l.conversation_id = c.id)), c.last_message_at) as last_message_at,
         c.last_message_preview as preview, (select l.thread_id from public.message_thread_links l where l.conversation_id = c.id) as legacy_thread_id
    from public.conversations c
  union all
  select t.id, 'thread'::text, t.kind, t.title, t.event_id, t.listing_id, t.build_item_id,
         case when t.build_item_id is not null then 'build_item:' || t.build_item_id end,
         coalesce((select max(m.created_at) from public.messages m where m.thread_id = t.id), t.updated_at),
         (select left(m.body, 140) from public.messages m where m.thread_id = t.id order by m.created_at desc limit 1), t.id
    from public.threads t where not exists (select 1 from public.message_thread_links l where l.thread_id = t.id);

create or replace view public.inbox_messages with (security_invoker = true) as
  select m.id, m.conversation_id as thread_id, 'conversation'::text as source, m.sender_id, m.sender_name, m.body, m.attachments, m.created_at, m.client_msg_id
    from public.conversation_messages m where m.deleted_at is null
  union all
  select m.id, coalesce(l.conversation_id, m.thread_id), 'thread'::text, m.sender_id, m.sender_name, m.body, m.attachments, m.created_at, null::uuid
    from public.messages m left join public.message_thread_links l on l.thread_id = m.thread_id;
grant select on public.inbox_threads, public.inbox_messages to authenticated;
revoke all on public.inbox_threads, public.inbox_messages from anon;

-- Context threads. p_context: 'booking' | 'quote' (build item id), 'event' (event id + counterpart workspace), 'listing' (listing id).
create or replace function public.send_context_message(p_context text, p_context_id uuid, p_body text, p_attachments jsonb default '[]',
  p_as_workspace uuid default null, p_to_workspace uuid default null, p_client_msg_id uuid default null, p_subject text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); ev uuid; li uuid; item uuid; counterpart_type text; counterpart uuid; v_kind text; key text; cid uuid; mid uuid; existing uuid;
  provider_ws uuid; organizer_ws uuid; owner uuid; subj text; created boolean := false;
begin
  if me is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_context not in ('booking','quote','event','listing') then raise exception 'invalid_context' using errcode = '22023'; end if;
  if p_as_workspace is not null and not public.is_workspace_member(p_as_workspace) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_context in ('booking','quote') then
    select b.event_id, b.listing_id, b.id, l.workspace_id, e.workspace_id, e.owner_id, coalesce(e.name, 'Booking') || ' · ' || l.name
      into ev, li, item, provider_ws, organizer_ws, owner, subj
      from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id where b.id = p_context_id;
    if item is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_kind := 'booking';
    if p_as_workspace is not null and p_as_workspace = provider_ws then          -- provider side writes to the client
      counterpart_type := case when organizer_ws is not null then 'workspace' else 'user' end; counterpart := coalesce(organizer_ws, owner);
    elsif public.can_access_event(ev) then                                         -- client side writes to the provider
      counterpart_type := 'workspace'; counterpart := provider_ws;
    else raise exception 'not_authorized' using errcode = '42501'; end if;
    key := 'build_item:' || item;
  elsif p_context = 'event' then
    select e.id, e.name into ev, subj from public.events e where e.id = p_context_id;
    if ev is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_to_workspace is null then raise exception 'counterpart_required' using errcode = '22023'; end if;
    if not (public.can_access_event(ev) or (p_as_workspace is not null and exists (select 1 from public.build_items b join public.listings l on l.id = b.listing_id where b.event_id = ev and l.workspace_id = p_as_workspace))) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    v_kind := 'event'; counterpart_type := 'workspace'; counterpart := p_to_workspace; key := 'event:' || ev;
  else
    select l.id, l.workspace_id, l.name into li, provider_ws, subj from public.listings l where l.id = p_context_id and l.published;
    if li is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_kind := 'enquiry'; counterpart_type := 'workspace'; counterpart := provider_ws; key := 'listing:' || li;
  end if;
  -- One canonical thread per context + pair of parties, even under concurrent first messages.
  perform pg_advisory_xact_lock(hashtextextended(key || '|' || least(coalesce(p_as_workspace, me)::text, counterpart::text) || '|' || greatest(coalesce(p_as_workspace, me)::text, counterpart::text), 0));
  select c.id into cid from public.conversations c
   where (c.context_key = key or (c.context_key is null and c.kind = v_kind and c.event_id is not distinct from ev and c.listing_id is not distinct from li and c.build_item_id is not distinct from item))
     and exists (select 1 from public.conversation_participants x where x.conversation_id = c.id and (x.user_id = case when p_as_workspace is null then me end or x.workspace_id = p_as_workspace))
     and exists (select 1 from public.conversation_participants y where y.conversation_id = c.id and (case when counterpart_type = 'user' then y.user_id = counterpart else y.workspace_id = counterpart end))
   order by c.created_at limit 1;
  if cid is not null and p_client_msg_id is not null then
    select m.id into existing from public.conversation_messages m where m.conversation_id = cid and m.client_msg_id = p_client_msg_id;
    if existing is not null then return jsonb_build_object('thread_id', cid, 'message_id', existing, 'duplicate', true, 'created', false); end if;
  end if;
  if cid is null then
    cid := public.start_conversation(v_kind, coalesce(nullif(trim(coalesce(p_subject, '')), ''), subj), counterpart_type, counterpart, p_body, p_as_workspace, ev, li, item);
    update public.conversations set context_key = key where id = cid and context_key is null;
    select m.id into mid from public.conversation_messages m where m.conversation_id = cid and m.sender_id = me order by m.created_at desc limit 1;
    if jsonb_array_length(coalesce(p_attachments, '[]')) > 0 then mid := public.post_message(cid, '', p_attachments, p_as_workspace); end if;
    created := true;
  else
    update public.conversations set context_key = key where id = cid and context_key is null;
    mid := public.post_message(cid, p_body, p_attachments, p_as_workspace);
  end if;
  if p_client_msg_id is not null then update public.conversation_messages set client_msg_id = p_client_msg_id where id = mid and client_msg_id is null; end if;
  -- Link a legacy build-item thread to the canonical conversation so the inbox shows one thread.
  if item is not null then
    insert into public.message_thread_links(thread_id, conversation_id)
      select t.id, cid from public.threads t where t.build_item_id = item and not exists (select 1 from public.message_thread_links l where l.conversation_id = cid) order by t.updated_at limit 1
    on conflict do nothing;
  end if;
  return jsonb_build_object('thread_id', cid, 'message_id', mid, 'duplicate', false, 'created', created);
end $$;
revoke all on function public.send_context_message(text, uuid, text, jsonb, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.send_context_message(text, uuid, text, jsonb, uuid, uuid, uuid, text) to authenticated;

-- 3. Notifications: categories, dedupe, notify() ---------------------------------------------------------------------------------
create table if not exists public.notification_categories (
  category text primary key,
  class text not null check (class in ('transactional','marketing')),
  mandatory boolean not null default false,          -- security/payments: always sent
  default_email boolean not null default true,
  description text not null default ''
);
insert into public.notification_categories(category, class, mandatory, default_email, description) values
  ('security', 'transactional', true, true, 'Sign-in, MFA and account security'),
  ('payments', 'transactional', true, true, 'Payments, payouts, refunds, invoices, disputes'),
  ('tickets', 'transactional', false, true, 'Tickets, transfers, waitlists'),
  ('quotes', 'transactional', false, true, 'Requests, quotes, holds and bookings'),
  ('messages', 'transactional', false, true, 'New messages'),
  ('reminders', 'transactional', false, true, 'Deadlines and reminders'),
  ('event_updates', 'transactional', false, true, 'Event changes and incidents'),
  ('newsletter', 'marketing', false, false, 'Gala Dock newsletter (double opt-in)'),
  ('product_updates', 'marketing', false, false, 'Product updates (double opt-in)')
on conflict (category) do update set class = excluded.class, mandatory = excluded.mandatory, description = excluded.description;
alter table public.notification_categories enable row level security;
revoke all on table public.notification_categories from public, anon, authenticated;
grant select on table public.notification_categories to authenticated;
grant all on table public.notification_categories to service_role;
drop policy if exists notification_categories_read on public.notification_categories;
create policy notification_categories_read on public.notification_categories for select to authenticated using (true);

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_key on public.notifications(dedupe_key) where dedupe_key is not null;

-- Service API (workers, db handlers). Returns the notification id (existing one on a replay). Marketing kinds are refused here:
-- marketing goes only to confirmed marketing_subscriptions (PECR), never through account notifications.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null, p_link text default null, p_dedupe_key text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if p_kind in ('newsletter','product_updates','marketing') then raise exception 'marketing_not_allowed' using errcode = '22023'; end if;
  if p_dedupe_key is not null then select id into nid from public.notifications where dedupe_key = p_dedupe_key; if nid is not null then return nid; end if; end if;
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key) values (p_user, left(p_kind, 60), left(p_title, 200), left(p_body, 2000), left(p_link, 500), p_dedupe_key)
    on conflict (dedupe_key) where dedupe_key is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.notifications where dedupe_key = p_dedupe_key; end if;
  return nid;
end $$;
revoke all on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, text, text) to service_role;

-- 4. Email suppression + provider events -------------------------------------------------------------------------------------------
create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('hard_bounce','complaint','manual','unsubscribed_all','invalid')),
  source text not null default 'resend', detail text, created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on table public.email_suppressions from public, anon, authenticated;
grant all on table public.email_suppressions to service_role;

create table if not exists public.email_events (
  id text primary key,                                -- provider webhook id (svix-id): replays are no-ops
  type text not null, email text, provider_id text, outbox_id uuid, detail text, received_at timestamptz not null default now()
);
alter table public.email_events enable row level security;
revoke all on table public.email_events from public, anon, authenticated;
grant all on table public.email_events to service_role;

create or replace function public.email_record_event(p_id text, p_type text, p_email text, p_provider_id text, p_detail text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text := lower(trim(coalesce(p_email, ''))); ob uuid; suppressed boolean := false;
begin
  insert into public.email_events(id, type, email, provider_id, detail) values (left(p_id, 120), left(p_type, 60), nullif(em, ''), left(p_provider_id, 120), left(p_detail, 300))
    on conflict (id) do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  select o.id into ob from public.email_outbox o where o.provider_id = p_provider_id limit 1;
  update public.email_events set outbox_id = ob where id = left(p_id, 120);
  if p_type in ('email.bounced','email.complained') and em <> '' then
    insert into public.email_suppressions(email, reason, detail) values (em, case when p_type = 'email.complained' then 'complaint' else 'hard_bounce' end, left(p_detail, 300))
      on conflict (email) do nothing;
    suppressed := true;
    update public.email_outbox set status = 'suppressed', last_error = left(p_type || coalesce(': ' || p_detail, ''), 200) where to_email = em and status in ('queued','failed');
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'email.suppressed', jsonb_build_object('type', p_type, 'outbox_id', ob));
  end if;
  return jsonb_build_object('duplicate', false, 'suppressed', suppressed, 'outbox_id', ob);
end $$;
revoke all on function public.email_record_event(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.email_record_event(text, text, text, text, text) to service_role;

-- 5. Marketing subscriptions (double opt-in) + public contact form --------------------------------------------------------------
create table if not exists public.marketing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  topic text not null check (topic in ('newsletter','product_updates')),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  consent_version text not null, source text not null default 'web', ip_hash text,
  requested_at timestamptz not null default now(), confirmed_at timestamptz, unsubscribed_at timestamptz,
  unique (email, topic)
);
create index if not exists marketing_subscriptions_token on public.marketing_subscriptions(token_hash);
alter table public.marketing_subscriptions enable row level security;
revoke all on table public.marketing_subscriptions from public, anon, authenticated;
grant all on table public.marketing_subscriptions to service_role;

create or replace function public.marketing_subscribe(p_email text, p_topic text, p_token_hash text, p_consent_version text, p_source text, p_ip_hash text, p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text := lower(trim(p_email)); r public.marketing_subscriptions; recent integer;
begin
  if p_topic not in ('newsletter','product_updates') then raise exception 'invalid_topic' using errcode = '22023'; end if;
  select count(*) into recent from public.marketing_subscriptions where ip_hash = p_ip_hash and requested_at > now() - interval '1 hour';
  if p_ip_hash is not null and recent >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;
  select * into r from public.marketing_subscriptions where email = em and topic = p_topic;
  if r.status = 'confirmed' then return jsonb_build_object('status', 'confirmed', 'send_confirmation', false); end if;
  insert into public.marketing_subscriptions(email, topic, user_id, token_hash, consent_version, source, ip_hash)
    values (em, p_topic, p_user, p_token_hash, left(p_consent_version, 40), left(p_source, 60), p_ip_hash)
  on conflict (email, topic) do update set status = 'pending', token_hash = excluded.token_hash, consent_version = excluded.consent_version,
    requested_at = now(), unsubscribed_at = null, user_id = coalesce(public.marketing_subscriptions.user_id, excluded.user_id)
  returning * into r;
  return jsonb_build_object('status', r.status, 'send_confirmation', true, 'id', r.id);
end $$;
create or replace function public.marketing_confirm(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.marketing_subscriptions;
begin
  update public.marketing_subscriptions set status = 'confirmed', confirmed_at = now()
   where token_hash = p_token_hash and status = 'pending' and requested_at > now() - interval '7 days' returning * into r;
  if r.id is null then select * into r from public.marketing_subscriptions where token_hash = p_token_hash; end if;
  if r.id is null then return jsonb_build_object('ok', false, 'status', 'unknown'); end if;
  return jsonb_build_object('ok', r.status = 'confirmed', 'status', r.status, 'topic', r.topic);
end $$;
create or replace function public.marketing_unsubscribe(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.marketing_subscriptions;
begin
  update public.marketing_subscriptions set status = 'unsubscribed', unsubscribed_at = now() where token_hash = p_token_hash and status <> 'unsubscribed' returning * into r;
  if r.id is null then select * into r from public.marketing_subscriptions where token_hash = p_token_hash; end if;
  return jsonb_build_object('ok', r.id is not null, 'status', coalesce(r.status, 'unknown'));
end $$;
revoke all on function public.marketing_subscribe(text, text, text, text, text, text, uuid), public.marketing_confirm(text), public.marketing_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.marketing_subscribe(text, text, text, text, text, text, uuid), public.marketing_confirm(text), public.marketing_unsubscribe(text) to service_role;

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('GD-C-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  name text not null check (length(name) between 1 and 120), email text not null check (email = lower(email)),
  topic text not null check (topic in ('general','sales','support','partnerships','press','privacy')),
  message text not null check (length(message) between 10 and 5000),
  user_id uuid references auth.users(id) on delete set null, ip_hash text, status text not null default 'new' check (status in ('new','triaged','closed','spam')),
  created_at timestamptz not null default now()
);
create index if not exists contact_submissions_ip on public.contact_submissions(ip_hash, created_at);
alter table public.contact_submissions enable row level security;
revoke all on table public.contact_submissions from public, anon, authenticated;
grant select on table public.contact_submissions to authenticated;
grant all on table public.contact_submissions to service_role;
drop policy if exists contact_submissions_admin on public.contact_submissions;
create policy contact_submissions_admin on public.contact_submissions for select to authenticated using (public.has_admin_permission('support'));

create or replace function public.contact_submit(p_name text, p_email text, p_topic text, p_message text, p_ip_hash text, p_user uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare ref text; n integer;
begin
  select count(*) into n from public.contact_submissions where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if p_ip_hash is not null and n >= 5 then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.contact_submissions(name, email, topic, message, user_id, ip_hash)
    values (left(trim(p_name), 120), lower(trim(p_email)), p_topic, trim(p_message), p_user, p_ip_hash) returning reference into ref;
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select a.user_id, 'support.contact', 'New contact form message (' || p_topic || ')', left(trim(p_message), 160), '/admin/support', 'contact:' || ref || ':' || a.user_id
      from public.platform_admins a where a.permissions && array['support'];
  return ref;
end $$;
revoke all on function public.contact_submit(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.contact_submit(text, text, text, text, text, uuid) to service_role;

-- Retry/dedupe for notification fan-out from domain events: app job kind (consumer inbox drops replays).
insert into public.job_kinds(kind, runtime, handler, max_attempts, description) values
  ('notifications.send', 'app', null, 5, 'Q05: deliver one notification (dedupe_key → exactly one row; email via the outbox trigger)')
on conflict (kind) do update set runtime = excluded.runtime, max_attempts = excluded.max_attempts, description = excluded.description, updated_at = now();
