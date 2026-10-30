-- Q08 (lane C) — Provider documents, insurance, expiry, eligibility and truthful badges (domains 118–119, 122 core).
-- Additive and backward-compatible with the deployed code:
--   • credential_types.category / credential_requirements.category_aliases + min_cover_minor: rules stay data. Listing
--     categories ("Catering", "dj", "Entertainment > DJ") match rule categories through aliases.
--   • provider_documents gains insurance fields (cover amount/currency), renewal lineage, timestamps. A submitted document must be
--     the submitter's own verified private upload; its storage object is re-classed `sensitive` (quarantined until ClamAV says clean).
--   • Effective credential state is computed at read time from current evidence (an expiry date in the past is expired even
--     before the daily job runs; a pending renewal never hides a still-valid verified document).
--   • Eligibility (decided, see docs/marketplace/trust-verification.md):
--       publish (publish_listing / listing_readiness): every marketplace-gating credential for the listing is verified and current
--         and cover meets the minimum; no active suspension.
--       accept (provider quote send, marketplace job creation by a signed-in user): blocked when a gating credential has LAPSED
--         (expired / below minimum cover) or the workspace/listing is under enforcement. Never-provided ("missing") evidence is
--         grandfathered for acceptance unless trust_policy.missing_blocks_acceptance is switched on. Webhook/service paths
--         (money already taken) are never blocked here.
--       visibility: when evidence lapses, the affected published listings are held (unpublished, trust_listing_holds) with a
--         reason, and restored automatically when renewed evidence is verified.
--   • Badges: listings.verified and workspaces.verification_status become derived caches. A BEFORE trigger recomputes them on
--     every write (manual writes cannot set them), evidence changes refresh them, and the daily expiry job refreshes time-based
--     lapses. trust_summary()/listing_trust() are the computed sources.

-- ═══ 1. Rule data ═══
alter table public.credential_types add column if not exists category text not null default 'certificate'
  check (category in ('insurance','licence','certificate','food_hygiene','security','equipment','risk_assessment','company','accessibility'));
update public.credential_types set category = case
  when key in ('public_liability','professional_indemnity','employer_liability','event_insurance') then 'insurance'
  when key in ('premises_licence','alcohol_permission') then 'licence'
  when key = 'security_licence' then 'security'
  when key = 'food_hygiene' then 'food_hygiene'
  when key in ('equipment_inspection','electrical_safety') then 'equipment'
  when key in ('risk_assessment','fire_safety') then 'risk_assessment'
  when key = 'company_documents' then 'company'
  when key = 'accessibility_info' then 'accessibility'
  else 'certificate' end;

alter table public.credential_requirements add column if not exists category_aliases text[] not null default '{}';
alter table public.credential_requirements add column if not exists min_cover_minor bigint check (min_cover_minor is null or min_cover_minor > 0);
alter table public.credential_requirements add column if not exists cover_currency text not null default 'GBP' check (cover_currency ~ '^[A-Z]{3}$');
update public.credential_requirements set category_aliases = case category
  when 'Catering' then array['catering','caterer','food','food & drink']
  when 'DJs & Music' then array['dj','djs','djs & music','entertainment > dj','music']
  when 'Live Entertainment' then array['band','live music','entertainment','live entertainment','performer']
  when 'AV & Production' then array['production','av','av & production','lighting','sound']
  when 'Décor & Florals' then array['decor','décor','flowers','florals','décor & florals']
  when 'Security' then array['security']
  when 'Staffing' then array['staffing','staff']
  else category_aliases end
where category is not null and category_aliases = '{}';
-- Default minimum public liability cover £1,000,000 (configurable data; owner/legal may raise it).
update public.credential_requirements set min_cover_minor = 100000000 where credential_key = 'public_liability' and requirement = 'required' and min_cover_minor is null;

-- Platform policy switches (single row, service-only).
create table if not exists public.trust_policy (
  id boolean primary key default true check (id),
  missing_blocks_acceptance boolean not null default false,
  reminder_days integer[] not null default '{30,14,7,1}',
  updated_at timestamptz not null default now()
);
insert into public.trust_policy(id) values (true) on conflict do nothing;
alter table public.trust_policy enable row level security;
revoke all on public.trust_policy from anon, authenticated;

