-- Q74 legal engineering (owner legal decisions Q54, 2026-11-14: D4, D5, D7, D8, D10, D15 + EU VAT under D2/D6).
-- AI-drafted engineering of legal positions, not legal or tax advice. Items marked (verify) wait for counsel / the tax adviser.
-- Additive only: new tables, new functions, CREATE OR REPLACE with unchanged signatures, new triggers, catalogue rows.
--
--  1. Sanctions (D4). public.sanctioned_jurisdictions — the maintained list (mirror of src/lib/legal/sanctions.ts; source + date per
--     row). Refused: a sanctioned business country on a workspace (sign-up/onboarding country, settings), publishing a listing or an
--     event for such a workspace, a partner application from such a country. Payout set-up, checkout (request country) and sign-up
--     are refused in the app (same list). Admin override: public.sanctions_overrides via admin_sanctions_override_set (trust, aal2,
--     reason required, audited). Billing countries seen by Stripe are recorded as compliance signals (staff alert).
--  2. UK platform reporting (D7; Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023, SI 2023/817 (verify)).
--     public.seller_tax_profiles (sensitive: no table grants, RPC access only, masked reads), due-diligence requests (initial + two
--     reminders), automatic payout hold after the reminders and 60 days (public.tax_reporting_holds, read by dec107_payouts_paused),
--     annual report rows for admin export, retention rows (disabled, legal review).
--  3. EU VAT readiness. Commission VAT by seller country (fee_vat_treatment): UK VAT for UK sellers; reverse charge for non-UK
--     business sellers (VAT number shown on statements). Booking-fee VAT unchanged (TODO, tax adviser). Business details for plans and
--     credit packs (D15: business-only) in public.workspace_billing_details. Compliance signals for Stripe Tax not_collecting sales.
--  4. Insurance minimums (D10): £1m standard; £2m for higher-risk categories (Security, AV & Production incl. staging/rigging/special
--     effects, Marquees & temporary structures). Mirror: src/lib/trust/insurance.ts.
--  5. Payout pause grounds (D5): payout_eligible() follows dec107_payouts_paused() (pauses, trust suspension, tax-reporting hold) and no
--     longer an automatic risk hold. Resale refunds to the original ticket holder are no longer held by an automatic risk hold.
--  6. Report (D8, OSA s.20): public.content_reports + report_content() for listings, events, reviews and business profiles; messages
--     keep the messaging lane's public.message_reports (202611149631). admin_moderation_queue() merges both + legacy review_reports.
-- Rollback: drop the new triggers (sanctions_*, *_fee_vat triggers unchanged), re-run the previous definitions of
-- trg_checkout_order_vat / trg_payment_order_vat (202610280020), payout_eligible / dec107_payouts_paused (202611146802),
-- claim_resale_refund(s) (202610294019 lines); the new tables are inert without their callers.

