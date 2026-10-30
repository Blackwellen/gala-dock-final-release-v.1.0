-- Q27 platform affiliates / strategic partners: consent-gated ?ref= attribution, qualified sign-ups and subscriptions, versioned
-- commission on every earning, per-partner statements, ledger memo postings in the platform-affiliate account family, and
-- cross-account self-referral checks (fraud checks only: no profiling, nothing kept beyond what the check needs).
-- Additive; nothing here runs for existing users unless they sign up through a partner link after this migration.

-- ── Clicks (anonymous, consent-gated in the app; visitor = SHA-256 of ip|ua|salt, raw IP never stored) ──────────────────────
create table if not exists public.partner_clicks (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  channel text not null default 'link' check (channel = any (array['link','qr','instagram','tiktok','facebook','x','linkedin','whatsapp','email','other'])),
  landing text not null default '/' check (length(landing) <= 120),
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists partner_clicks_partner on public.partner_clicks(partner_id, created_at desc);
alter table public.partner_clicks enable row level security;
revoke all on public.partner_clicks from anon, authenticated;
grant select on public.partner_clicks to authenticated;
drop policy if exists partner_clicks_read on public.partner_clicks;
create policy partner_clicks_read on public.partner_clicks for select to authenticated using (public.owns_partner(partner_id) or public.has_admin_permission('partners'));

create or replace function public.partner_track_click(p_code text, p_visitor text, p_channel text default 'link', p_landing text default '/')
returns table(code text, counted boolean) language plpgsql security definer set search_path = '' as $$
declare p public.partners; v_counted boolean := false;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{2,32}$' or p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then return; end if;
  select * into p from public.partners x where upper(x.referral_code) = upper(p_code) and x.status = 'active';
  if p.id is null then return; end if;
  if public.hit_rate_limit('partner:visitor:' || p_visitor, 60, 3600) and public.hit_rate_limit('partner:click:' || p.id || ':' || p_visitor, 1, 1800) then
    insert into public.partner_clicks(partner_id, channel, landing, visitor_hash)
      values (p.id, case when p_channel = any (array['link','qr','instagram','tiktok','facebook','x','linkedin','whatsapp','email','other']) then p_channel else 'other' end,
              left(coalesce(nullif(p_landing, ''), '/'), 120), p_visitor);
    v_counted := true;
  end if;
  return query select p.referral_code::text, v_counted;
end $$;
revoke all on function public.partner_track_click(text, text, text, text) from public;
grant execute on function public.partner_track_click(text, text, text, text) to anon, authenticated, service_role;

-- ── Attribution of a NEW account to a partner (service-only table) ───────────────────────────────────────────────────────────
create table if not exists public.partner_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  channel text not null default 'link',
  visitor_hash text check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'signed_up' check (status in ('signed_up','qualified','rejected')),
  rejection_reason text check (rejection_reason is null or rejection_reason in ('self_referral','same_email_domain','same_device','same_payment_fingerprint','partner_inactive')),
  referral_id uuid references public.partner_referrals(id) on delete set null,
  payment_fingerprint text,
  created_at timestamptz not null default now(),
  qualified_at timestamptz
);
create index if not exists partner_attributions_partner on public.partner_attributions(partner_id, created_at desc);
alter table public.partner_attributions enable row level security;
revoke all on public.partner_attributions from anon, authenticated;