-- ═══ 2. Moderation vocabulary + enforcement actions (schema; commands in 202610293006) ═══
create table if not exists public.moderation_reason_codes (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  label text not null,
  applies_to text[] not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  appealable boolean not null default true,
  active boolean not null default true
);
alter table public.moderation_reason_codes enable row level security;
revoke all on public.moderation_reason_codes from anon, authenticated;
grant select on public.moderation_reason_codes to authenticated;
drop policy if exists moderation_reason_codes_read on public.moderation_reason_codes;
create policy moderation_reason_codes_read on public.moderation_reason_codes for select to authenticated using (active);
insert into public.moderation_reason_codes(code, label, applies_to, severity, appealable) values
  ('document_invalid', 'Document is invalid, unreadable or not for this business', array['document','verification'], 'medium', true),
  ('document_expired', 'Document has expired', array['document','verification'], 'medium', true),
  ('document_forged', 'Document appears altered or forged', array['document','verification','workspace'], 'critical', true),
  ('cover_insufficient', 'Insurance cover is below the required minimum', array['document'], 'medium', true),
  ('identity_mismatch', 'Identity or business details do not match the evidence', array['verification','workspace'], 'high', true),
  ('fake_review', 'Review is not from a genuine customer or is incentivised', array['review'], 'high', true),
  ('abusive_content', 'Abusive, hateful or harassing content', array['review','listing','message','media','event','template'], 'high', true),
  ('personal_data', 'Contains personal data that should not be public', array['review','listing','message','media','template'], 'medium', true),
  ('off_platform', 'Attempts to move payment or contact off platform', array['review','listing','message'], 'medium', true),
  ('misleading_listing', 'Misleading listing content, pricing or claims', array['listing','event','template'], 'medium', true),
  ('prohibited_item', 'Prohibited item, service or event', array['listing','event','media'], 'high', true),
  ('fraud_suspected', 'Suspected fraud or payment abuse', array['workspace','listing','event','user'], 'critical', true),
  ('safety_concern', 'Safety concern reported at an event', array['workspace','listing','event'], 'high', true),
  ('spam', 'Spam or duplicate content', array['review','listing','message','template'], 'low', true),
  ('other_policy', 'Other policy breach (explained in the note)', array['document','verification','review','listing','message','media','event','template','workspace','user'], 'medium', true)
on conflict (code) do update set label = excluded.label, applies_to = excluded.applies_to, severity = excluded.severity, appealable = excluded.appealable;

