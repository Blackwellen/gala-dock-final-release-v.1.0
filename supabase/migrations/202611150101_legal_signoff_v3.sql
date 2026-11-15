-- Legal sign-off (R3, owner 2026-11-15): the v3 legal pack becomes binding with versioned, per-role acceptance and UK P2B notice.
-- Additive only: four new tables, new functions, one new trigger on profiles, and `create or replace` of three read-only version
-- helpers (legal_terms_version, partner_terms_version) so the engine follows the published texts.
--
--  1. legal_documents          — mirror of src/lib/legal/registry.ts (slug, title, URL, audience, who accepts). Seeded here.
--  2. legal_document_versions  — one row per published version: sha256 of the exact text, published_at, effective_at (consumers and
--                                "all" documents: on publication) and business_effective_at (15 full days after the notice, London
--                                midnight, P2B Regulation art. 3(2)). Written only by legal_publish_pack, run after deploy by
--                                scripts/legal/publish-pack.mjs, which checks the live site serves exactly the texts it records.
--  3. legal_acceptances        — append-only record of who accepted which version, in which role, with each express term ticked.
--  4. legal_packs              — one row per published pack, with the notice counts.
-- Nothing is published and no notice is queued by this migration: before legal_publish_pack runs, legal_current_versions() is empty,
-- so no banner, gate or email exists.

-- ═══ 1. Tables ═══
create table if not exists public.legal_documents (
  slug text primary key check (slug ~ '^[a-z][a-z-]{1,40}$'),
  title text not null check (length(title) between 3 and 120),
  href text not null check (href ~ '^/[a-z/-]+$'),
  audience text not null check (audience in ('consumer', 'business', 'all')),
  accept_roles text[] not null default '{}' check (accept_roles <@ array['customer','organiser','supplier','venue','partner','promoter']::text[]),
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.legal_document_versions (
  slug text not null references public.legal_documents(slug),
  version text not null check (length(version) between 3 and 40),
  label text not null check (length(label) between 1 and 20),
  pack text not null,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  previous_version text,
  published_at timestamptz not null default now(),
  effective_at timestamptz not null,
  business_effective_at timestamptz not null,
  published_by text not null default 'legal_publish_pack',
  primary key (slug, version),
  check (business_effective_at >= effective_at and effective_at >= published_at)
);
create table if not exists public.legal_packs (
  pack text primary key,
  published_at timestamptz not null default now(),
  business_effective_at timestamptz not null,
  notices jsonb not null default '{}',
  published_by text
);
create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null,                                   -- no FK: acceptance records outlive the account (retention: 6 years)
  slug text not null,
  version text not null,
  role text not null check (role in ('customer','organiser','supplier','venue','partner','promoter')),
  express text not null default '' check (express in ('', 'payment_terms', 'dispute_deadline_rules', 'cancellation_fees')),
  workspace_id uuid,
  source text not null check (source in ('signup', 'updates', 'signup_backfill')),
  accepted_at timestamptz not null default now(),
  foreign key (slug, version) references public.legal_document_versions(slug, version),
  unique (user_id, slug, version, express)
);
create index if not exists legal_acceptances_user_idx on public.legal_acceptances(user_id, slug);

alter table public.legal_documents enable row level security;
alter table public.legal_document_versions enable row level security;
alter table public.legal_packs enable row level security;
alter table public.legal_acceptances enable row level security;
revoke all on public.legal_documents, public.legal_document_versions, public.legal_packs, public.legal_acceptances from anon, authenticated;
grant select on public.legal_documents, public.legal_document_versions to anon, authenticated;
grant select on public.legal_acceptances to authenticated;
grant all on public.legal_documents, public.legal_document_versions, public.legal_packs, public.legal_acceptances to service_role;
drop policy if exists legal_documents_read on public.legal_documents;
create policy legal_documents_read on public.legal_documents for select to anon, authenticated using (true);
drop policy if exists legal_document_versions_read on public.legal_document_versions;
create policy legal_document_versions_read on public.legal_document_versions for select to anon, authenticated using (true);
drop policy if exists legal_acceptances_read on public.legal_acceptances;
create policy legal_acceptances_read on public.legal_acceptances for select to authenticated using (user_id = (select auth.uid()) or public.privacy_admin_can_read());