-- ═══ 1. Sanctions ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.sanctioned_jurisdictions (
  code text primary key check (code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  name text not null,
  kind text not null check (kind in ('country','region')),
  regimes text[] not null default '{}',
  note text not null default '',
  checked_on date not null,
  source_url text not null,
  active boolean not null default true
);
comment on table public.sanctioned_jurisdictions is 'Comprehensively sanctioned countries/regions Gala Dock refuses (owner decision D4). Mirror of src/lib/legal/sanctions.ts; review monthly and on every OFSI/EU/OFAC change.';
alter table public.sanctioned_jurisdictions enable row level security;
drop policy if exists sanctioned_jurisdictions_read on public.sanctioned_jurisdictions;
create policy sanctioned_jurisdictions_read on public.sanctioned_jurisdictions for select to anon, authenticated using (true);
grant select on public.sanctioned_jurisdictions to anon, authenticated;

-- Sources checked 2026-11-14: UK OFSI consolidated list and UK sanctions regimes (gov.uk/government/collections/uk-sanctions-regimes),
-- EU Sanctions Map (sanctionsmap.eu), US OFAC sanctions programs (ofac.treasury.gov/sanctions-programs-and-country-information) and
-- Stripe's restricted-territory list (stripe.com/legal/restricted-businesses). Russia and Belarus are extensive (not comprehensive)
-- UK/EU regimes; listed by owner policy (same as Gigvora). Syria: UK/EU/US eased in 2025 — kept pending counsel (verify).
-- Zaporizhzhia and Kherson: only the non-government-controlled areas are sanctioned, which a region code can't separate — not listed;
-- handled by manual review (verify with counsel).
insert into public.sanctioned_jurisdictions (code, name, kind, regimes, note, checked_on, source_url) values
  ('CU', 'Cuba', 'country', '{US}', 'US comprehensive embargo (CACR); card networks/Stripe restrict', '2026-11-14', 'https://ofac.treasury.gov/sanctions-programs-and-country-information'),
  ('IR', 'Iran', 'country', '{UK,EU,US,UN}', 'Comprehensive US; extensive UK/EU', '2026-11-14', 'https://www.gov.uk/government/collections/uk-sanctions-regimes'),
  ('KP', 'North Korea', 'country', '{UK,EU,US,UN}', 'Comprehensive', '2026-11-14', 'https://www.gov.uk/government/collections/uk-sanctions-regimes'),
  ('SY', 'Syria', 'country', '{UK,EU,US}', 'Eased in 2025 by UK/EU/US; kept pending counsel (verify)', '2026-11-14', 'https://www.sanctionsmap.eu'),
  ('RU', 'Russia', 'country', '{UK,EU,US}', 'Extensive UK/EU/US regimes; Stripe unavailable; owner policy', '2026-11-14', 'https://www.gov.uk/government/collections/uk-sanctions-regimes'),
  ('BY', 'Belarus', 'country', '{UK,EU,US}', 'Extensive UK/EU/US regimes; owner policy', '2026-11-14', 'https://www.gov.uk/government/collections/uk-sanctions-regimes'),
  ('UA-43', 'Crimea', 'region', '{UK,EU,US}', 'Comprehensive territorial sanctions', '2026-11-14', 'https://www.sanctionsmap.eu'),
  ('UA-40', 'Sevastopol', 'region', '{UK,EU,US}', 'Comprehensive territorial sanctions', '2026-11-14', 'https://www.sanctionsmap.eu'),
  ('UA-14', 'Donetsk region (non-government controlled)', 'region', '{UK,EU,US}', 'Comprehensive territorial sanctions; whole region blocked automatically (verify)', '2026-11-14', 'https://www.sanctionsmap.eu'),
  ('UA-09', 'Luhansk region (non-government controlled)', 'region', '{UK,EU,US}', 'Comprehensive territorial sanctions; whole region blocked automatically (verify)', '2026-11-14', 'https://www.sanctionsmap.eu')
on conflict (code) do update set name = excluded.name, kind = excluded.kind, regimes = excluded.regimes, note = excluded.note,
  checked_on = excluded.checked_on, source_url = excluded.source_url;

-- Country names (master data / settings) or ISO-2 → ISO-2; null when unknown. Same resolution as workspace_business_country().
create or replace function public.resolve_country_code(p_value text) returns text
language sql stable security definer set search_path = '' as $$
  with v as (select nullif(trim(coalesce(p_value, '')), '') val)
  select coalesce(
    (select r.code from public.ref_countries r, v where r.code = upper(v.val) or lower(r.name) = lower(v.val) limit 1),
    (select c.code from public.connect_supported_countries c, v where c.code = upper(v.val) or lower(c.name) = lower(v.val) limit 1),
    (select s.code from public.sanctioned_jurisdictions s, v where s.kind = 'country' and lower(s.name) = lower(v.val) limit 1),
    (select upper(v.val) from v where v.val ~ '^[A-Za-z]{2}$'))
$$;

-- Same signature and order as 202611146101; also resolves sanctioned country names ("Russia") so the gate can't be sidestepped by name.
create or replace function public.workspace_business_country(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.resolve_country_code((select coalesce(w.settings->'organisation'->>'country', w.settings->'business'->>'country', w.settings->>'country')
                                      from public.workspaces w where w.id = p_workspace));
$$;

-- p_region: ISO 3166-2 subdivision, with or without the country prefix (Vercel sends "43" for UA-43).
create or replace function public.is_sanctioned_jurisdiction(p_country text, p_region text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sanctioned_jurisdictions s where s.active and (
    s.code = upper(trim(coalesce(p_country, '')))
    or (p_region is not null and s.code = upper(trim(p_country)) || '-' || upper(regexp_replace(trim(p_region), '^[A-Za-z]{2}-', '')))));
$$;

create table if not exists public.sanctions_overrides (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('workspace','user')),
  subject_id uuid not null,
  reason text not null check (length(trim(reason)) >= 10 and length(reason) <= 1000),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);
create index if not exists sanctions_overrides_subject_idx on public.sanctions_overrides(subject_type, subject_id) where revoked_at is null;
alter table public.sanctions_overrides enable row level security;
revoke all on table public.sanctions_overrides from public, anon, authenticated;
drop policy if exists sanctions_overrides_admin_read on public.sanctions_overrides;
create policy sanctions_overrides_admin_read on public.sanctions_overrides for select to authenticated using (public.has_admin_permission('trust'));
grant select on table public.sanctions_overrides to authenticated;
grant all on table public.sanctions_overrides to service_role;

create or replace function public.sanctions_override_active(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sanctions_overrides o where o.subject_type = p_type and o.subject_id = p_id
    and o.revoked_at is null and (o.expires_at is null or o.expires_at > now()));
$$;

-- True when the workspace's business country is sanctioned and no override is active.
create or replace function public.workspace_sanctioned(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_sanctioned_jurisdiction(public.workspace_business_country(p_workspace)), false)
     and not public.sanctions_override_active('workspace', p_workspace);
$$;

-- Admin override (trust permission; has_admin_permission requires aal2). Audited, never silent. p_active=false revokes.
create or replace function public.admin_sanctions_override_set(p_type text, p_id uuid, p_active boolean, p_reason text, p_expires timestamptz default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); oid uuid;
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_type not in ('workspace','user') then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_active then
    insert into public.sanctions_overrides(subject_type, subject_id, reason, granted_by, expires_at) values (p_type, p_id, left(trim(p_reason), 1000), me, p_expires) returning id into oid;
  else
    update public.sanctions_overrides set revoked_at = now(), revoked_by = me where subject_type = p_type and subject_id = p_id and revoked_at is null returning id into oid;
  end if;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (me, 'admin', case when p_type = 'workspace' then p_id end,
    case when p_active then 'sanctions.override_granted' else 'sanctions.override_revoked' end,
    jsonb_build_object('subject_type', p_type, 'subject_id', p_id, 'override_id', oid, 'reason', left(trim(p_reason), 500), 'expires_at', p_expires));
  return oid;
end $$;

create or replace function public.sanctions_refusal_hint(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select 'Gala Dock can’t be used for businesses or sales in ' || coalesce((select name from public.sanctioned_jurisdictions where code = upper(p_code)), upper(p_code))
    || ' because of UK, EU, UN or US sanctions. If you think this is wrong, contact support.';
$$;

-- Workspace business country (onboarding / settings): refuse a sanctioned country when it is set or changed.
create or replace function public.guard_sanctioned_workspace_country() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text; prev text;
begin
  c := public.resolve_country_code(coalesce(new.settings->'organisation'->>'country', new.settings->'business'->>'country', new.settings->>'country'));
  if c is null or not public.is_sanctioned_jurisdiction(c) then return new; end if;
  if tg_op = 'UPDATE' then
    prev := public.resolve_country_code(coalesce(old.settings->'organisation'->>'country', old.settings->'business'->>'country', old.settings->>'country'));
    if prev is not distinct from c then return new; end if;
  end if;
  if public.sanctions_override_active('workspace', new.id) then return new; end if;
  raise exception 'sanctioned_jurisdiction' using errcode = '22023', hint = public.sanctions_refusal_hint(c);
end $$;
drop trigger if exists sanctions_workspace_country on public.workspaces;
create trigger sanctions_workspace_country before insert or update of settings on public.workspaces
  for each row execute function public.guard_sanctioned_workspace_country();

create or replace function public.guard_sanctioned_listing_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.published and (tg_op = 'INSERT' or not coalesce(old.published, false) or new.workspace_id is distinct from old.workspace_id)
     and new.workspace_id is not null and public.workspace_sanctioned(new.workspace_id) then
    raise exception 'sanctioned_jurisdiction' using errcode = '22023', hint = public.sanctions_refusal_hint(public.workspace_business_country(new.workspace_id));
  end if;
  return new;
end $$;
drop trigger if exists sanctions_listing_publish on public.listings;
create trigger sanctions_listing_publish before insert or update of published, workspace_id on public.listings
  for each row execute function public.guard_sanctioned_listing_publish();

create or replace function public.guard_sanctioned_event_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published','on_sale') and (tg_op = 'INSERT' or old.status not in ('published','on_sale'))
     and new.workspace_id is not null and public.workspace_sanctioned(new.workspace_id) then
    raise exception 'sanctioned_jurisdiction' using errcode = '22023', hint = public.sanctions_refusal_hint(public.workspace_business_country(new.workspace_id));
  end if;
  return new;
end $$;
drop trigger if exists sanctions_event_publish on public.events;
create trigger sanctions_event_publish before insert or update of status on public.events
  for each row execute function public.guard_sanctioned_event_publish();

create or replace function public.guard_sanctioned_partner_application() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_sanctioned_jurisdiction(new.country) and not public.sanctions_override_active('user', new.user_id) then
    raise exception 'sanctioned_jurisdiction' using errcode = '22023', hint = public.sanctions_refusal_hint(new.country);
  end if;
  return new;
end $$;
drop trigger if exists sanctions_partner_application on public.partner_applications;
create trigger sanctions_partner_application before insert on public.partner_applications
  for each row execute function public.guard_sanctioned_partner_application();

revoke all on function public.resolve_country_code(text), public.is_sanctioned_jurisdiction(text, text), public.sanctions_override_active(text, uuid),
  public.workspace_sanctioned(uuid), public.admin_sanctions_override_set(text, uuid, boolean, text, timestamptz), public.sanctions_refusal_hint(text),
  public.guard_sanctioned_workspace_country(), public.guard_sanctioned_listing_publish(), public.guard_sanctioned_event_publish(),
  public.guard_sanctioned_partner_application() from public, anon;
grant execute on function public.is_sanctioned_jurisdiction(text, text) to anon, authenticated, service_role;
grant execute on function public.resolve_country_code(text), public.workspace_sanctioned(uuid), public.sanctions_override_active(text, uuid), public.sanctions_refusal_hint(text) to authenticated, service_role;
grant execute on function public.admin_sanctions_override_set(text, uuid, boolean, text, timestamptz) to authenticated, service_role;

-- ═══ Compliance signals (staff alerts: Stripe Tax not_collecting consumer sales, sanctioned billing countries) ════════════════════
create table if not exists public.compliance_signals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('tax_not_collecting','sanctioned_billing_country')),
  source text not null check (length(source) between 3 and 60),
  source_id text not null check (length(source_id) between 3 and 255),
  country text,
  amount_minor bigint,
  tax_minor bigint,
  currency text,
  product text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  livemode boolean not null default false,
  detail jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '',
  unique (kind, source_id)
);
create index if not exists compliance_signals_open_idx on public.compliance_signals(kind, created_at desc) where reviewed_at is null;
alter table public.compliance_signals enable row level security;
revoke all on table public.compliance_signals from public, anon, authenticated;
drop policy if exists compliance_signals_admin_read on public.compliance_signals;
create policy compliance_signals_admin_read on public.compliance_signals for select to authenticated
  using (public.has_admin_permission('commerce') or public.has_admin_permission('trust'));