create table if not exists public.enforcement_actions (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  case_id uuid references public.trust_cases(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,          -- tenant the subject belongs to (for RLS/notice)
  subject_type text not null check (subject_type in ('workspace','listing','review','user','event','message','media','template')),
  subject_id uuid not null,
  action text not null check (action in ('warning','listing_hidden','workspace_suspended','booking_block','review_removed','review_hidden','content_removed')),
  reason_code text not null references public.moderation_reason_codes(code),
  note text not null check (length(trim(note)) >= 5 and length(note) <= 2000),
  evidence jsonb not null default '[]' check (jsonb_typeof(evidence) = 'array'),
  status text not null default 'active' check (status in ('active','lifted','overturned','expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  appealable boolean not null default true,
  appeal_deadline timestamptz,
  appeal_case_id uuid references public.trust_cases(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  lifted_by uuid references auth.users(id) on delete set null,
  lifted_at timestamptz,
  lift_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists enforcement_actions_subject_idx on public.enforcement_actions(subject_type, subject_id, status);
create index if not exists enforcement_actions_ws_idx on public.enforcement_actions(workspace_id, status, created_at desc);
alter table public.enforcement_actions enable row level security;
revoke all on public.enforcement_actions from anon, authenticated;
grant select on public.enforcement_actions to authenticated;
-- The affected tenant sees actions against it (with reason and appeal path); review authors see actions on their reviews.
drop policy if exists enforcement_actions_read on public.enforcement_actions;
create policy enforcement_actions_read on public.enforcement_actions for select to authenticated using (
  (workspace_id is not null and (public.has_permission(workspace_id, 'settings.manage') or public.has_permission(workspace_id, 'listings.manage')))
  or (subject_type = 'review' and exists (select 1 from public.reviews r where r.id = subject_id and r.user_id = (select auth.uid())))
  or (subject_type = 'user' and subject_id = (select auth.uid()))
  or public.has_admin_permission('trust'));

create table if not exists public.trust_listing_holds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('credential_lapse','enforcement')),
  reason_code text not null,
  detail text not null default '',
  credential_key text,
  enforcement_action_id uuid references public.enforcement_actions(id) on delete set null,
  was_published boolean not null default true,
  held_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text
);
create unique index if not exists trust_listing_holds_active_uq on public.trust_listing_holds(listing_id, source, coalesce(credential_key, ''), coalesce(enforcement_action_id, '00000000-0000-0000-0000-000000000000'::uuid)) where released_at is null;
create index if not exists trust_listing_holds_ws_idx on public.trust_listing_holds(workspace_id) where released_at is null;
alter table public.trust_listing_holds enable row level security;
revoke all on public.trust_listing_holds from anon, authenticated;
grant select on public.trust_listing_holds to authenticated;
drop policy if exists trust_listing_holds_read on public.trust_listing_holds;
create policy trust_listing_holds_read on public.trust_listing_holds for select to authenticated using (public.is_workspace_member(workspace_id) or public.has_admin_permission('trust'));

-- ═══ 3. Provider documents: insurance fields, lineage, private evidence ═══
alter table public.provider_documents
  add column if not exists cover_amount_minor bigint check (cover_amount_minor is null or cover_amount_minor > 0),
  add column if not exists cover_currency text check (cover_currency is null or cover_currency ~ '^[A-Z]{3}$'),
  add column if not exists renewal_of uuid references public.provider_documents(id) on delete set null,
  add column if not exists superseded_by uuid references public.provider_documents(id) on delete set null,
  add column if not exists review_reason_code text,
  add column if not exists expired_at timestamptz,
  add column if not exists last_reminder_days integer,
  add column if not exists updated_at timestamptz not null default now();
grant insert (cover_amount_minor, cover_currency) on public.provider_documents to authenticated;
create index if not exists provider_documents_current_idx on public.provider_documents(workspace_id, credential_key, created_at desc) where status <> 'superseded';

-- Submission guard: the file must be the submitter's own verified private upload; status always starts at submitted;
-- the stored object becomes `sensitive` (fail-closed quarantine until a clean ClamAV verdict). Audited + outbox.
create or replace function public.provider_documents_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cur uuid;
begin
  if tg_op = 'INSERT' then
    if actor is not null then
      if new.uploaded_by is distinct from actor then raise exception 'uploader_mismatch' using errcode = '42501'; end if;
      if not exists (select 1 from public.verified_private_uploads v where v.path = new.file_path and v.owner_id = actor) then
        raise exception 'upload_not_verified' using errcode = '42501';
      end if;
      new.status := 'submitted'; new.reviewed_by := null; new.reviewed_at := null; new.rejection_reason := null;
    end if;
    if new.cover_amount_minor is not null and new.cover_currency is null then new.cover_currency := 'GBP'; end if;
    select d.id into cur from public.provider_documents d where d.workspace_id = new.workspace_id and d.credential_key = new.credential_key and d.status = 'verified' order by d.created_at desc limit 1;
    new.renewal_of := coalesce(new.renewal_of, cur);
    update public.storage_attribution set file_class = 'sensitive' where bucket = 'workspace-files' and name = new.file_path and file_class <> 'sensitive';
    return new;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists provider_documents_guard on public.provider_documents;
create trigger provider_documents_guard before insert or update on public.provider_documents for each row execute function public.provider_documents_guard();

create or replace function public.provider_documents_after() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
      values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end, new.workspace_id, 'trust.document_submitted',
        jsonb_build_object('document_id', new.id, 'credential_key', new.credential_key, 'renewal', new.renewal_of is not null));
    if exists (select 1 from public.storage_attribution a where a.bucket = 'workspace-files' and a.name = new.file_path and coalesce(a.av_verdict, '') <> 'clean') then
      perform public.enqueue_job('files.scan', jsonb_build_object('bucket', 'workspace-files', 'name', new.file_path), 'files.scan:workspace-files/' || new.file_path, null, new.workspace_id);
    end if;
  end if;
  perform public.trust_refresh_workspace(new.workspace_id);
  return null;
end $$;

-- ═══ 4. Computed credential state ═══
-- Rules that apply to one listing (kind + category alias) — internal.
create or replace function public.trust_listing_rules(p_kind text, p_category text)
returns table(credential_key text, requirement text, gates_marketplace boolean, min_cover_minor bigint, cover_currency text)
language sql stable security definer set search_path = '' as $$
  select distinct on (r.credential_key) r.credential_key, r.requirement, r.gates_marketplace, r.min_cover_minor, r.cover_currency
  from public.credential_requirements r
  where (r.capability is null or r.capability = p_kind)
    and (r.category is null or lower(r.category) = lower(coalesce(p_category, '')) or lower(coalesce(p_category, '')) = any(r.category_aliases)
         or lower(trim(split_part(coalesce(p_category, ''), '>', 2))) = any(r.category_aliases))
    and r.country is null
  order by r.credential_key, (r.requirement = 'required') desc, r.gates_marketplace desc, r.min_cover_minor desc nulls last;
$$;

-- Rules that apply to a workspace: capability/category/country (original §31 logic) ∪ every listing's rules.
create or replace function public.trust_workspace_rules(p_workspace uuid)
returns table(credential_key text, requirement text, gates_marketplace boolean, min_cover_minor bigint, cover_currency text)
language sql stable security definer set search_path = '' as $$
  with ws as (
    select w.id, w.capabilities, upper(coalesce(nullif(w.settings->'business'->>'country_code', ''), case w.settings->'business'->>'country' when 'United Kingdom' then 'GB' when 'Ireland' then 'IE' when 'United States' then 'US' when 'Canada' then 'CA' when 'Germany' then 'DE' when 'France' then 'FR' when 'United Arab Emirates' then 'AE' when 'South Africa' then 'ZA' when 'Australia' then 'AU' end)) as country,
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(w.settings->'business'->'service_categories') = 'array' then w.settings->'business'->'service_categories' else '[]' end)), '{}') as categories
    from public.workspaces w where w.id = p_workspace
  ), base as (
    select r.credential_key, r.requirement, r.gates_marketplace, r.min_cover_minor, r.cover_currency
    from public.credential_requirements r, ws
    where (r.capability is null or r.capability = any(ws.capabilities))
      and (r.category is null or r.category = any(ws.categories))
      and (r.country is null or r.country = ws.country)
    union all
    select x.* from public.listings l cross join lateral public.trust_listing_rules(l.kind, l.category) x where l.workspace_id = p_workspace
  )
  select distinct on (b.credential_key) b.credential_key, b.requirement, b.gates_marketplace, b.min_cover_minor, b.cover_currency
  from base b order by b.credential_key, (b.requirement = 'required') desc, b.gates_marketplace desc, b.min_cover_minor desc nulls last;
$$;