create or replace function public.legal_acceptances_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'legal_acceptances_append_only' using errcode = '55000'; end $$;
drop trigger if exists legal_acceptances_append_only on public.legal_acceptances;
create trigger legal_acceptances_append_only before update or delete on public.legal_acceptances for each row execute function public.legal_acceptances_append_only();
create or replace function public.legal_versions_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'legal_versions_are_never_edited: publish a new version' using errcode = '55000'; end $$;
drop trigger if exists legal_versions_immutable on public.legal_document_versions;
create trigger legal_versions_immutable before update or delete on public.legal_document_versions for each row execute function public.legal_versions_immutable();

-- ═══ 2. Documents (mirror of src/lib/legal/registry.ts; tests/release/legal-signoff.spec.ts checks they agree) ═══
insert into public.legal_documents(slug, title, href, audience, accept_roles, sort) values
  ('terms', 'Terms of Service', '/terms', 'all', array['customer'], 1),
  ('privacy', 'Privacy Policy', '/privacy', 'consumer', array[]::text[], 2),
  ('cookies', 'Cookie Policy', '/cookies', 'consumer', array[]::text[], 3),
  ('data-retention', 'Data Retention Schedule', '/data-retention', 'consumer', array[]::text[], 4),
  ('acceptable-use', 'Acceptable Use and Online Safety Policy', '/legal/acceptable-use', 'all', array['customer'], 5),
  ('community-standards', 'Community and Review Standards', '/legal/community-standards', 'all', array['customer'], 6),
  ('complaints', 'Complaints Policy', '/legal/complaints', 'all', array[]::text[], 7),
  ('accessibility', 'Accessibility Statement', '/accessibility', 'consumer', array[]::text[], 8),
  ('customer-terms', 'Customer Terms', '/legal/customer-terms', 'consumer', array['customer'], 9),
  ('ticket-terms', 'Ticket Terms', '/ticket-terms', 'consumer', array['customer'], 10),
  ('resale-terms', 'Ticket Resale Terms', '/legal/resale-terms', 'consumer', array['customer'], 11),
  ('cancellation-refund-policy', 'Cancellation and Refund Policy', '/legal/cancellation-refund-policy', 'consumer', array['customer'], 12),
  ('payment-terms', 'Payment Terms', '/legal/payment-terms', 'business', array['organiser','supplier'], 13),
  ('disputes-policy', 'Disputes Policy', '/legal/disputes-policy', 'all', array['customer','organiser','supplier'], 14),
  ('standard-booking-terms', 'Standard Booking Terms', '/legal/standard-booking-terms', 'all', array['customer','organiser','supplier'], 15),
  ('organiser-terms', 'Organiser Terms', '/legal/organiser-terms', 'business', array['organiser'], 16),
  ('supplier-terms', 'Supplier Terms', '/legal/supplier-terms', 'business', array['supplier'], 17),
  ('venue-terms', 'Venue Terms', '/legal/venue-terms', 'business', array['venue'], 18),
  ('data-processing-addendum', 'Data Processing Addendum', '/legal/data-processing-addendum', 'business', array['organiser','supplier'], 19),
  ('subscription-terms', 'Subscription and Credits Terms', '/legal/subscription-terms', 'business', array['organiser','supplier'], 20),
  ('ai-terms', 'AI Terms', '/legal/ai-terms', 'business', array['organiser','supplier'], 21),
  ('partner-terms', 'Affiliate and Partner Terms', '/legal/partner-terms', 'business', array['partner'], 22),
  ('promoter-terms', 'Promoter Terms', '/legal/promoter-terms', 'business', array['promoter'], 23),
  ('content-template-policy', 'Content and Template Policy', '/legal/content-template-policy', 'all', array[]::text[], 24),
  ('ip-takedown', 'Intellectual Property and Takedown Procedure', '/legal/ip-takedown', 'all', array[]::text[], 25),
  ('safeguarding', 'Safeguarding and Abuse Policy', '/legal/safeguarding', 'consumer', array[]::text[], 26)