-- Public email providers: a shared domain there says nothing about common control.
create or replace function public.partner_public_email_domain(p_domain text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(coalesce(p_domain, '')) = any (array['gmail.com','googlemail.com','outlook.com','hotmail.com','hotmail.co.uk','live.com','live.co.uk','msn.com',
    'yahoo.com','yahoo.co.uk','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com','gmx.co.uk','mail.com','btinternet.com','sky.com',
    'virginmedia.com','talktalk.net','zoho.com','yandex.com','fastmail.com','pm.me']);
$$;

create or replace function public.partner_link_referral(p_attr uuid, p_workspace uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.partner_attributions; w public.workspaces; r uuid;
begin
  select * into a from public.partner_attributions where id = p_attr;
  select * into w from public.workspaces where id = p_workspace;
  if a.id is null or w.id is null or a.status = 'rejected' or a.referral_id is not null then return a.referral_id; end if;
  insert into public.partner_referrals(partner_id, workspace_id, name, kind, status)
    values (a.partner_id, w.id, left(coalesce(nullif(w.name, ''), 'New workspace'), 160),
            case when w.kind = 'organizer' then 'organiser' when 'venue' = any(coalesce(w.capabilities, '{}')) then 'venue' else 'supplier' end, 'pending')
    returning id into r;
  update public.partner_attributions set referral_id = r where id = a.id;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', w.id, 'partner.referral_signed_up',
    jsonb_build_object('partner_id', a.partner_id, 'referral_id', r, 'channel', a.channel));
  return r;
end $$;
revoke all on function public.partner_link_referral(uuid, uuid) from public, anon, authenticated;

-- Called by the signed-in user's own session (auth callback) with the consented gd_partner cookie. Only accounts created in the
-- last 30 days can be attributed, once. Self-referral checks: same account, same non-public email domain as the partner, or the
-- same device already attributed another account to this partner. Rejected attributions earn nothing and are audited.
create or replace function public.partner_attribute_signup(p_code text, p_channel text default 'link', p_visitor text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); u record; p public.partners; pemail text; reason text; a public.partner_attributions; ws uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{2,32}$' then return jsonb_build_object('attributed', false, 'reason', 'invalid_code'); end if;
  select * into a from public.partner_attributions where user_id = uid;
  if a.id is not null then return jsonb_build_object('attributed', a.status <> 'rejected', 'status', a.status, 'existing', true); end if;
  select id, email, created_at into u from auth.users where id = uid;
  if u.created_at < now() - interval '30 days' then return jsonb_build_object('attributed', false, 'reason', 'existing_account'); end if;
  select * into p from public.partners x where upper(x.referral_code) = upper(p_code);
  if p.id is null then return jsonb_build_object('attributed', false, 'reason', 'unknown_code'); end if;
  select email into pemail from auth.users where id = p.user_id;
  reason := case
    when p.status <> 'active' then 'partner_inactive'
    when p.user_id = uid then 'self_referral'
    when pemail is not null and split_part(lower(pemail), '@', 2) = split_part(lower(u.email), '@', 2) and not public.partner_public_email_domain(split_part(u.email, '@', 2)) then 'same_email_domain'
    when p_visitor ~ '^[0-9a-f]{64}$' and exists (select 1 from public.partner_attributions x where x.partner_id = p.id and x.visitor_hash = p_visitor) then 'same_device'
    else null end;
  insert into public.partner_attributions(user_id, partner_id, channel, visitor_hash, status, rejection_reason)
    values (uid, p.id, case when p_channel = any (array['link','qr','instagram','tiktok','facebook','x','linkedin','whatsapp','email','other']) then p_channel else 'other' end,
            case when p_visitor ~ '^[0-9a-f]{64}$' then p_visitor end, case when reason is null then 'signed_up' else 'rejected' end, reason)
    returning * into a;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (uid, 'user', case when reason is null then 'partner.attributed' else 'partner.attribution_rejected' end,
    jsonb_build_object('partner_id', p.id, 'channel', a.channel, 'reason', reason));
  if reason is null then
    select w.id into ws from public.workspaces w where w.owner_id = uid order by w.created_at limit 1;
    if ws is not null then perform public.partner_link_referral(a.id, ws); end if;
  end if;
  return jsonb_build_object('attributed', reason is null, 'status', a.status, 'reason', reason);
end $$;
revoke all on function public.partner_attribute_signup(text, text, text) from public, anon;
grant execute on function public.partner_attribute_signup(text, text, text) to authenticated;

-- A workspace created by an attributed user becomes the partner's referral (pending until it pays). Never blocks workspace creation.
create or replace function public.trg_partner_workspace_referral()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
  select id into a from public.partner_attributions where user_id = new.owner_id and status = 'signed_up' and referral_id is null;
  if a is not null then perform public.partner_link_referral(a, new.id); end if;
  return null;
exception when others then
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', new.id, 'partner.referral_link_failed', jsonb_build_object('error', left(sqlerrm, 200)));
  return null;
end $$;
drop trigger if exists gd_partner_workspace_referral on public.workspaces;
create trigger gd_partner_workspace_referral after insert on public.workspaces for each row execute function public.trg_partner_workspace_referral();

-- ── Earnings: rule snapshot, source invoice, ledger memo ────────────────────────────────────────────────────────────────────
alter table public.partner_earnings
  add column if not exists source_invoice text,
  add column if not exists commission_rule_id uuid references public.partner_commission_rules(id) on delete set null,
  add column if not exists commission_rule_version integer,
  add column if not exists commission_bps integer,
  add column if not exists reversed_at timestamptz;
create unique index if not exists partner_earnings_source_invoice on public.partner_earnings(source_invoice) where source_invoice is not null;

create or replace function public.trg_partner_earning_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.partner_commission_rules;
begin
  if new.commission_rule_id is null then
    select * into r from public.partner_commission_rules x where x.partner_id = new.partner_id order by x.version desc limit 1;
    new.commission_rule_id := r.id; new.commission_rule_version := r.version; new.commission_bps := coalesce(new.commission_bps, r.commission_bps);
  end if;
  return new;
end $$;
drop trigger if exists partner_earning_snapshot on public.partner_earnings;
create trigger partner_earning_snapshot before insert on public.partner_earnings for each row execute function public.trg_partner_earning_snapshot();

create or replace function public.partner_post_memo(p_earning uuid, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.partner_earnings; c bigint; sign int := case when p_kind = 'reversal' then -1 else 1 end;
begin
  select * into e from public.partner_earnings where id = p_earning;
  c := round(coalesce(e.commission, 0) * 100);
  if e.id is null or c = 0 then return null; end if;
  if p_kind = 'reversal' then perform public.partner_post_memo(p_earning, 'accrual'); end if;
  return public.post_memo_ledger_transaction('partner:' || p_kind || ':' || e.id, 'affiliate_commission', 'GBP',
    jsonb_build_array(
      jsonb_build_object('account', 'platform_affiliate_commission', 'party_type', 'platform', 'amount_minor', sign * c),
      jsonb_build_object('account', 'affiliate_payable', 'party_type', 'partner', 'party_id', e.partner_id, 'amount_minor', -sign * c)),
    'platform_obligation_memo', null, null, 'partner_earning', e.id::text,
    case when p_kind = 'reversal' then 'Platform affiliate commission reversed' else 'Platform affiliate commission owed by Gala Dock (memo)' end);
end $$;
revoke all on function public.partner_post_memo(uuid, text) from public, anon, authenticated;

create or replace function public.trg_partner_earning_ledger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status <> 'reversed' then perform public.partner_post_memo(new.id, 'accrual');
  elsif tg_op = 'UPDATE' and new.status = 'reversed' and old.status <> 'reversed' then perform public.partner_post_memo(new.id, 'reversal');
  end if;
  return null;
end $$;
drop trigger if exists partner_earning_ledger on public.partner_earnings;
create trigger partner_earning_ledger after insert or update of status on public.partner_earnings for each row execute function public.trg_partner_earning_ledger();

-- Statement totals always equal the non-reversed earnings assigned to them.
create or replace function public.partner_statement_recompute(p_statement uuid)
returns void language sql security definer set search_path = '' as $$
  update public.partner_statements s set
    eligible_revenue = coalesce((select sum(e.eligible_revenue) from public.partner_earnings e where e.statement_id = s.id and e.status <> 'reversed'), 0),
    commission = coalesce((select sum(e.commission) from public.partner_earnings e where e.statement_id = s.id and e.status <> 'reversed'), 0)
  where s.id = p_statement;
$$;
revoke all on function public.partner_statement_recompute(uuid) from public, anon, authenticated;

-- ── Qualification: a paid subscription invoice of an attributed workspace earns commission (Q28 billing) ────────────────────────
create or replace function public.partner_qualify_invoice(p_invoice text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.subscription_invoices; r public.partner_referrals; a public.partner_attributions; p public.partners; rule public.partner_commission_rules;
  eligible numeric; comm numeric; v uuid; months int;
begin
  select * into i from public.subscription_invoices where stripe_invoice_id = p_invoice;
  if i.stripe_invoice_id is null or i.status <> 'paid' or coalesce(i.amount_paid, 0) <= 0 then return null; end if;
  if exists (select 1 from public.partner_earnings where source_invoice = p_invoice) then return null; end if;
  select x.* into a from public.partner_attributions x join public.partner_referrals rr on rr.id = x.referral_id where rr.workspace_id = i.workspace_id and x.status <> 'rejected' limit 1;
  if a.id is null then return null; end if;
  select * into r from public.partner_referrals where id = a.referral_id;
  select * into p from public.partners where id = a.partner_id;
  if p.status <> 'active' then return null; end if;
  -- Same payment fingerprint as the partner's own billing (when the billing layer has recorded one) → self-referral.
  if a.payment_fingerprint is not null and a.payment_fingerprint = nullif(p.details ->> 'payment_fingerprint', '') then
    update public.partner_attributions set status = 'rejected', rejection_reason = 'same_payment_fingerprint' where id = a.id;
    insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.attribution_rejected', jsonb_build_object('partner_id', p.id, 'reason', 'same_payment_fingerprint'));
    return null;
  end if;
  months := coalesce(nullif(p.details ->> 'commission_months', '')::int, 12);
  if a.created_at < now() - make_interval(months => months) then return null; end if;
  select * into rule from public.partner_commission_rules x where x.partner_id = p.id order by x.version desc limit 1;
  eligible := round(i.amount_paid / 100.0, 2);   -- subscription invoice total as paid (VAT-inclusive until the invoice tax amount is stored)
  if rule.basis = 'fixed_bounty' then
    if exists (select 1 from public.partner_earnings where referral_id = r.id and status <> 'reversed') then return null; end if;
    comm := coalesce(nullif(p.details ->> 'bounty_gbp', '')::numeric, 0);
  else
    comm := round(eligible * rule.commission_bps / 10000.0, 2);
  end if;
  insert into public.partner_earnings(partner_id, referral_id, occurred_at, eligible_revenue, commission, status, source_invoice, commission_rule_id, commission_rule_version, commission_bps)
    values (p.id, r.id, now(), eligible, comm, 'pending', p_invoice, rule.id, rule.version, rule.commission_bps) returning id into v;
  update public.partner_referrals set status = 'active', activated_at = coalesce(activated_at, now()) where id = r.id and status in ('pending','trial');
  update public.partner_attributions set status = 'qualified', qualified_at = coalesce(qualified_at, now()) where id = a.id;
  update public.partners set referrals = (select count(*) from public.partner_referrals where partner_id = p.id),
    eligible_revenue = eligible_revenue + eligible, earned = earned + comm where id = p.id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_accrued',
    jsonb_build_object('partner_id', p.id, 'earning_id', v, 'invoice', p_invoice, 'rule_version', rule.version, 'commission', comm));
  return v;
end $$;
revoke all on function public.partner_qualify_invoice(text) from public, anon, authenticated;

-- Reversal of an earning whose invoice is voided after payment (or by admin). Paid earnings stay paid (statement already settled).
create or replace function public.partner_reverse_earning(p_earning uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare e public.partner_earnings;
begin
  select * into e from public.partner_earnings where id = p_earning for update;
  if e.id is null or e.status in ('reversed','paid') then return false; end if;
  update public.partner_earnings set status = 'reversed', reversed_at = now() where id = e.id;
  if e.statement_id is not null then perform public.partner_statement_recompute(e.statement_id); end if;
  update public.partners set earned = greatest(earned - e.commission, 0), eligible_revenue = greatest(eligible_revenue - e.eligible_revenue, 0) where id = e.partner_id;
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'partner.earning_reversed', jsonb_build_object('earning_id', e.id, 'partner_id', e.partner_id, 'reason', left(coalesce(p_reason, ''), 120)));
  return true;
end $$;
revoke all on function public.partner_reverse_earning(uuid, text) from public, anon, authenticated;

create or replace function public.trg_partner_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e uuid;
begin
  if new.status = 'paid' then perform public.partner_qualify_invoice(new.stripe_invoice_id);
  elsif tg_op = 'UPDATE' and new.status in ('void','uncollectible') and old.status = 'paid' then
    select id into e from public.partner_earnings where source_invoice = new.stripe_invoice_id;
    if e is not null then perform public.partner_reverse_earning(e, 'invoice_' || new.status); end if;
  end if;
  return null;
exception when others then   -- billing must never fail because of affiliate accounting; the failure is audited for ops
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', new.workspace_id, 'partner.qualify_failed', jsonb_build_object('invoice', new.stripe_invoice_id, 'error', left(sqlerrm, 200)));
  return null;
end $$;
drop trigger if exists gd_partner_invoice on public.subscription_invoices;
create trigger gd_partner_invoice after insert or update of status, amount_paid on public.subscription_invoices for each row execute function public.trg_partner_invoice();

-- ── Statements (monthly; service job) and settlement (admin) ────────────────────────────────────────────────────────────────
create or replace function public.partner_build_statements(p_month date)
returns integer language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', p_month)::date; s record; st uuid; n int := 0;
begin
  for s in select distinct partner_id from public.partner_earnings
           where statement_id is null and status = 'pending' and occurred_at >= m and occurred_at < (m + interval '1 month') loop
    insert into public.partner_statements(partner_id, period_start, status, payout_due) values (s.partner_id, m, 'open', (m + interval '2 months' - interval '1 day')::date)
      on conflict (partner_id, period_start) do nothing;
    select id into st from public.partner_statements where partner_id = s.partner_id and period_start = m and status in ('open','pending');
    if st is null then continue; end if;   -- that month is already settled or on hold; earnings wait for an admin decision
    update public.partner_earnings set statement_id = st, status = 'cleared'
      where partner_id = s.partner_id and statement_id is null and status = 'pending' and occurred_at >= m and occurred_at < (m + interval '1 month');
    perform public.partner_statement_recompute(st);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.partner_build_statements(date) from public, anon, authenticated;

create or replace function public.admin_partner_statement_paid(p_statement uuid, p_reference text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare st public.partner_statements; c bigint;
begin
  perform public.admin_require('partners', p_reason);
  select * into st from public.partner_statements where id = p_statement for update;
  if st.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if st.status not in ('open','pending') then raise exception 'invalid_state' using errcode = '55000'; end if;
  if length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
  perform public.partner_statement_recompute(st.id);
  perform public.partner_post_memo(e.id, 'accrual') from public.partner_earnings e where e.statement_id = st.id and e.status <> 'reversed';
  update public.partner_earnings set status = 'paid' where statement_id = st.id and status <> 'reversed';
  update public.partner_statements set status = 'paid', paid_at = now(), reference = left(p_reference, 120) where id = st.id returning * into st;
  update public.partners set paid = paid + st.commission where id = st.partner_id;
  c := round(st.commission * 100);
  if c > 0 then
    perform public.post_memo_ledger_transaction('partner:statement:' || st.id || ':paid', 'affiliate_commission', 'GBP',
      jsonb_build_array(
        jsonb_build_object('account', 'affiliate_payable', 'party_type', 'partner', 'party_id', st.partner_id, 'amount_minor', c),
        jsonb_build_object('account', 'platform_affiliate_settled', 'party_type', 'platform', 'amount_minor', -c)),
      'platform_obligation_memo', null, null, 'partner_statement', st.id::text, 'Partner statement settled by Gala Dock (memo)', null, 'admin');
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'admin.partner_statement_paid',
    jsonb_build_object('statement_id', st.id, 'partner_id', st.partner_id, 'commission', st.commission, 'reference', left(p_reference, 120), 'reason', p_reason));
end $$;
revoke all on function public.admin_partner_statement_paid(uuid, text, text) from public, anon;
grant execute on function public.admin_partner_statement_paid(uuid, text, text) to authenticated;