-- Effective state of one credential for a workspace, from current evidence (time-aware).
create or replace function public.trust_credential_eval(p_workspace uuid, p_key text, p_min_cover bigint)
returns table(status text, expires_on date, pending_renewal boolean, lapsed boolean, current_document uuid, cover_amount_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cur public.provider_documents; latest public.provider_documents; lapsed_doc public.provider_documents;
begin
  select * into cur from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = p_key and d.status = 'verified'
    and (d.expires_on is null or d.expires_on >= current_date) order by d.created_at desc limit 1;
  select * into latest from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = p_key and d.status <> 'superseded' order by d.created_at desc limit 1;
  if cur.id is not null then
    if p_min_cover is not null and cur.cover_amount_minor is not null and cur.cover_amount_minor < p_min_cover then
      return query select 'insufficient_cover'::text, cur.expires_on, coalesce(latest.id is distinct from cur.id and latest.status in ('submitted','in_review'), false), true, cur.id, cur.cover_amount_minor; return;
    end if;
    return query select 'verified'::text, cur.expires_on, coalesce(latest.id is distinct from cur.id and latest.status in ('submitted','in_review'), false), false, cur.id, cur.cover_amount_minor; return;
  end if;
  select * into lapsed_doc from public.provider_documents d where d.workspace_id = p_workspace and d.credential_key = p_key
    and (d.status = 'expired' or (d.status = 'verified' and d.expires_on < current_date)) order by d.created_at desc limit 1;
  if lapsed_doc.id is not null then
    return query select 'expired'::text, lapsed_doc.expires_on, coalesce(latest.status in ('submitted','in_review'), false), true, null::uuid, lapsed_doc.cover_amount_minor; return;
  end if;
  if latest.id is not null then
    return query select latest.status, latest.expires_on, false, false, null::uuid, latest.cover_amount_minor; return;
  end if;
  return query select 'missing'::text, null::date, false, false, null::uuid, null::bigint;
end $$;

create or replace function public.trust_reason_text(p_label text, p_status text, p_expires date, p_min_cover bigint) returns text
language sql stable set search_path = '' as $$
  select case p_status
    when 'missing' then p_label || ' has not been provided. Upload it in Settings → Trust & credentials to list this service on the marketplace.'
    when 'expired' then p_label || ' expired' || coalesce(' on ' || to_char(p_expires, 'FMDD Mon YYYY'), '') || '. Upload the renewed document; affected listings stay hidden until Gala Dock verifies it.'
    when 'rejected' then p_label || ' was rejected. Upload a valid document for review.'
    when 'submitted' then p_label || ' is waiting for Gala Dock review.'
    when 'in_review' then p_label || ' is being reviewed by Gala Dock.'
    when 'insufficient_cover' then p_label || ' cover is below the required minimum' || coalesce(' of £' || to_char(p_min_cover / 100, 'FM999,999,999'), '') || '. Upload a policy with sufficient cover.'
    else p_label || ': ' || p_status end;
$$;

-- Active enforcement against a workspace or one of its listings.
create or replace function public.trust_active_enforcement(p_workspace uuid, p_listing uuid default null)
returns table(action text, reason_code text, action_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.action, a.reason_code, a.id from public.enforcement_actions a
  where a.status = 'active' and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
    and ((a.subject_type = 'workspace' and a.subject_id = p_workspace and a.action in ('workspace_suspended','booking_block'))
      or (p_listing is not null and a.subject_type = 'listing' and a.subject_id = p_listing and a.action = 'listing_hidden'));
$$;

-- Per-credential rows (workspace union or a single listing). Internal: no membership check.
create or replace function public.trust_credential_rows(p_workspace uuid, p_listing uuid default null)
returns table(credential_key text, label text, category text, requirement text, gates_marketplace boolean, status text, expires_on date,
  pending_renewal boolean, lapsed boolean, blocking boolean, reason text, min_cover_minor bigint, cover_amount_minor bigint, days_to_expiry integer)
language sql stable security definer set search_path = '' as $$
  with rules as (
    select * from public.trust_workspace_rules(p_workspace) where p_listing is null
    union all
    select x.* from public.listings l cross join lateral public.trust_listing_rules(l.kind, l.category) x where p_listing is not null and l.id = p_listing and l.workspace_id = p_workspace
  )
  select r.credential_key, t.label, t.category, r.requirement, r.gates_marketplace, e.status, e.expires_on, e.pending_renewal, e.lapsed,
    (r.gates_marketplace and e.status <> 'verified'),
    case when e.status = 'verified' then case when e.pending_renewal then t.label || ' renewal is waiting for review.' else null end
         else public.trust_reason_text(t.label, e.status, e.expires_on, r.min_cover_minor) end,
    r.min_cover_minor, e.cover_amount_minor, case when e.expires_on is not null then (e.expires_on - current_date) end
  from rules r join public.credential_types t on t.key = r.credential_key
  cross join lateral public.trust_credential_eval(p_workspace, r.credential_key, r.min_cover_minor) e
  order by (r.requirement = 'required') desc, t.label;
$$;

-- Identity: Stripe Connect (webhook mirror) or Gala Dock business/identity review, verified and not expired.
create or replace function public.trust_identity_verified(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.verification_checks c where c.workspace_id = p_workspace and c.subject_type = 'workspace'
    and c.status = 'verified' and (c.expires_at is null or c.expires_at > now()));
$$;

-- Full eligibility for a workspace or one listing. Internal.
create or replace function public.trust_eligibility_internal(p_workspace uuid, p_listing uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare blockers jsonb := '[]'; lapses jsonb := '[]'; missing jsonb := '[]'; r record; enf record; identity boolean; pol public.trust_policy; suspended boolean := false;
begin
  select * into pol from public.trust_policy limit 1;
  identity := public.trust_identity_verified(p_workspace);
  for r in select * from public.trust_credential_rows(p_workspace, p_listing) where blocking loop
    blockers := blockers || jsonb_build_object('code', case when r.lapsed then 'credential_lapsed' when r.status = 'missing' then 'credential_missing' else 'credential_' || r.status end,
      'credential_key', r.credential_key, 'status', r.status, 'reason', r.reason, 'expires_on', r.expires_on);
    if r.lapsed then lapses := lapses || jsonb_build_object('credential_key', r.credential_key, 'status', r.status, 'reason', r.reason);
    else missing := missing || jsonb_build_object('credential_key', r.credential_key, 'status', r.status); end if;
  end loop;
  for enf in select * from public.trust_active_enforcement(p_workspace, p_listing) loop
    suspended := true;
    blockers := blockers || jsonb_build_object('code', 'enforcement_' || enf.action, 'action_id', enf.action_id, 'reason_code', enf.reason_code,
      'reason', case enf.action when 'listing_hidden' then 'This listing is hidden by Gala Dock Trust & Safety. See Settings → Trust & credentials to appeal.'
                                else 'Your workspace is restricted by Gala Dock Trust & Safety. See Settings → Trust & credentials to appeal.' end);
  end loop;
  return jsonb_build_object(
    'identity_verified', identity,
    'can_publish', jsonb_array_length(blockers) = 0,
    'can_accept', not suspended and jsonb_array_length(lapses) = 0 and (not coalesce(pol.missing_blocks_acceptance, false) or jsonb_array_length(missing) = 0),
    'lapsed', jsonb_array_length(lapses) > 0,
    'suspended', suspended,
    'blockers', blockers,
    'computed_at', now());
end $$;

-- Badge calculations (pure inputs so BEFORE triggers can use NEW values).
create or replace function public.trust_listing_badge_calc(p_workspace uuid, p_listing uuid, p_kind text, p_category text, p_review_status text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_review_status, '') = 'approved'
    and public.trust_identity_verified(p_workspace)
    and not exists (select 1 from public.trust_active_enforcement(p_workspace, p_listing))
    and not exists (select 1 from public.trust_listing_rules(p_kind, p_category) x
                    cross join lateral public.trust_credential_eval(p_workspace, x.credential_key, x.min_cover_minor) e
                    where x.requirement = 'required' and e.status <> 'verified');
$$;

create or replace function public.trust_workspace_status_calc(p_workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.trust_active_enforcement(p_workspace, null) e where e.action = 'workspace_suspended') then 'rejected'
    when public.trust_identity_verified(p_workspace) then 'verified'
    when exists (select 1 from public.verification_checks c where c.workspace_id = p_workspace and c.status in ('submitted','pending_review','action_required')) then 'pending'
    when exists (select 1 from public.verification_checks c where c.workspace_id = p_workspace and c.status in ('rejected','suspended')) then 'rejected'
    else 'unverified' end;
$$;

-- ═══ 5. Derived caches: cannot be written stale ═══
create or replace function public.listings_trust_badge_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.verified := public.trust_listing_badge_calc(new.workspace_id, new.id, new.kind, new.category, new.review_status);
  return new;
end $$;
drop trigger if exists listings_trust_badge_guard on public.listings;
create trigger listings_trust_badge_guard before insert or update of verified, review_status, kind, category, workspace_id on public.listings
  for each row execute function public.listings_trust_badge_guard();

create or replace function public.workspaces_trust_status_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.verification_status := 'unverified'; return new; end if;
  new.verification_status := public.trust_workspace_status_calc(new.id);
  return new;
end $$;
drop trigger if exists workspaces_trust_status_guard on public.workspaces;
create trigger workspaces_trust_status_guard before insert or update of verification_status on public.workspaces
  for each row execute function public.workspaces_trust_status_guard();

-- Recompute caches + lapse holds for one workspace (idempotent). Internal; called by evidence triggers, commands and the daily job.
create or replace function public.trust_refresh_workspace(p_workspace uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l record; elig jsonb; lapsed_keys text[]; held integer := 0; released integer := 0; badges integer := 0; was boolean; n integer; ws_status text;
begin
  if p_workspace is null then return '{}'; end if;
  perform public.advisory_xact_lock('trust_refresh', p_workspace::text);
  ws_status := public.trust_workspace_status_calc(p_workspace);
  update public.workspaces set verification_status = ws_status where id = p_workspace and verification_status is distinct from ws_status;
  for l in select id, kind, category, review_status, verified, published from public.listings where workspace_id = p_workspace loop
    was := l.verified;
    update public.listings set verified = not verified where id = l.id and verified is distinct from public.trust_listing_badge_calc(p_workspace, l.id, l.kind, l.category, l.review_status);
    get diagnostics n = row_count; badges := badges + n;
    -- Lapsed gating evidence → hold the listing (unpublish) with a reason; renewed → release holds this source created.
    select array_agg(x->>'credential_key') into lapsed_keys from jsonb_array_elements(public.trust_eligibility_internal(p_workspace, l.id)->'blockers') x where x->>'code' = 'credential_lapsed';
    if lapsed_keys is not null then
      insert into public.trust_listing_holds(listing_id, workspace_id, source, reason_code, detail, credential_key, was_published)
        select l.id, p_workspace, 'credential_lapse', 'document_expired', 'Required evidence lapsed: ' || k, k, l.published
        from unnest(lapsed_keys) k
        where not exists (select 1 from public.trust_listing_holds h where h.listing_id = l.id and h.source = 'credential_lapse' and h.credential_key = k and h.released_at is null);
      get diagnostics n = row_count; held := held + n;
      if l.published then update public.listings set published = false where id = l.id; end if;
    end if;
    update public.trust_listing_holds h set released_at = now(), release_reason = 'evidence_restored'
      where h.listing_id = l.id and h.source = 'credential_lapse' and h.released_at is null and not (h.credential_key = any(coalesce(lapsed_keys, '{}')));
    get diagnostics n = row_count; released := released + n;
    if n > 0 and not exists (select 1 from public.trust_listing_holds h where h.listing_id = l.id and h.released_at is null)
       and exists (select 1 from public.trust_listing_holds h where h.listing_id = l.id and h.was_published and h.release_reason = 'evidence_restored' and h.released_at > now() - interval '1 minute') then
      update public.listings set published = true where id = l.id and not published;
    end if;
  end loop;
  if held > 0 or released > 0 then
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_workspace, 'trust.eligibility_changed',
      jsonb_build_object('listings_held', held, 'holds_released', released));
  end if;
  return jsonb_build_object('workspace_status', ws_status, 'badges_changed', badges, 'held', held, 'released', released);
end $$;

drop trigger if exists provider_documents_after on public.provider_documents;
create trigger provider_documents_after after insert or update of status, expires_on, cover_amount_minor on public.provider_documents
  for each row execute function public.provider_documents_after();

create or replace function public.trust_refresh_from_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  ws := coalesce(to_jsonb(new) ->> 'workspace_id', to_jsonb(old) ->> 'workspace_id')::uuid;
  if ws is not null then perform public.trust_refresh_workspace(ws); end if;
  return null;
end $$;
drop trigger if exists verification_checks_trust_refresh on public.verification_checks;
create trigger verification_checks_trust_refresh after insert or update of status, expires_at on public.verification_checks for each row execute function public.trust_refresh_from_row();
drop trigger if exists enforcement_actions_trust_refresh on public.enforcement_actions;
create trigger enforcement_actions_trust_refresh after insert or update of status, ends_at on public.enforcement_actions for each row execute function public.trust_refresh_from_row();

-- ═══ 6. Read APIs ═══
-- Member/admin view: unchanged leading columns (deployed UI + readiness keep working) plus the computed detail.
drop function if exists public.workspace_credential_status(uuid);
create function public.workspace_credential_status(p_workspace uuid)
returns table(credential_key text, label text, requirement text, gates_marketplace boolean, status text, expires_on date,
  pending_renewal boolean, blocking boolean, reason text, category text, min_cover_minor bigint, cover_amount_minor bigint, days_to_expiry integer)
language sql stable security definer set search_path = '' as $$
  select r.credential_key, r.label, r.requirement, r.gates_marketplace, r.status, r.expires_on, r.pending_renewal, r.blocking, r.reason, r.category,
    r.min_cover_minor, r.cover_amount_minor, r.days_to_expiry
  from public.trust_credential_rows(p_workspace, null) r
  where public.is_workspace_member(p_workspace) or public.has_admin_permission('trust');
$$;

-- Derived trust summary. Public-safe fields for anyone signed in; blockers/reasons only for members and Trust & Safety.
create or replace function public.trust_summary(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e jsonb; insider boolean; req integer; ok integer;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insider := public.is_workspace_member(p_workspace) or public.has_admin_permission('trust');
  e := public.trust_eligibility_internal(p_workspace, null);
  select count(*) filter (where requirement = 'required'), count(*) filter (where requirement = 'required' and status = 'verified') into req, ok
    from public.trust_credential_rows(p_workspace, null);
  return jsonb_build_object(
    'badge', (e->>'identity_verified')::boolean and req = ok and not (e->>'suspended')::boolean,
    'identity_verified', (e->>'identity_verified')::boolean,
    'required_credentials', req, 'verified_credentials', ok,
    'scope', 'Verified means Gala Dock or Stripe checked the business identity and Gala Dock reviewed the required, current compliance documents. It does not guarantee service quality.',
    'computed_at', e->'computed_at')
    || case when insider then jsonb_build_object('can_publish', e->'can_publish', 'can_accept', e->'can_accept', 'lapsed', e->'lapsed', 'suspended', e->'suspended', 'blockers', e->'blockers') else '{}'::jsonb end;
end $$;

create or replace function public.listing_trust(p_listing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.listings; e jsonb; insider boolean;
begin
  select * into l from public.listings where id = p_listing;
  if not found or not (l.published or public.is_workspace_member(l.workspace_id) or public.has_admin_permission('trust')) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insider := public.is_workspace_member(l.workspace_id) or public.has_admin_permission('trust');
  e := public.trust_eligibility_internal(l.workspace_id, l.id);
  return jsonb_build_object('listing_id', l.id, 'badge', public.trust_listing_badge_calc(l.workspace_id, l.id, l.kind, l.category, l.review_status),
      'identity_verified', e->'identity_verified', 'computed_at', e->'computed_at')
    || case when insider then jsonb_build_object('can_publish', e->'can_publish', 'can_accept', e->'can_accept', 'blockers', e->'blockers',
         'holds', coalesce((select jsonb_agg(jsonb_build_object('source', h.source, 'reason_code', h.reason_code, 'detail', h.detail, 'held_at', h.held_at))
                            from public.trust_listing_holds h where h.listing_id = l.id and h.released_at is null), '[]')) else '{}'::jsonb end;
end $$;

-- ═══ 7. Gating ═══
-- Publish readiness: original checks + trust blockers ('credentials' / 'trust_hold'), with provider-facing reasons.
create or replace function public.listing_readiness(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.listings; ws public.workspaces; missing text[] := '{}'; e jsonb; reasons jsonb;
begin
  select * into l from public.listings where id = p_listing;
  if not found or not public.is_workspace_member(l.workspace_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = l.workspace_id;
  if length(trim(l.name)) < 3 then missing := array_append(missing, 'listing_name'); end if;
  if length(trim(l.description)) < 40 then missing := array_append(missing, 'listing_description'); end if;
  if length(trim(l.location)) = 0 then missing := array_append(missing, 'listing_location'); end if;
  if coalesce(jsonb_array_length(l.details->'photos'), 0) = 0 then missing := array_append(missing, 'listing_photo'); end if;
  if not ws.onboarding_complete then missing := array_append(missing, 'workspace_setup'); end if;
  if ws.verification_status <> 'verified' then missing := array_append(missing, 'verification'); end if;
  if ws.payout_status <> 'active' then missing := array_append(missing, 'payouts'); end if;
  e := public.trust_eligibility_internal(l.workspace_id, l.id);
  reasons := coalesce(e->'blockers', '[]');
  if exists (select 1 from jsonb_array_elements(reasons) x where x->>'code' like 'credential_%') then missing := array_append(missing, 'credentials'); end if;
  if exists (select 1 from jsonb_array_elements(reasons) x where x->>'code' like 'enforcement_%') then missing := array_append(missing, 'trust_hold'); end if;
  return jsonb_build_object('eligible', cardinality(missing) = 0, 'missing', to_jsonb(missing),
    'verification_status', ws.verification_status, 'payout_status', ws.payout_status, 'published', l.published, 'trust_blockers', reasons);
end;
$$;

-- Acceptance guard: a signed-in provider (or customer confirmation) cannot take on new marketplace work while gating evidence has
-- lapsed or the workspace/listing is restricted. Service-role/webhook paths are not blocked (money may already be captured).
create or replace function public.trust_assert_can_accept(p_workspace uuid, p_listing uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare e jsonb;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or p_workspace is null then return; end if;
  e := public.trust_eligibility_internal(p_workspace, p_listing);
  if not coalesce((e->>'can_accept')::boolean, true) then
    raise exception 'trust_ineligible: %', coalesce((select string_agg(x->>'reason', ' ') from jsonb_array_elements(e->'blockers') x where x->>'code' in ('credential_lapsed') or x->>'code' like 'enforcement_%'
      or (x->>'code' = 'credential_missing' and (select missing_blocks_acceptance from public.trust_policy limit 1))), 'Required evidence is not current.')
      using errcode = '22023', hint = 'Renew the document in Settings → Trust & credentials.';
  end if;
end $$;

create or replace function public.provider_quotes_trust_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' then
    if tg_op = 'UPDATE' then
      if old.status = 'sent' then return new; end if;
    end if;
    perform public.trust_assert_can_accept(new.workspace_id, (select b.listing_id from public.build_items b where b.id = new.build_item_id));
  end if;
  return new;
end $$;
drop trigger if exists provider_quotes_trust_guard on public.provider_quotes;
create trigger provider_quotes_trust_guard before insert or update of status on public.provider_quotes for each row execute function public.provider_quotes_trust_guard();

create or replace function public.provider_jobs_trust_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.source, '') = 'marketplace' then perform public.trust_assert_can_accept(new.workspace_id, new.listing_id); end if;
  return new;
end $$;
drop trigger if exists provider_jobs_trust_guard on public.provider_jobs;
create trigger provider_jobs_trust_guard before insert on public.provider_jobs for each row execute function public.provider_jobs_trust_guard();

-- Publishing re-checks holds: a held listing cannot be republished by hand.
create or replace function public.publish_listing(p_listing uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.listings; readiness jsonb;
begin
  select * into l from public.listings where id = p_listing for update;
  if not found or not public.is_workspace_owner(l.workspace_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  readiness := public.listing_readiness(p_listing);
  if not (readiness->>'eligible')::boolean then return readiness; end if;
  update public.listings set published = true where id = p_listing;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, 'listing.published', jsonb_build_object('listing_id', l.id));
  return readiness || jsonb_build_object('published', true);
end;
$$;

-- ═══ 8. Document review (Trust & Safety) ═══
-- Only a clean (scanned) file can be verified; rejection needs a reason; verified supersedes the older verified copy; expiry and
-- cover can be corrected from the evidence. Eligibility/badges refresh through the document trigger.
create or replace function public.review_provider_document(p_document uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.trust_review_document(p_document, p_status, case when p_status = 'rejected' then 'document_invalid' end, p_reason, null, null);
end;
$$;

create or replace function public.trust_review_document(p_document uuid, p_status text, p_reason_code text, p_reason text,
  p_expires_on date default null, p_cover_amount_minor bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare d public.provider_documents; decision text;
begin
  if not (public.has_admin_permission('trust') or exists (select 1 from public.platform_admins where user_id = auth.uid())) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('in_review','verified','rejected') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_reason_code is not null and not exists (select 1 from public.moderation_reason_codes c where c.code = p_reason_code) then raise exception 'invalid_reason_code' using errcode = '22023'; end if;
  select * into d from public.provider_documents where id = p_document for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.status in ('superseded','expired') and p_status <> 'rejected' then raise exception 'document_not_reviewable' using errcode = '22023'; end if;
  if p_status = 'verified' then
    decision := public.file_access_decision('workspace-files', d.file_path);
    if decision <> 'ok' then raise exception 'file_not_cleared: %', decision using errcode = '22023', hint = 'The file must pass the malware scan before it can be verified.'; end if;
    if coalesce(p_expires_on, d.expires_on) is not null and coalesce(p_expires_on, d.expires_on) < current_date then raise exception 'already_expired' using errcode = '22023'; end if;
  end if;
  update public.provider_documents set status = p_status, review_reason_code = p_reason_code,
    rejection_reason = case when p_status = 'rejected' then left(p_reason, 500) end,
    expires_on = coalesce(p_expires_on, expires_on), cover_amount_minor = coalesce(p_cover_amount_minor, cover_amount_minor),
    cover_currency = case when p_cover_amount_minor is not null then coalesce(cover_currency, 'GBP') else cover_currency end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_document;
  if p_status = 'verified' then
    update public.provider_documents o set status = 'superseded', superseded_by = d.id
      where o.workspace_id = d.workspace_id and o.credential_key = d.credential_key and o.id <> d.id and o.status in ('verified','expired');
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, actor_type, metadata)
    values (auth.uid(), d.workspace_id, 'trust.document_reviewed', 'admin', jsonb_build_object('document_id', d.id, 'credential_key', d.credential_key, 'status', p_status, 'reason_code', p_reason_code));
  return jsonb_build_object('document_id', d.id, 'status', p_status, 'eligibility', public.trust_eligibility_internal(d.workspace_id, null));
end $$;

-- Signed access decision for Trust & Safety reviewers and the owning workspace (the app signs a 5-minute URL only when this says ok).
create or replace function public.provider_document_access(p_document uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.provider_documents;
begin
  select * into d from public.provider_documents where id = p_document;
  if not found or not (public.has_admin_permission('trust') or public.has_permission(d.workspace_id, 'settings.manage') or public.has_permission(d.workspace_id, 'listings.manage')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('bucket', 'workspace-files', 'path', d.file_path, 'file_name', d.file_name, 'decision', public.file_access_decision('workspace-files', d.file_path));
end $$;

-- ═══ 9. Grants ═══
revoke all on function public.provider_documents_guard(), public.provider_documents_after(), public.trust_refresh_from_row(),
  public.listings_trust_badge_guard(), public.workspaces_trust_status_guard(), public.provider_quotes_trust_guard(), public.provider_jobs_trust_guard()
  from public, anon, authenticated;
revoke all on function public.trust_listing_rules(text, text), public.trust_workspace_rules(uuid), public.trust_credential_eval(uuid, text, bigint),
  public.trust_reason_text(text, text, date, bigint), public.trust_active_enforcement(uuid, uuid), public.trust_credential_rows(uuid, uuid),
  public.trust_identity_verified(uuid), public.trust_eligibility_internal(uuid, uuid), public.trust_listing_badge_calc(uuid, uuid, text, text, text),
  public.trust_workspace_status_calc(uuid), public.trust_refresh_workspace(uuid), public.trust_assert_can_accept(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.trust_listing_rules(text, text), public.trust_workspace_rules(uuid), public.trust_credential_eval(uuid, text, bigint),
  public.trust_reason_text(text, text, date, bigint), public.trust_active_enforcement(uuid, uuid), public.trust_credential_rows(uuid, uuid),
  public.trust_identity_verified(uuid), public.trust_eligibility_internal(uuid, uuid), public.trust_listing_badge_calc(uuid, uuid, text, text, text),
  public.trust_workspace_status_calc(uuid), public.trust_refresh_workspace(uuid), public.trust_assert_can_accept(uuid, uuid)
  to service_role;
revoke all on function public.workspace_credential_status(uuid), public.trust_summary(uuid), public.listing_trust(uuid), public.listing_readiness(uuid),
  public.publish_listing(uuid), public.review_provider_document(uuid, text, text), public.trust_review_document(uuid, text, text, text, date, bigint),
  public.provider_document_access(uuid) from public, anon;
grant execute on function public.workspace_credential_status(uuid), public.trust_summary(uuid), public.listing_trust(uuid), public.listing_readiness(uuid),
  public.publish_listing(uuid), public.review_provider_document(uuid, text, text), public.trust_review_document(uuid, text, text, text, date, bigint),
  public.provider_document_access(uuid) to authenticated, service_role;