on conflict (slug) do update set title = excluded.title, href = excluded.href, audience = excluded.audience, accept_roles = excluded.accept_roles, sort = excluded.sort;

-- ═══ 3. Reading the published pack ═══
/** Latest published version of every document (empty until legal_publish_pack runs). Public: the legal pages show these dates. */
create or replace function public.legal_current_versions()
returns table(slug text, version text, label text, published_at timestamptz, effective_at timestamptz, business_effective_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (v.slug) v.slug, v.version, v.label, v.published_at, v.effective_at, v.business_effective_at
    from public.legal_document_versions v order by v.slug, v.published_at desc, v.version desc;
$$;
revoke all on function public.legal_current_versions() from public;
grant execute on function public.legal_current_versions() to anon, authenticated, service_role;

/** The roles an account holds for legal acceptance: every account is a customer; workspace owners are organisers or suppliers (and
 *  venues when they list a venue); partners and promoters by their own rows. `since` = when the role began (new roles after a
 *  publication must accept the new version at once). */
create or replace function public.legal_user_roles(p_user uuid)
returns table(role text, workspace_id uuid, workspace_name text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'customer', null::uuid, null::text, u.created_at from auth.users u where u.id = p_user
  union all
  select case w.kind when 'organizer' then 'organiser' else 'supplier' end, w.id, w.name, w.created_at
    from public.workspaces w where w.owner_id = p_user and w.kind in ('organizer', 'provider')
  union all
  select 'venue', w.id, w.name, w.created_at from public.workspaces w
   where w.owner_id = p_user and w.kind = 'provider' and exists (select 1 from public.listings l where l.workspace_id = w.id and l.kind = 'venue')
  union all
  select 'partner', null::uuid, p.name, p.created_at from public.partners p where p.user_id = p_user and p.status <> 'terminated'
  union all
  select 'promoter', null::uuid, null::text, u.created_at from auth.users u
   where u.id = p_user and exists (select 1 from public.promoters pr where pr.user_id = p_user);
$$;
revoke all on function public.legal_user_roles(uuid) from public, anon, authenticated;
grant execute on function public.legal_user_roles(uuid) to service_role;

/** Documents a user still has to accept at their current published version, one item per document (the business role wins over the
 *  customer role where a document has both, so its express terms apply). `required` = the version already applies to this user
 *  (consumers: on publication; business users: after the 15-day notice) or the role began after publication (new users accept at once).
 *  Demo and QA identities are exempt unless the fixture opts in (user_metadata.legal_gate = 'on'), so demo journeys never hit the gate. */
create or replace function public.legal_pending(p_user uuid, p_include_exempt boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare em text; meta jsonb; biz boolean;
begin
  if p_user is null then return '[]'::jsonb; end if;
  select lower(u.email), coalesce(u.raw_user_meta_data, '{}'::jsonb) into em, meta from auth.users u where u.id = p_user;
  if not found then return '[]'::jsonb; end if;
  if not p_include_exempt and (public.analytics_user_is_demo(p_user) or public.is_test_identity_email(em)) and coalesce(meta ->> 'legal_gate', '') <> 'on' then
    return '[]'::jsonb;
  end if;
  biz := exists (select 1 from public.legal_user_roles(p_user) r where r.role <> 'customer');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'slug', d.slug, 'title', d.title, 'href', d.href, 'version', cv.version, 'label', cv.label, 'role', r.role,
        'workspace_id', r.workspace_id, 'workspace_name', r.workspace_name, 'effective_at', e.eff,
        'required', now() >= e.eff or r.since >= cv.published_at,
        'express', case
          when d.slug = 'payment-terms' then '["payment_terms"]'::jsonb
          when d.slug = 'organiser-terms' then '["cancellation_fees"]'::jsonb
          when d.slug = 'disputes-policy' and r.role in ('organiser', 'supplier') then '["dispute_deadline_rules"]'::jsonb
          else '[]'::jsonb end,
        'previously_accepted', exists (select 1 from public.legal_acceptances a where a.user_id = p_user and a.slug = d.slug))
      order by d.sort)
    from public.legal_documents d
    join public.legal_current_versions() cv on cv.slug = d.slug
    cross join lateral (select x.role, x.workspace_id, x.workspace_name, x.since from public.legal_user_roles(p_user) x
                         where x.role = any (d.accept_roles) order by (x.role = 'customer'), x.since limit 1) r
    cross join lateral (select case when d.audience = 'consumer' then cv.effective_at when d.audience = 'business' then cv.business_effective_at
                                    when biz then cv.business_effective_at else cv.effective_at end as eff) e
    where not exists (select 1 from public.legal_acceptances a where a.user_id = p_user and a.slug = d.slug and a.version = cv.version and a.express = '')
      -- partner applications record their acceptance in consent_records (partner_apply); that counts for the same version
      and not (d.slug = 'partner-terms' and exists (select 1 from public.consent_records c where c.user_id = p_user and c.purpose = 'partner_terms' and c.granted and c.policy_version = cv.version))
  ), '[]'::jsonb);