grant select on table public.compliance_signals to authenticated;
grant all on table public.compliance_signals to service_role;

-- Service role only (the Stripe webhook). Idempotent per (kind, source_id); staff are notified once per new signal.
create or replace function public.record_compliance_signal(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare sid uuid; k text := p->>'kind'; perm text; v_title text;
begin
  insert into public.compliance_signals(kind, source, source_id, country, amount_minor, tax_minor, currency, product, workspace_id, livemode, detail, occurred_at)
  values (k, left(coalesce(p->>'source', 'stripe'), 60), left(p->>'source_id', 255), upper(nullif(p->>'country', '')), nullif(p->>'amount_minor', '')::bigint,
          nullif(p->>'tax_minor', '')::bigint, upper(nullif(p->>'currency', '')), left(p->>'product', 80),
          (select w.id from public.workspaces w where w.id::text = p->>'workspace_id'), coalesce((p->>'livemode')::boolean, false),
          coalesce(p->'detail', '{}'), coalesce(nullif(p->>'occurred_at', '')::timestamptz, now()))
  on conflict (kind, source_id) do nothing returning id into sid;
  if sid is null then return null; end if;
  perm := case when k = 'tax_not_collecting' then 'commerce' else 'trust' end;
  v_title := case when k = 'tax_not_collecting' then 'Tax not collected: consumer sale in ' || coalesce(upper(p->>'country'), '?')
                else 'Payment from a sanctioned country (' || coalesce(upper(p->>'country'), '?') || ')' end;
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select pa.user_id, 'admin.compliance_signal', left(v_title, 140),
      left(case when k = 'tax_not_collecting'
        then 'Stripe Tax charged no tax on a consumer sale where Blackwellen is not registered. Record it and, for the EU, make sure the IE OSS application is in by the 10th of next month.'
        else 'A paid checkout gave a billing address in a sanctioned country. Review it and refund if required.' end, 600),
      '/admin/compliance?tab=signals', 'compliance-signal:' || sid || ':' || pa.user_id
    from public.platform_admins pa where perm = any(pa.permissions)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  insert into public.audit_events(actor_type, workspace_id, event, metadata)
    values ('webhook', (select w.id from public.workspaces w where w.id::text = p->>'workspace_id'), 'compliance.' || k,
      jsonb_build_object('signal_id', sid, 'country', upper(p->>'country'), 'source_id', left(p->>'source_id', 120)));
  return sid;
end $$;

create or replace function public.admin_review_compliance_signal(p_id uuid, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (public.has_admin_permission('commerce') or public.has_admin_permission('trust')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.compliance_signals set reviewed_at = now(), reviewed_by = auth.uid(), review_note = left(trim(p_note), 1000) where id = p_id and reviewed_at is null;
  if not found then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'compliance.signal_reviewed', jsonb_build_object('signal_id', p_id, 'note', left(trim(p_note), 300)));
end $$;
revoke all on function public.record_compliance_signal(jsonb), public.admin_review_compliance_signal(uuid, text) from public, anon, authenticated;
grant execute on function public.record_compliance_signal(jsonb) to service_role;
grant execute on function public.admin_review_compliance_signal(uuid, text) to authenticated, service_role;

-- ═══ 2. UK platform reporting (PORR 2023) ═════════════════════════════════════════════════════════════════════════════════════
-- Sensitive personal data (TIN, date of birth, home address). No table grants to authenticated: access only through the RPCs below,
-- which mask the TIN and date of birth. Lawful basis: UK GDPR Art 6(1)(c) legal obligation. Retention: 6 years after the end of the
-- reportable period (verify the Regulations' record-keeping period) — retention row below, disabled until legal sign-off.
create table if not exists public.seller_tax_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  seller_type text not null check (seller_type in ('individual','entity')),
  legal_name text not null check (length(trim(legal_name)) between 2 and 200),
  date_of_birth date,
  tin text check (tin is null or tin ~ '^[A-Z0-9]{4,20}$'),
  tin_country text check (tin_country is null or tin_country ~ '^[A-Z]{2}$'),
  tin_not_issued boolean not null default false,
  vat_number text check (vat_number is null or vat_number ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  company_number text check (company_number is null or company_number ~ '^[A-Z0-9]{2,20}$'),
  address_line1 text not null check (length(trim(address_line1)) between 2 and 200),
  address_line2 text check (address_line2 is null or length(address_line2) <= 200),
  city text not null check (length(trim(city)) between 1 and 100),
  region text check (region is null or length(region) <= 100),
  postal_code text check (postal_code is null or length(postal_code) <= 20),
  country text not null check (country ~ '^[A-Z]{2}$'),
  confirmed_accurate boolean not null default false check (confirmed_accurate),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  verification_note text not null default '',
  check (seller_type <> 'individual' or date_of_birth is not null),
  check (seller_type <> 'entity' or company_number is not null or tin is not null),
  check (tin is not null or tin_not_issued)
);
alter table public.seller_tax_profiles enable row level security;
revoke all on table public.seller_tax_profiles from public, anon, authenticated;
grant all on table public.seller_tax_profiles to service_role;
comment on table public.seller_tax_profiles is 'PORR 2023 / DAC7-equivalent seller due-diligence data (sensitive). RPC access only; masked reads; retention 6 years after the reportable period (verify).';

create table if not exists public.seller_tax_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  step smallint not null check (step between 0 and 2),   -- 0 = initial request, 1 and 2 = reminders
  sent_at timestamptz not null default now(),
  primary key (workspace_id, step)
);
alter table public.seller_tax_requests enable row level security;
revoke all on table public.seller_tax_requests from public, anon, authenticated;
grant all on table public.seller_tax_requests to service_role;

create table if not exists public.tax_reporting_holds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  basis text not null default 'tax_reporting' check (basis = 'tax_reporting'),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lift_reason text
);
create unique index if not exists tax_reporting_holds_active_uniq on public.tax_reporting_holds(workspace_id) where lifted_at is null;
alter table public.tax_reporting_holds enable row level security;
revoke all on table public.tax_reporting_holds from public, anon, authenticated;
drop policy if exists tax_reporting_holds_read on public.tax_reporting_holds;
create policy tax_reporting_holds_read on public.tax_reporting_holds for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','finance']) or public.has_admin_permission('commerce'));
grant select on table public.tax_reporting_holds to authenticated;
grant all on table public.tax_reporting_holds to service_role;

-- Reportable sellers: provider workspaces (venue hire = rental of immovable property; supplier services = personal services).
-- Organisers selling tickets are probably not reportable (tax-and-reporting.md §5.1; adviser to confirm) — not asked for DOB/TIN.
create or replace function public.platform_reporting_required(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces w where w.id = p_workspace and w.kind = 'provider' and not coalesce(w.is_test_fixture, false))
     and not public.dec107_gate_exempt(p_workspace);
$$;

create or replace function public.platform_reporting_complete(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.seller_tax_profiles t where t.workspace_id = p_workspace);
$$;

-- Save (owner or finance; aal2 when the user has a second factor). Validation mirrors src/lib/tax/platform-reporting.ts.
create or replace function public.seller_tax_profile_save(p_workspace uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); st text := p->>'seller_type'; dob date; tin text; tinc text; vat text; co text; ctry text; nis boolean;
begin
  if me is null or not public.has_workspace_role(p_workspace, array['owner','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(p_workspace);
  if st not in ('individual','entity') then raise exception 'invalid_seller_type' using errcode = '22023'; end if;
  ctry := upper(trim(coalesce(p->>'country', '')));
  if ctry !~ '^[A-Z]{2}$' then raise exception 'invalid_country' using errcode = '22023'; end if;
  if public.is_sanctioned_jurisdiction(ctry, nullif(p->>'region', '')) and not public.sanctions_override_active('workspace', p_workspace) then
    raise exception 'sanctioned_jurisdiction' using errcode = '22023', hint = public.sanctions_refusal_hint(ctry);
  end if;
  nis := coalesce((p->>'tin_not_issued')::boolean, false);
  tin := nullif(upper(regexp_replace(coalesce(p->>'tin', ''), '[\s-]', '', 'g')), '');
  tinc := upper(coalesce(nullif(p->>'tin_country', ''), ctry));
  if tin is null and not nis then raise exception 'tin_required' using errcode = '22023'; end if;
  if tin is not null and tinc = 'GB' and tin !~ '^([0-9]{10}|[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][0-9]{6}[A-D])$' then raise exception 'invalid_tin' using errcode = '22023'; end if;
  if tin is not null and tin !~ '^[A-Z0-9]{4,20}$' then raise exception 'invalid_tin' using errcode = '22023'; end if;
  vat := nullif(upper(regexp_replace(coalesce(p->>'vat_number', ''), '[\s.-]', '', 'g')), '');
  if vat is not null and (vat !~ '^[A-Z]{2}[A-Z0-9]{2,13}$' or (vat like 'GB%' and vat !~ '^GB([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$')) then raise exception 'invalid_vat_number' using errcode = '22023'; end if;
  co := nullif(upper(regexp_replace(coalesce(p->>'company_number', ''), '\s', '', 'g')), '');
  if co is not null and (co !~ '^[A-Z0-9]{2,20}$' or (ctry = 'GB' and co !~ '^([0-9]{8}|[A-Z]{2}[0-9]{6})$')) then raise exception 'invalid_company_number' using errcode = '22023'; end if;
  if st = 'entity' and co is null and tin is null then raise exception 'company_number_required' using errcode = '22023'; end if;
  if st = 'individual' then
    begin dob := (p->>'date_of_birth')::date; exception when others then raise exception 'invalid_date_of_birth' using errcode = '22023'; end;
    if dob is null or dob > (current_date - interval '18 years')::date or dob < (current_date - interval '120 years')::date then raise exception 'invalid_date_of_birth' using errcode = '22023'; end if;
  end if;
  if length(trim(coalesce(p->>'legal_name', ''))) < 2 or length(trim(coalesce(p->>'address_line1', ''))) < 2 or length(trim(coalesce(p->>'city', ''))) < 1 then
    raise exception 'address_required' using errcode = '22023';
  end if;
  if coalesce((p->>'confirmed_accurate')::boolean, false) is not true then raise exception 'confirmation_required' using errcode = '22023'; end if;
  insert into public.seller_tax_profiles as t (workspace_id, seller_type, legal_name, date_of_birth, tin, tin_country, tin_not_issued, vat_number, company_number,
      address_line1, address_line2, city, region, postal_code, country, confirmed_accurate, submitted_by, submitted_at, updated_at)
    values (p_workspace, st, left(trim(p->>'legal_name'), 200), case when st = 'individual' then dob end, tin, case when tin is not null then tinc end, nis and tin is null,
      vat, co, left(trim(p->>'address_line1'), 200), nullif(left(trim(coalesce(p->>'address_line2', '')), 200), ''), left(trim(p->>'city'), 100),
      nullif(left(trim(coalesce(p->>'region', '')), 100), ''), nullif(left(upper(trim(coalesce(p->>'postal_code', ''))), 20), ''), ctry, true, me, now(), now())
  on conflict (workspace_id) do update set seller_type = excluded.seller_type, legal_name = excluded.legal_name, date_of_birth = excluded.date_of_birth,
      tin = excluded.tin, tin_country = excluded.tin_country, tin_not_issued = excluded.tin_not_issued, vat_number = excluded.vat_number,
      company_number = excluded.company_number, address_line1 = excluded.address_line1, address_line2 = excluded.address_line2, city = excluded.city,
      region = excluded.region, postal_code = excluded.postal_code, country = excluded.country, confirmed_accurate = true, submitted_by = me,
      updated_at = now(), verified_at = null, verification_note = '';
  -- Complete details lift a tax-reporting payout hold at once (the sweep re-reads payout state).
  update public.tax_reporting_holds set lifted_at = now(), lift_reason = 'details_provided' where workspace_id = p_workspace and lifted_at is null;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (me, 'user', p_workspace, 'tax_reporting.details_saved', jsonb_build_object('seller_type', st, 'country', ctry, 'tin_provided', tin is not null, 'vat_provided', vat is not null));
  return public.seller_tax_profile_status(p_workspace);
end $$;

-- Masked view of the seller's own details + due-diligence state.
create or replace function public.seller_tax_profile_status(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.seller_tax_profiles;
begin
  if not (public.has_workspace_role(p_workspace, array['owner','finance']) or public.has_admin_permission('commerce')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into t from public.seller_tax_profiles where workspace_id = p_workspace;
  return jsonb_build_object('required', public.platform_reporting_required(p_workspace), 'complete', t.workspace_id is not null,
    'seller_type', t.seller_type, 'legal_name', t.legal_name, 'tin_masked', case when t.tin is not null then repeat('•', greatest(length(t.tin) - 3, 0)) || right(t.tin, 3) end,
    'tin_country', t.tin_country, 'tin_not_issued', t.tin_not_issued, 'date_of_birth_set', t.date_of_birth is not null, 'vat_number', t.vat_number,
    'company_number', t.company_number, 'city', t.city, 'country', t.country, 'updated_at', t.updated_at,
    'requests', coalesce((select jsonb_agg(jsonb_build_object('step', r.step, 'sent_at', r.sent_at) order by r.step) from public.seller_tax_requests r where r.workspace_id = p_workspace), '[]'),
    'hold', exists (select 1 from public.tax_reporting_holds h where h.workspace_id = p_workspace and h.lifted_at is null));
end $$;

-- Due diligence (verify against SI 2023/817 and HMRC guidance): an initial request, then two reminders; if the information is still
-- missing after both reminders AND at least 60 days after the initial request, payouts are withheld until it is provided.
-- Intervals: reminder 1 at day 20, reminder 2 at day 40, hold from day 60 (src/lib/tax/platform-reporting.ts DUE_DILIGENCE).
create or replace function public.platform_reporting_due_diligence(p_now timestamptz default now()) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w record; sent int := 0; held int := 0; s0 timestamptz; s1 timestamptz; s2 timestamptz; nxt int; v_link text;
begin
  for w in select ws.id, ws.name from public.workspaces ws
           where ws.kind = 'provider' and ws.status = 'active' and ws.onboarding_complete and not coalesce(ws.is_test_fixture, false)
             and (ws.stripe_account_id is not null or ws.stripe_account_id_live is not null or exists (select 1 from public.connect_accounts c where c.workspace_id = ws.id))
             and public.platform_reporting_required(ws.id) and not public.platform_reporting_complete(ws.id) loop
    select max(sent_at) filter (where step = 0), max(sent_at) filter (where step = 1), max(sent_at) filter (where step = 2) into s0, s1, s2
      from public.seller_tax_requests where workspace_id = w.id;
    nxt := case when s0 is null then 0 when s1 is null and p_now >= s0 + interval '20 days' then 1
                when s1 is not null and s2 is null and p_now >= s0 + interval '40 days' then 2 else null end;
    v_link := '/provider/money/tax-details';
    if nxt is not null then
      insert into public.seller_tax_requests(workspace_id, step, sent_at) values (w.id, nxt, p_now) on conflict do nothing;
      insert into public.notifications(user_id, kind, title, body, link, workspace_id, dedupe_key)
        select m.user_id, 'tax_details_request',
          case nxt when 0 then 'Add your tax details for HMRC reporting' when 1 then 'Reminder: tax details needed' else 'Final reminder: tax details needed to keep payouts' end,
          'UK law (the Platform Operators Regulations 2023) requires Gala Dock to collect your legal name, address, tax reference and date of birth or company number, and report your earnings to HMRC each year.'
            || case when nxt = 2 then ' If we still don’t have them 60 days after our first request, we must hold your payouts until you add them.' else '' end,
          v_link, w.id, 'tax-details:' || w.id || ':' || nxt || ':' || m.user_id
        from public.workspace_members m where m.workspace_id = w.id and m.status = 'active' and m.role in ('owner','finance')
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      sent := sent + 1;
    elsif s1 is not null and s2 is not null and p_now >= s0 + interval '60 days'
          and not exists (select 1 from public.tax_reporting_holds h where h.workspace_id = w.id and h.lifted_at is null) then
      insert into public.tax_reporting_holds(workspace_id) values (w.id) on conflict do nothing;
      insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', w.id, 'payout.held_tax_reporting', jsonb_build_object('first_request', s0));
      insert into public.notifications(user_id, kind, title, body, link, workspace_id, dedupe_key)
        select m.user_id, 'payout_paused', 'Payouts on hold until you add your tax details',
          'We asked three times for the tax details UK law requires us to collect. Your payouts are held until you add them; the money stays in your own Stripe balance. Adding them releases the hold straight away.',
          v_link, w.id, 'tax-hold:' || w.id || ':' || to_char(p_now, 'YYYYMMDD') || ':' || m.user_id
        from public.workspace_members m where m.workspace_id = w.id and m.status = 'active' and m.role in ('owner','finance')
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      held := held + 1;
    end if;
  end loop;
  return jsonb_build_object('requests_sent', sent, 'holds_placed', held, 'at', p_now);
end $$;

-- Annual report rows (admin export, CSV/XML): one row per reportable seller and quarter with identity + consideration, number of
-- relevant activities and fees withheld. Consideration = booking payments to the seller net of refunds (payment_orders); activity
-- type from the listing kind (venue → immovable property; service → personal services). Reading it is audited.
create or replace function public.admin_platform_reporting_report(p_year integer) returns table (
  workspace_id uuid, seller_name text, seller_type text, legal_name text, date_of_birth date, tin text, tin_country text, tin_not_issued boolean,
  vat_number text, company_number text, address text, country text, activity text, quarter integer, consideration_minor bigint,
  activities bigint, fees_minor bigint, currency text, details_complete boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_year < 2024 or p_year > extract(year from now())::int then raise exception 'invalid_year' using errcode = '22023'; end if;
  return query
  with pay as (
    select po.payee_workspace_id ws, extract(quarter from coalesce(po.charged_at, po.created_at))::int q,
      case when l.kind = 'venue' then 'immovable_property' else 'personal_services' end act,
      greatest(po.amount_minor - coalesce(po.refunded_minor, 0), 0) cons, po.platform_fee_minor fee, upper(po.currency) cur
    from public.payment_orders po
    left join public.build_items b on b.id = po.build_item_id
    left join public.listings l on l.id = b.listing_id
    where po.kind in ('deposit','balance_payment','standby_fee','emergency_service') and po.payee_workspace_id is not null
      and po.status in ('payment_succeeded','eligible_for_provider_transfer','protected_pending_delivery')
      and po.livemode = public.stripe_livemode()
      and coalesce(po.charged_at, po.created_at) >= make_date(p_year, 1, 1) and coalesce(po.charged_at, po.created_at) < make_date(p_year + 1, 1, 1))
  select w.id, w.name, t.seller_type, t.legal_name, t.date_of_birth, t.tin, t.tin_country, coalesce(t.tin_not_issued, false), t.vat_number, t.company_number,
    nullif(concat_ws(', ', t.address_line1, t.address_line2, t.city, t.region, t.postal_code), ''), coalesce(t.country, public.workspace_business_country(w.id)),
    pay.act, pay.q, sum(pay.cons)::bigint, count(*)::bigint, sum(pay.fee)::bigint, min(pay.cur), t.workspace_id is not null
  from pay join public.workspaces w on w.id = pay.ws left join public.seller_tax_profiles t on t.workspace_id = w.id
  where public.platform_reporting_required(w.id)
  group by w.id, w.name, t.workspace_id, t.seller_type, t.legal_name, t.date_of_birth, t.tin, t.tin_country, t.tin_not_issued, t.vat_number, t.company_number,
    t.address_line1, t.address_line2, t.city, t.region, t.postal_code, t.country, pay.act, pay.q
  order by w.name, pay.q;
end $$;

create or replace function public.admin_platform_reporting_export_logged(p_year integer, p_format text, p_rows integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('commerce') then raise exception 'not_authorized' using errcode = '42501'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'tax_reporting.report_exported',
    jsonb_build_object('year', p_year, 'format', left(p_format, 10), 'rows', p_rows));
end $$;

revoke all on function public.platform_reporting_required(uuid), public.platform_reporting_complete(uuid), public.seller_tax_profile_save(uuid, jsonb),
  public.seller_tax_profile_status(uuid), public.platform_reporting_due_diligence(timestamptz), public.admin_platform_reporting_report(integer),
  public.admin_platform_reporting_export_logged(integer, text, integer) from public, anon;
grant execute on function public.platform_reporting_required(uuid), public.platform_reporting_complete(uuid), public.seller_tax_profile_save(uuid, jsonb),
  public.seller_tax_profile_status(uuid), public.admin_platform_reporting_report(integer), public.admin_platform_reporting_export_logged(integer, text, integer) to authenticated, service_role;
revoke all on function public.platform_reporting_due_diligence(timestamptz) from authenticated;
grant execute on function public.platform_reporting_due_diligence(timestamptz) to service_role;

insert into public.data_retention_rules(key, table_name, action, retention_days, basis, enabled, legal_review_required) values
  ('seller_tax_profiles.retain', 'seller_tax_profiles', 'retain', 2555,
   'Platform reporting due-diligence data (PORR 2023): kept 6 years after the end of the reportable period in which it was last used (verify). DRAFT — legal review.', false, true),
  ('seller_tax_requests.retain', 'seller_tax_requests', 'retain', 2555,
   'Evidence of PORR due-diligence requests and reminders (verify period). DRAFT — legal review.', false, true),
  ('content_reports.closed', 'content_reports', 'retain', 1095,
   'Online Safety Act reports and decisions (record-keeping, s.23; verify period). DRAFT — legal review.', false, true)
on conflict (key) do nothing;

-- Daily due-diligence sweep (06:40 UTC).
do $$ begin
  perform cron.schedule('platform-reporting-due-diligence', '40 6 * * *', 'select public.platform_reporting_due_diligence()');
end $$;

-- ═══ 5. Payout pause grounds (D5) ═════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature. Payment Terms v3 §9.1 grounds: listed pauses (payout_pauses), a Trust & Safety suspension after human review,
-- and (h) the platform-reporting hold required by the 2023 Regulations.
create or replace function public.dec107_payouts_paused(p_workspace uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists(select 1 from public.payout_pauses p where p.workspace_id = p_workspace and p.lifted_at is null)
      or exists(select 1 from public.trust_active_enforcement(p_workspace, null) e where e.action = 'workspace_suspended')
      or exists(select 1 from public.tax_reporting_holds h where h.workspace_id = p_workspace and h.lifted_at is null);
$function$;

-- D5: an automatic risk hold never stops a DEC-107 payout; payout eligibility follows the contractual pause grounds only.
create or replace function public.payout_eligible(p_workspace uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select c.payouts_enabled and c.transfers_capability = 'active' and c.disabled_reason is null
                     and cardinality(c.requirements_past_due) = 0
                   from public.connect_accounts c where c.workspace_id = p_workspace and c.livemode = public.stripe_livemode()), false)
    and not public.dec107_payouts_paused(p_workspace);
$function$;

-- Resale buy-back refunds go back to the original holder's own card: an automatic risk hold has no contractual basis there
-- (and no fraud value — the money can only return to the card that paid). Same definitions with the hold line removed.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.claim_resale_refunds(integer)'::regprocedure);
  if position($o$  if public.risk_hold_active('payout', 'user', p.seller_id) then continue; end if;$o$ in def) > 0 then
    execute replace(def, $o$  if public.risk_hold_active('payout', 'user', p.seller_id) then continue; end if;$o$, '  -- Q74 (D5): no automatic risk hold on refunds to the original holder.');
  end if;
  def := pg_get_functiondef('public.claim_resale_refund(uuid)'::regprocedure);
  if position($o$ if not found or public.risk_hold_active('payout', 'user', p.seller_id) then return; end if;$o$ in def) > 0 then
    execute replace(def, $o$ if not found or public.risk_hold_active('payout', 'user', p.seller_id) then return; end if;$o$, ' if not found then return; end if;   -- Q74 (D5)');
  end if;
end $$;

-- ═══ 3. VAT on Gala Dock's fees by seller country; business details for plans/packs (D15) ═══════════════════════════════════
create table if not exists public.workspace_billing_details (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  business_name text not null check (length(trim(business_name)) between 2 and 200),
  vat_number text check (vat_number is null or vat_number ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  confirmed_business boolean not null default false check (confirmed_business),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.workspace_billing_details enable row level security;
revoke all on table public.workspace_billing_details from public, anon, authenticated;
drop policy if exists workspace_billing_details_read on public.workspace_billing_details;
create policy workspace_billing_details_read on public.workspace_billing_details for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','finance']) or public.has_admin_permission('commerce'));
grant select on table public.workspace_billing_details to authenticated;
grant all on table public.workspace_billing_details to service_role;

create or replace function public.billing_details_save(p_workspace uuid, p_business_name text, p_vat_number text, p_country text, p_confirm boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare vat text := nullif(upper(regexp_replace(coalesce(p_vat_number, ''), '[\s.-]', '', 'g')), ''); c text := nullif(upper(trim(coalesce(p_country, ''))), '');
begin
  if not public.has_workspace_role(p_workspace, array['owner','finance']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_business_name, ''))) < 2 then raise exception 'business_name_required' using errcode = '22023'; end if;
  if p_confirm is not true then raise exception 'confirmation_required' using errcode = '22023'; end if;
  if vat is not null and (vat !~ '^[A-Z]{2}[A-Z0-9]{2,13}$' or (vat like 'GB%' and vat !~ '^GB([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$')) then raise exception 'invalid_vat_number' using errcode = '22023'; end if;
  if c is not null and c !~ '^[A-Z]{2}$' then raise exception 'invalid_country' using errcode = '22023'; end if;
  if c is not null and public.is_sanctioned_jurisdiction(c) and not public.sanctions_override_active('workspace', p_workspace) then
    raise exception 'sanctioned_jurisdiction' using errcode = '22023', hint = public.sanctions_refusal_hint(c);
  end if;
  insert into public.workspace_billing_details(workspace_id, business_name, vat_number, country, confirmed_business, updated_by, updated_at)
    values (p_workspace, left(trim(p_business_name), 200), vat, c, true, auth.uid(), now())
  on conflict (workspace_id) do update set business_name = excluded.business_name, vat_number = excluded.vat_number, country = excluded.country,
    confirmed_business = true, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', p_workspace, 'billing.business_details_saved', jsonb_build_object('vat_provided', vat is not null, 'country', c));
end $$;
revoke all on function public.billing_details_save(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.billing_details_save(uuid, text, text, text, boolean) to authenticated, service_role;

-- VAT treatment of Gala Dock's B2B fee to a workspace (seller commission, advertising). General B2B rule (VATA 1994 s.7A(2)(a)):
-- supplied where the customer belongs. UK (and Isle of Man, same VAT area) or unknown → UK VAT. Outside the UK and in business
-- (trader declaration = business, or a VAT number on file) → reverse charge (customer self-accounts). Non-UK non-trader → UK VAT
-- (B2C general rule s.7A(2)(b), verify). Land-related venue-hire commission (Sch 4A para 1) is NOT separated yet — tax adviser (verify).
create or replace function public.fee_vat_treatment(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_workspace is null then 'uk_vat'
    when coalesce(public.workspace_business_country(p_workspace), 'GB') in ('GB','IM') then 'uk_vat'
    when public.seller_trader_status(p_workspace) = 'business'
      or exists (select 1 from public.seller_tax_profiles t where t.workspace_id = p_workspace and t.vat_number is not null)
      or exists (select 1 from public.workspace_billing_details b where b.workspace_id = p_workspace and b.vat_number is not null) then 'reverse_charge'
    else 'uk_vat' end;
$$;
-- The VAT number to show on a reverse-charge statement (seller's own), or null.
create or replace function public.workspace_vat_number(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.vat_number from public.seller_tax_profiles t where t.workspace_id = p_workspace),
                  (select b.vat_number from public.workspace_billing_details b where b.workspace_id = p_workspace),
                  nullif(upper(regexp_replace(coalesce((select w.settings->'tax'->>'number' from public.workspaces w where w.id = p_workspace), ''), '\s', '', 'g')), ''));
$$;
revoke all on function public.fee_vat_treatment(uuid), public.workspace_vat_number(uuid) from public, anon;
grant execute on function public.fee_vat_treatment(uuid), public.workspace_vat_number(uuid) to authenticated, service_role;

alter table public.checkout_orders add column if not exists commission_vat_treatment text;
alter table public.payment_orders add column if not exists platform_fee_vat_treatment text;

-- Same signature. Booking fee unchanged: TODO(tax adviser, D6) — consumer booking/admin fees are treated as UK VAT-inclusive
-- wherever the event or venue is; B2C intermediary place of supply may be the event/land country (Sch 4A para 10) → OSS.
-- See docs/legal/review-2026-11/eu-vat-readiness.md §3.
create or replace function public.trg_checkout_order_vat() returns trigger language plpgsql security definer set search_path = '' as $function$
declare r numeric := public.vat_rate_bps() / 10000.0; t text;
begin
  if coalesce(new.fee, 0) > 0 then
    -- TODO(tax adviser): booking-fee VAT treatment for overseas events (place of supply) — unchanged pending advice.
    if public.vat_consumer_inclusive() then new.fee_vat := round(new.fee * r / (1 + r), 2);
    else new.fee_vat := round(new.fee * r, 2); new.fee := new.fee + new.fee_vat; end if;
  end if;
  if coalesce(new.commission, 0) > 0 then
    t := public.fee_vat_treatment(coalesce(new.seller_workspace_id, public.event_seller_workspace(new.event_id)));
    new.commission_vat_treatment := t;
    if t = 'reverse_charge' then new.commission_vat := 0;   -- customer accounts for the VAT (reverse charge)
    else
      new.commission_vat := round(new.commission * r, 2);
      new.commission := new.commission + new.commission_vat;            -- deducted from the seller's proceeds with the commission
    end if;
  end if;
  return new;
end $function$;

create or replace function public.trg_payment_order_vat() returns trigger language plpgsql security definer set search_path = '' as $function$
declare rb integer := public.vat_rate_bps(); v bigint; t text;
begin
  if coalesce(new.customer_fee_minor, 0) > 0 then
    -- TODO(tax adviser): booking admin fee VAT for overseas venues/suppliers (place of supply) — unchanged pending advice.
    if public.vat_consumer_inclusive() then new.customer_fee_vat_minor := round(new.customer_fee_minor * rb / (10000.0 + rb));
    else new.customer_fee_vat_minor := round(new.customer_fee_minor * rb / 10000.0); new.customer_fee_minor := new.customer_fee_minor + new.customer_fee_vat_minor; end if;
  end if;
  if new.kind = 'platform_boost' then
    -- Gala Dock's own service, sold to businesses: price plus VAT for UK advertisers; reverse charge for non-UK businesses.
    t := public.fee_vat_treatment((select e.workspace_id from public.events e where e.id = new.event_id));
    new.platform_fee_vat_treatment := t;
    v := case when t = 'reverse_charge' then 0 else round(new.amount_minor * rb / 10000.0) end;
    new.amount_minor := new.amount_minor + v; new.platform_fee_minor := new.amount_minor; new.platform_fee_vat_minor := v;
  elsif coalesce(new.platform_fee_minor, 0) > 0 then
    t := public.fee_vat_treatment(new.payee_workspace_id);
    new.platform_fee_vat_treatment := t;
    v := case when t = 'reverse_charge' then 0 else least(round(new.platform_fee_minor * rb / 10000.0)::bigint, greatest(new.amount_minor - new.platform_fee_minor, 0)) end;
    new.platform_fee_minor := new.platform_fee_minor + v; new.platform_fee_vat_minor := v;   -- commission plus VAT, deducted from the provider's share
  end if;
  return new;
end $function$;

-- ═══ 4. Insurance minimums (D10) ═════════════════════════════════════════════════════════════════════════════════════════════
-- £1,000,000 standard; £2,000,000 for higher-risk categories. Mirror: src/lib/trust/insurance.ts (HIGHER_RISK_CATEGORIES).
update public.credential_requirements set min_cover_minor = 200000000,
    category_aliases = (select array(select distinct x from unnest(category_aliases || array['production','av','av & production','lighting','sound','staging',
      'production > staging','av_lighting','production > av & lighting','rigging','special effects','pyrotechnics','sfx']) x))
  where credential_key = 'public_liability' and capability = 'service' and category = 'AV & Production' and country is null
    and (min_cover_minor is distinct from 200000000 or not ('rigging' = any(category_aliases)));
update public.credential_requirements set min_cover_minor = 200000000
  where credential_key = 'public_liability' and capability = 'service' and category = 'Security' and country is null and min_cover_minor is distinct from 200000000;
insert into public.credential_requirements(credential_key, capability, category, country, requirement, gates_marketplace, category_aliases, min_cover_minor, cover_currency)
  select 'public_liability', 'service', 'Marquees & Structures', null, 'required', true,
    array['marquees','marquee','structures','temporary structures','inflatables','bouncy castles','fairground rides','rides'], 200000000, 'GBP'
  where not exists (select 1 from public.credential_requirements r where r.credential_key = 'public_liability' and r.capability = 'service' and r.category = 'Marquees & Structures' and r.country is null);

-- ═══ 6. Report (OSA s.20): listings, events, reviews, business profiles ═════════════════════════════════════════════════════════
insert into public.moderation_reason_codes(code, label, applies_to, severity, appealable, active) values
  ('illegal_content', 'Illegal content (e.g. fraud, threats, hate, intimate images)', array['review','listing','message','media','event','template','workspace','user'], 'critical', true, true),
  ('child_safety', 'Child safety concern', array['review','listing','message','media','event','template','workspace','user'], 'critical', true, true),
  ('scam_or_payment_diversion', 'Scam or request to pay outside Gala Dock', array['review','listing','message','event','workspace','user'], 'high', true, true)
on conflict (code) do nothing;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('listing','event','review','workspace')),
  subject_id uuid not null,
  subject_workspace uuid references public.workspaces(id) on delete set null,
  subject_name text not null default '' check (length(subject_name) <= 200),
  excerpt text not null default '' check (length(excerpt) <= 2400),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason_code text not null references public.moderation_reason_codes(code),
  note text not null default '' check (length(note) <= 1000),
  priority text not null default 'normal' check (priority in ('urgent','high','normal')),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  case_id uuid references public.trust_cases(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  content_removed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, reporter_id)
);
create index if not exists content_reports_status_idx on public.content_reports(status, priority, created_at desc);
create index if not exists content_reports_subject_idx on public.content_reports(subject_type, subject_id);
alter table public.content_reports enable row level security;
revoke all on table public.content_reports from public, anon, authenticated;
grant select on table public.content_reports to authenticated;
grant all on table public.content_reports to service_role;
drop policy if exists content_reports_read on public.content_reports;
create policy content_reports_read on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.has_admin_permission('trust'));

create or replace function public.report_content(p_subject_type text, p_subject_id uuid, p_reason_code text, p_note text default '') returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); ws uuid; nm text; ex text; own boolean := false; sev text; rid uuid; cid uuid; n int; ttype text; pri text;
begin
  if me is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_subject_type = 'listing' then
    select l.workspace_id, l.name, left(l.name || ' — ' || coalesce(l.description, ''), 2400) into ws, nm, ex from public.listings l
      where l.id = p_subject_id and (l.published or public.is_workspace_member(l.workspace_id));
    if nm is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    own := public.is_workspace_member(ws); ttype := 'listing';
  elsif p_subject_type = 'event' then
    select e.workspace_id, e.name, left(e.name || ' — ' || coalesce(e.description, ''), 2400), (e.owner_id = me or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id)))
      into ws, nm, ex, own from public.events e where e.id = p_subject_id and (public.event_is_public(e.id) or public.can_access_event(e.id));
    if nm is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    ttype := 'event';
  elsif p_subject_type = 'review' then
    select public.listing_workspace(r.listing_id), 'Review of ' || coalesce(l.name, 'a listing'), left(coalesce(r.body, ''), 2400), r.user_id = me
      into ws, nm, ex, own from public.reviews r left join public.listings l on l.id = r.listing_id where r.id = p_subject_id and r.status = 'published';
    if nm is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    ttype := 'review';
  elsif p_subject_type = 'workspace' then
    select w.id, w.name, left(w.name, 2400) into ws, nm, ex from public.workspaces w where w.id = p_subject_id and w.status = 'active' and w.kind in ('organizer','provider');
    if nm is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    own := public.is_workspace_member(ws); ttype := 'workspace';
  else raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if own then raise exception 'cannot_report_own_content' using errcode = '22023'; end if;
  select c.severity into sev from public.moderation_reason_codes c where c.code = p_reason_code and c.active and (p_subject_type = any(c.applies_to) or (p_subject_type = 'workspace' and 'listing' = any(c.applies_to)));
  if sev is null then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  if not public.hit_rate_limit('content_report:' || me, 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  pri := case when p_reason_code in ('child_safety','illegal_content') then 'urgent' when sev in ('critical','high') then 'high' else 'normal' end;
  insert into public.content_reports(subject_type, subject_id, subject_workspace, subject_name, excerpt, reporter_id, reason_code, note, priority)
    values (p_subject_type, p_subject_id, ws, left(coalesce(nm, ''), 200), coalesce(ex, ''), me, p_reason_code, left(coalesce(trim(p_note), ''), 1000), pri)
    on conflict (subject_type, subject_id, reporter_id) do nothing returning id into rid;
  if rid is null then raise exception 'already_reported' using errcode = '23505'; end if;
  -- One open case per subject collects every report (trust_cases has no 'workspace' content subject beyond its own list).
  select id into cid from public.trust_cases where subject_type = ttype and subject_id = p_subject_id and category = 'Content report' and status in ('open','in_review') limit 1;
  if cid is null then
    select coalesce(max(substring(reference from '^TS-(\d+)$')::int), 8600) + 1 into n from public.trust_cases where reference ~ '^TS-\d+$';
    insert into public.trust_cases(reference, queue, category, subject_type, subject_id, subject_name, risk_score, status, reason, evidence, related)
      values ('TS-' || n, 'fraud', 'Content report', ttype, p_subject_id, left(coalesce(nm, 'Reported content'), 160),
        case pri when 'urgent' then 80 when 'high' then 50 else 30 end, 'open', (select label from public.moderation_reason_codes where code = p_reason_code),
        jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Reported: ' || p_reason_code, 'report_id', rid, 'at', now())),
        jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id, 'workspace_id', ws))
      returning id into cid;
    insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
      select pa.user_id, 'admin.content_report', case when pri = 'urgent' then 'URGENT: content reported' else 'Content reported' end,
        left(coalesce(nm, '') || ' — ' || coalesce((select label from public.moderation_reason_codes where code = p_reason_code), p_reason_code), 300),
        '/admin/moderation', 'content-report-case:' || cid || ':' || pa.user_id
      from public.platform_admins pa where 'trust' = any(pa.permissions)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  else
    update public.trust_cases set evidence = evidence || jsonb_build_array(jsonb_build_object('kind', 'report', 'label', 'Reported: ' || p_reason_code, 'report_id', rid, 'at', now())),
      risk_score = least(100, risk_score + 10), updated_at = now() where id = cid;
  end if;
  update public.content_reports set case_id = cid where id = rid;
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (me, 'user', null, 'content.reported',
    jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id, 'report_id', rid, 'reason_code', p_reason_code, 'case_id', cid, 'priority', pri));
  return rid;
end $$;

-- Decide every open report on the same subject. p_remove hides a review (status removed); listings, events and profiles are
-- restricted through Trust & Safety enforcement (statement of reasons + appeal) — the case link is in the queue.
create or replace function public.admin_decide_content_report(p_report uuid, p_decision text, p_note text, p_remove boolean default false) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.content_reports; me uuid := auth.uid(); rv public.reviews; removed boolean := false;
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_decision not in ('actioned','dismissed') then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.content_reports where id = p_report for update;
  if not found then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'case_closed' using errcode = '22023'; end if;
  if coalesce(p_remove, false) and p_decision = 'actioned' and r.subject_type = 'review' then
    select * into rv from public.reviews where id = r.subject_id for update;
    if found and rv.status = 'published' then
      update public.reviews set status = 'removed', moderation_reason = left(trim(p_note), 500), moderated_by = me, moderated_at = now(), updated_at = now() where id = rv.id;
      perform public.trust_review_aggregate(rv.listing_id, rv.rating, -1);
      removed := true;
      -- Statement of reasons to the author (OSA s.21 complaints / appeal route).
      insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
        values (rv.user_id, 'report_outcome', 'Your review was removed', left('We removed your review after a report: ' || trim(p_note) || ' You can appeal through Help → Complaints within 14 days.', 600), '/help', 'review-removed:' || rv.id);
    end if;
  end if;
  update public.content_reports set status = p_decision, decided_by = me, decided_at = now(), decision_note = left(trim(p_note), 1000), content_removed = removed
    where subject_type = r.subject_type and subject_id = r.subject_id and status = 'open';
  if r.case_id is not null and not exists (select 1 from public.content_reports x where x.case_id = r.case_id and x.status = 'open') then
    update public.trust_cases set status = p_decision, decision = left(trim(p_note), 1000), decided_by = me, decided_at = now(), updated_at = now()
      where id = r.case_id and status in ('open','in_review');
  end if;
  insert into public.notifications(user_id, kind, title, body, link, dedupe_key)
    select x.reporter_id, 'report_outcome', 'We reviewed what you reported',
      case when p_decision = 'actioned' then 'Thanks for telling us. We took action under our rules' || case when removed then ' and removed the content.' else '.' end
           else 'Thanks for telling us. We reviewed it and it didn’t break our rules. If you disagree, reply through Help → Complaints.' end,
      '/help', 'content-report-outcome:' || x.id
    from public.content_reports x where x.subject_type = r.subject_type and x.subject_id = r.subject_id and x.decided_at = now()
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (me, 'admin', 'content.report_decided',
    jsonb_build_object('report_id', p_report, 'subject_type', r.subject_type, 'subject_id', r.subject_id, 'decision', p_decision, 'removed', removed, 'reason', left(trim(p_note), 500)));
end $$;

-- One moderation queue: content reports + message reports (messaging lane) + legacy review reports. Grouped per subject.
create or replace function public.admin_moderation_queue(p_status text default 'open', p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('trust') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(z.q order by (z.q->>'rank')::int, z.q->>'created_at' desc) from (select s.q from (
    select jsonb_build_object('source', 'content', 'id', (array_agg(c.id order by c.created_at))[1], 'subject_type', c.subject_type, 'subject_id', c.subject_id,
        'subject_name', max(c.subject_name), 'excerpt', max(c.excerpt), 'reason_code', (array_agg(c.reason_code order by c.created_at))[1],
        'reasons', array_agg(distinct c.reason_code), 'notes', (array_agg(c.note order by c.created_at) filter (where c.note <> ''))[1:3],
        'reports', count(*), 'priority', (array['urgent','high','normal'])[1 + min(case c.priority when 'urgent' then 0 when 'high' then 1 else 2 end)],
        'status', min(c.status), 'created_at', min(c.created_at),
        'case_id', max(c.case_id::text), 'case_ref', (select t.reference from public.trust_cases t where t.id = max(c.case_id::text)::uuid),
        'rank', min(case c.priority when 'urgent' then 0 when 'high' then 1 else 2 end)) q
      from public.content_reports c where c.status = p_status group by c.subject_type, c.subject_id
    union all
    select jsonb_build_object('source', 'message', 'id', (array_agg(m.id order by m.created_at))[1], 'subject_type', 'message', 'subject_id', m.message_id,
        'subject_name', 'Message from ' || coalesce(nullif(max(m.reported_name), ''), 'a member'), 'excerpt', max(m.excerpt),
        'reason_code', (array_agg(m.reason_code order by m.created_at))[1], 'reasons', array_agg(distinct m.reason_code),
        'notes', (array_agg(m.note order by m.created_at) filter (where m.note <> ''))[1:3], 'reports', count(*),
        'priority', case when bool_or(m.reason_code in ('child_safety','illegal_content')) then 'urgent' when bool_or(m.reason_code in ('abusive_content','scam_or_payment_diversion')) then 'high' else 'normal' end,
        'status', min(m.status), 'created_at', min(m.created_at), 'case_id', max(m.case_id::text),
        'case_ref', (select t.reference from public.trust_cases t where t.id = max(m.case_id::text)::uuid),
        'rank', case when bool_or(m.reason_code in ('child_safety','illegal_content')) then 0 when bool_or(m.reason_code in ('abusive_content','scam_or_payment_diversion')) then 1 else 2 end)
      from public.message_reports m where m.status = p_status group by m.source, m.message_id
    union all
    select jsonb_build_object('source', 'review_legacy', 'id', (array_agg(v.id order by v.created_at))[1], 'subject_type', 'review', 'subject_id', v.review_id,
        'subject_name', 'Review', 'excerpt', left(coalesce((select r.body from public.reviews r where r.id = v.review_id), ''), 600),
        'reason_code', (array_agg(v.reason_code order by v.created_at))[1], 'reasons', array_agg(distinct v.reason_code),
        'notes', (array_agg(v.note order by v.created_at) filter (where v.note <> ''))[1:3], 'reports', count(*), 'priority', 'normal',
        'status', min(v.status), 'created_at', min(v.created_at), 'case_id', max(v.case_id::text),
        'case_ref', (select t.reference from public.trust_cases t where t.id = max(v.case_id::text)::uuid), 'rank', 2)
      from public.review_reports v where v.status = p_status group by v.review_id
  ) s(q) order by (s.q->>'rank')::int, s.q->>'created_at' desc limit greatest(1, least(coalesce(p_limit, 200), 500))) z), '[]'::jsonb);
end $$;

revoke all on function public.report_content(text, uuid, text, text), public.admin_decide_content_report(uuid, text, text, boolean), public.admin_moderation_queue(text, integer) from public, anon;
grant execute on function public.report_content(text, uuid, text, text), public.admin_decide_content_report(uuid, text, text, boolean), public.admin_moderation_queue(text, integer) to authenticated, service_role;