end $$;
revoke all on function public.legal_pending(uuid, boolean) from public, anon, authenticated;
grant execute on function public.legal_pending(uuid, boolean) to service_role;

create or replace function public.legal_pending_for_me()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.legal_pending(auth.uid(), false);
$$;
revoke all on function public.legal_pending_for_me() from public, anon;
grant execute on function public.legal_pending_for_me() to authenticated;

-- ═══ 4. Accepting ═══
/** Records the signed-in user's acceptance of the listed documents at their current version, with each express term ticked
 *  separately. Refuses a stale version (terms_version_changed) or a missing express tick (express_term_required). The Payment Terms
 *  express tick also satisfies the DEC-107 payout set-up tick, and the dispute deadline rules tick the DEC-107 dispute rules, so
 *  sellers aren't asked twice. Returns the number of documents accepted. */
create or replace function public.legal_accept(p_items jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); it jsonb; p jsonb; pend jsonb; ex text; n integer := 0; s record;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 40 then raise exception 'invalid_items' using errcode = '22023'; end if;
  if not public.hit_rate_limit('legal-accept:' || uid, 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  pend := public.legal_pending(uid, true);
  select payment_terms_version, dispute_rules_version into s from public.dec107_settings where id;
  for it in select * from jsonb_array_elements(p_items) loop
    p := null;
    select x.value into p from jsonb_array_elements(pend) as x(value) where x.value ->> 'slug' = it ->> 'slug';
    if p is null then continue; end if;                                    -- already accepted, or not a document for this account
    if (it ->> 'version') is distinct from (p ->> 'version') then raise exception 'terms_version_changed' using errcode = '22023', hint = p ->> 'version'; end if;
    for ex in select jsonb_array_elements_text(p -> 'express') loop
      if not coalesce((it -> 'express') ? ex, false) then raise exception 'express_term_required' using errcode = '22023', hint = ex; end if;
    end loop;
    insert into public.legal_acceptances(user_id, slug, version, role, workspace_id, source)
      values (uid, p ->> 'slug', p ->> 'version', p ->> 'role', nullif(p ->> 'workspace_id', '')::uuid, 'updates') on conflict do nothing;
    for ex in select jsonb_array_elements_text(p -> 'express') loop
      insert into public.legal_acceptances(user_id, slug, version, role, workspace_id, source, express)
        values (uid, p ->> 'slug', p ->> 'version', p ->> 'role', nullif(p ->> 'workspace_id', '')::uuid, 'updates', ex) on conflict do nothing;
      if ex = 'payment_terms' and s.payment_terms_version = p ->> 'version' then
        insert into public.consent_records(user_id, purpose, granted, policy_version, source, context)
          values (uid, 'payment_terms_seller', true, p ->> 'version', 'app', jsonb_build_object('accepted_at', now(), 'via', 'legal_accept'));
      elsif ex = 'dispute_deadline_rules' and s.dispute_rules_version = p ->> 'version' then
        insert into public.consent_records(user_id, purpose, granted, policy_version, source, context)
          values (uid, 'dispute_rules', true, p ->> 'version', 'app', jsonb_build_object('accepted_at', now(), 'via', 'legal_accept'));
      end if;
    end loop;
    n := n + 1;
  end loop;
  if n > 0 then
    insert into public.audit_events(actor_id, actor_type, event, metadata)
      values (uid, 'user', 'legal.terms_accepted', jsonb_build_object('documents', n, 'items', p_items));
  end if;
  return n;
end $$;
revoke all on function public.legal_accept(jsonb) from public, anon;
grant execute on function public.legal_accept(jsonb) to authenticated;

/** Sign-up records the Terms of Service version on the profile (handle_new_user ← user_metadata.terms_version). When that is the
 *  published version, the customer documents the sign-up tick covers are recorded as accepted at their current versions. */
create or replace function public.legal_record_signup_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.terms_version is null or not exists (select 1 from public.legal_current_versions() c where c.slug = 'terms' and c.version = new.terms_version) then
    return new;
  end if;
  insert into public.legal_acceptances(user_id, slug, version, role, source, accepted_at)
    select new.id, c.slug, c.version, 'customer', 'signup', coalesce(new.terms_accepted_at, now())
      from public.legal_current_versions() c join public.legal_documents d on d.slug = c.slug
     where 'customer' = any (d.accept_roles)
  on conflict do nothing;
  return new;
exception when others then return new;   -- recording acceptance must never block sign-up
end $$;
revoke all on function public.legal_record_signup_acceptance() from public, anon, authenticated;
drop trigger if exists legal_signup_acceptance on public.profiles;
create trigger legal_signup_acceptance after insert on public.profiles for each row execute function public.legal_record_signup_acceptance();

-- ═══ 5. Who gets the notice ═══
/** Real accounts that receive the change notice: confirmed email, not deleted or being deleted, not demo/QA identities. */
create or replace function public.legal_notice_audience()
returns table(user_id uuid, email text, business boolean, roles text[])
language sql stable security definer set search_path = '' as $$
  select u.id, lower(u.email),
         exists (select 1 from public.legal_user_roles(u.id) r where r.role <> 'customer'),
         array(select distinct r.role from public.legal_user_roles(u.id) r order by 1)
    from auth.users u left join public.profiles p on p.id = u.id
   where u.email is not null and u.email_confirmed_at is not null and u.deleted_at is null
     and p.deleted_at is null and p.deletion_requested_at is null
     and not public.analytics_user_is_demo(u.id) and not public.is_test_identity_email(u.email);
$$;
revoke all on function public.legal_notice_audience() from public, anon, authenticated;
grant execute on function public.legal_notice_audience() to service_role;

/** Counts for the report and the publish script's dry run (nothing is written). */
create or replace function public.legal_notice_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*),
    'business', count(*) filter (where a.business),
    'consumer_only', count(*) filter (where not a.business),
    'by_role', (select coalesce(jsonb_object_agg(r, n), '{}'::jsonb) from (select unnest(x.roles) r, count(*) n from public.legal_notice_audience() x group by 1) t))
  from public.legal_notice_audience() a;
$$;
revoke all on function public.legal_notice_counts() from public, anon, authenticated;
grant execute on function public.legal_notice_counts() to service_role;

-- ═══ 6. Publishing (after deploy only: scripts/legal/publish-pack.mjs) ═══
/** Publishes the pack the live site serves: records each document version with its sha256 and dates, moves the DEC-107 express-term
 *  versions to the published Payment Terms and Disputes Policy, records acceptances for sign-ups made between deploy and publication,
 *  and queues ONE in-app notice + email per real account (business wording with the 15-day date; consumer wording "applies today").
 *  Refuses to run twice for a pack, refuses a changed text under an existing version, refuses an incomplete manifest. */
create or replace function public.legal_publish_pack(p_pack text, p_manifest jsonb, p_published_by text default 'publish-pack')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare it jsonb; d public.legal_documents; v public.legal_document_versions; t timestamptz := now(); biz timestamptz; n integer := 0;
  pt text; dr text; tos text; a record; nid uuid; biz_n integer := 0; con_n integer := 0; bday text; today text;
begin
  if p_pack is null or p_pack !~ '^[0-9]{4}-[0-9]{2}-v[0-9]+$' then raise exception 'invalid_pack' using errcode = '22023'; end if;
  if exists (select 1 from public.legal_packs where pack = p_pack) then raise exception 'pack_already_published' using errcode = '55000', hint = p_pack; end if;
  if jsonb_typeof(p_manifest -> 'documents') is distinct from 'array' then raise exception 'invalid_manifest' using errcode = '22023'; end if;
  -- 15 full days of notice: business terms apply from London midnight at the start of the 16th day after publication.
  biz := ((date_trunc('day', t at time zone 'Europe/London') + interval '16 days') at time zone 'Europe/London');
  for it in select * from jsonb_array_elements(p_manifest -> 'documents') loop
    select * into d from public.legal_documents where slug = it ->> 'slug';
    if not found then raise exception 'unknown_document' using errcode = '22023', hint = it ->> 'slug'; end if;
    if coalesce(it ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_sha256' using errcode = '22023', hint = d.slug; end if;
    select * into v from public.legal_document_versions where slug = d.slug and version = it ->> 'version';
    if found then
      if v.body_sha256 <> it ->> 'sha256' then raise exception 'version_text_changed' using errcode = '55000', hint = d.slug || ' ' || v.version || ': bump the version'; end if;
      continue;
    end if;
    insert into public.legal_document_versions(slug, version, label, pack, body_sha256, previous_version, published_at, effective_at, business_effective_at, published_by)
      values (d.slug, it ->> 'version', it ->> 'label', p_pack, it ->> 'sha256', nullif(it ->> 'previous', ''), t,
              case when d.audience = 'business' then biz else t end, case when d.audience = 'consumer' then t else biz end,
              left(coalesce(p_published_by, 'publish-pack'), 120));
    n := n + 1;
  end loop;
  if exists (select 1 from public.legal_documents d2 where not exists (select 1 from public.legal_document_versions v2 where v2.slug = d2.slug)) then
    raise exception 'manifest_incomplete' using errcode = '22023';
  end if;

  select c.version into pt from public.legal_current_versions() c where c.slug = 'payment-terms';
  select c.version into dr from public.legal_current_versions() c where c.slug = 'disputes-policy';
  select c.version into tos from public.legal_current_versions() c where c.slug = 'terms';
  update public.dec107_settings set payment_terms_version = pt, dispute_rules_version = dr
   where id and (payment_terms_version is distinct from pt or dispute_rules_version is distinct from dr);

  insert into public.legal_acceptances(user_id, slug, version, role, source, accepted_at)
    select p.id, c.slug, c.version, 'customer', 'signup_backfill', coalesce(p.terms_accepted_at, t)
      from public.profiles p cross join public.legal_current_versions() c join public.legal_documents d3 on d3.slug = c.slug
     where p.terms_version = tos and 'customer' = any (d3.accept_roles)
  on conflict do nothing;

  bday := to_char(biz at time zone 'Europe/London', 'FMDD FMMonth YYYY');
  today := to_char(t at time zone 'Europe/London', 'FMDD FMMonth YYYY');
  for a in select * from public.legal_notice_audience() loop
    if a.business then
      insert into public.notifications(user_id, kind, title, body, link, dedupe_key) values (a.user_id, 'legal_terms_update',
        'Changes to Gala Dock''s terms for your business, from ' || bday,
        'We''ve published version 3.0 of Gala Dock''s legal documents. For your business account the changes take effect on ' || bday || ', at least 15 days after this notice.' || E'\n\n' ||
        'What''s changing for businesses: new Organiser, Supplier and Venue Terms; Payment Terms 1.1 (customers pay you directly into your own Stripe account, Gala Dock never holds the money, published payout triggers and reserves, and payouts can be paused only on the listed grounds); Disputes Policy 1.1 and new Standard Booking Terms (Gala Dock recommends but never decides); a Data Processing Addendum; Subscription and Credits Terms; AI Terms; Partner and Promoter Terms; the liability cap (the greater of £1,000 and your last 12 months'' fees, with payment instructions outside the cap); tax reporting to HMRC; and where Gala Dock is available.' || E'\n\n' ||
        'Please review and accept them in Gala Dock before ' || bday || '. If you don''t agree, you can close your account before then. If you keep using Gala Dock for your business after that date, the new terms apply.' || E'\n\n' ||
        'The updated Privacy Policy, Cookie Policy and customer documents apply from today, ' || today || '. All documents, versions and dates: galadock.com/legal',
        '/legal/updates', 'legal:' || p_pack || ':' || a.user_id)
      on conflict do nothing returning id into nid;
      biz_n := biz_n + 1;
    else
      insert into public.notifications(user_id, kind, title, body, link, dedupe_key) values (a.user_id, 'legal_terms_update',
        'We''ve updated Gala Dock''s terms and privacy policy',
        'We''ve published version 3.0 of Gala Dock''s legal documents. They apply from today, ' || today || '.' || E'\n\n' ||
        'The main changes: the organiser, venue or supplier you buy from is the seller, and your payment goes straight to their own Stripe account; Gala Dock never holds it. You have 24 hours after an event to open a dispute, which affects only when the seller is paid, never your legal rights. Tickets in a disputed card payment are put on hold until it is decided. Our Privacy Policy now lists every service provider we use, and our Data Retention Schedule how long we keep each kind of data.' || E'\n\n' ||
        'Next time you sign in we''ll ask you to accept the updated terms. If you don''t agree, you can close your account at any time in Settings. All documents, versions and dates: galadock.com/legal',
        '/legal/updates', 'legal:' || p_pack || ':' || a.user_id)
      on conflict do nothing returning id into nid;
      con_n := con_n + 1;
    end if;
    -- gd_notification_email queued the email (mandatory: kinds matching 'legal|terms|policy'); file it as a legal notice.
    if nid is not null then update public.email_outbox set category = 'legal' where notification_id = nid; end if;
    nid := null;
  end loop;

  insert into public.legal_packs(pack, published_at, business_effective_at, notices, published_by)
    values (p_pack, t, biz, jsonb_build_object('business', biz_n, 'consumer', con_n, 'total', biz_n + con_n), left(coalesce(p_published_by, 'publish-pack'), 120));
  insert into public.audit_events(actor_type, event, metadata) values ('system', 'legal.pack_published',
    jsonb_build_object('pack', p_pack, 'documents_published', n, 'business_effective_at', biz, 'notices_business', biz_n, 'notices_consumer', con_n,
                       'payment_terms_version', pt, 'dispute_rules_version', dr, 'by', left(coalesce(p_published_by, ''), 120)));
  return jsonb_build_object('pack', p_pack, 'documents_published', n, 'business_effective_at', biz,
                            'notices', jsonb_build_object('business', biz_n, 'consumer', con_n, 'total', biz_n + con_n));
end $$;
revoke all on function public.legal_publish_pack(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.legal_publish_pack(text, jsonb, text) to service_role;

-- ═══ 7. Engine versions follow the published texts ═══
-- Signed-in surfaces read the Terms of Service version from the published pack (falls back to the pre-pack platform setting).
create or replace function public.legal_terms_version() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select c.version from public.legal_current_versions() c where c.slug = 'terms'),
    (select value ->> 'terms_version' from public.platform_settings where section = 'legal' and status = 'published' order by version desc limit 1));
$$;
revoke all on function public.legal_terms_version() from public, anon;
grant execute on function public.legal_terms_version() to authenticated, service_role;

-- Partner applications accept the published Partner Terms version once the pack is published (before that: unchanged).
create or replace function public.partner_terms_version() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.version from public.legal_current_versions() c where c.slug = 'partner-terms'),
                  nullif(public.commerce_setting('partner_terms_version') #>> '{}', ''), '2026-10');
$$;
grant execute on function public.partner_terms_version() to anon, authenticated;
