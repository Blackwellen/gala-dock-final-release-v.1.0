-- Q59 follow-up (owner decisions delegated to the coordinator, 2026-11-14). Additive: CREATE OR REPLACE (same signatures), new helpers,
-- draft retention rows (disabled, legal review), foreign keys replaced by equivalent ON DELETE SET NULL ones, one storage policy tightened.
--  1. A SUSPENDED workspace gets no new payouts: dec107_payouts_paused() (release sweep + release_paid guard) and payout_eligible()
--     treat an active workspace_suspended restriction as a pause. Buyer refunds are unaffected. The provider is told why; an audit row is
--     the ops note; lifting the suspension resumes releases automatically (the sweep re-reads the state).
--  4. Admin "identity verified" is derived from real verification_checks (user_identity_verified), never the unwritten
--     profiles.identity_verified column (seeded values are left in place, just no longer read). admin_user_identity adds phone_confirmed.
--  5. Event licence documents: licence_save accepts a document only if it was uploaded through the files pipeline by the caller
--     (verified_private_uploads); the file is classed sensitive and scanned. licence_document_access() authorises downloads.
--  7. Draft retention rules for provider documents / verification records (disabled, legal review). uploaded_by / reviewed_by /
--     decided_by no longer block erasure (ON DELETE SET NULL).
--  8. An uploader can't delete a stored file that is evidence (a non-rejected provider document or a licence document).

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dec107_payouts_paused(p_workspace uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists(select 1 from public.payout_pauses p where p.workspace_id = p_workspace and p.lifted_at is null)
      or exists(select 1 from public.trust_active_enforcement(p_workspace, null) e where e.action = 'workspace_suspended');
$function$;

create or replace function public.payout_eligible(p_workspace uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select c.payouts_enabled and c.transfers_capability = 'active' and c.disabled_reason is null
                     and cardinality(c.requirements_past_due) = 0
                   from public.connect_accounts c where c.workspace_id = p_workspace and c.livemode = public.stripe_livemode()), false)
    and not public.risk_hold_active('payout', 'workspace', p_workspace)
    and not exists (select 1 from public.trust_active_enforcement(p_workspace, null) e where e.action = 'workspace_suspended');
$function$;

create or replace function public.trust_apply_effect(a public.enforcement_actions, p_on boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.reviews; l record;
begin
  if a.action = 'listing_hidden' or a.action = 'workspace_suspended' then
    if p_on then
      for l in select id, published, workspace_id from public.listings
               where (a.action = 'listing_hidden' and id = a.subject_id) or (a.action = 'workspace_suspended' and workspace_id = a.subject_id) loop
        insert into public.trust_listing_holds(listing_id, workspace_id, source, reason_code, detail, enforcement_action_id, was_published)
          values (l.id, l.workspace_id, 'enforcement', a.reason_code, left(a.note, 300), a.id, l.published) on conflict do nothing;
        if l.published then update public.listings set published = false where id = l.id; end if;
      end loop;
    else
      for l in update public.trust_listing_holds set released_at = now(), release_reason = 'enforcement_' || a.status
               where enforcement_action_id = a.id and released_at is null returning listing_id, was_published loop
        if l.was_published and not exists (select 1 from public.trust_listing_holds h where h.listing_id = l.listing_id and h.released_at is null) then
          update public.listings set published = true where id = l.listing_id and not published;
        end if;
      end loop;
    end if;
    -- Q59 owner decision: payouts are held while a workspace is suspended (refunds to buyers still go out).
    if a.action = 'workspace_suspended' and a.workspace_id is not null then
      insert into public.audit_events(actor_type, workspace_id, event, metadata)
        values ('system', a.workspace_id, case when p_on then 'payout.held_trust_suspension' else 'payout.resumed_trust_suspension' end,
                jsonb_build_object('action_id', a.id, 'reference', a.reference, 'status', a.status));
      perform public.trust_notify_workspace(a.workspace_id, 'payout_paused',
        case when p_on then 'Payouts on hold while your workspace is suspended' else 'Payouts resumed' end,
        case when p_on then 'Gala Dock Trust & Safety suspended this workspace (' || coalesce(a.reference, 'restriction') || '). New payouts are held until the suspension ends; refunds to buyers still go out. Your money stays in your own Stripe balance.'
             else 'The suspension has ended, so held payouts will be released on the normal schedule.' end,
        '/provider/settings#credentials', 'trust.payouts:' || a.id || ':' || case when p_on then 'held' else 'resumed' end);
    end if;
  elsif a.action in ('review_removed','review_hidden') then
    select * into r from public.reviews where id = a.subject_id for update;
    if found then
      if p_on and r.status <> 'removed' then
        update public.reviews set status = 'removed', moderation_reason = left(a.note, 500), moderated_by = a.decided_by, moderated_at = now(), updated_at = now() where id = r.id;
        if r.status = 'published' then perform public.trust_review_aggregate(r.listing_id, r.rating, -1); end if;
      elsif not p_on and r.status = 'removed' then
        update public.reviews set status = 'published', moderation_reason = null, updated_at = now() where id = r.id;
        perform public.trust_review_aggregate(r.listing_id, r.rating, 1);
      end if;
    end if;
  end if;
end $function$;

-- 4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.user_identity_verified(p_user uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.verification_checks c
                 where c.status = 'verified' and (c.expires_at is null or c.expires_at > now())
                   and (c.user_id = p_user
                        or (c.subject_type = 'workspace' and c.workspace_id in (select w.id from public.workspaces w where w.owner_id = p_user))));
$$;
revoke all on function public.user_identity_verified(uuid) from public, anon;
grant execute on function public.user_identity_verified(uuid) to authenticated, service_role;

create or replace function public.admin_user_identity(p_user uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare u auth.users;
begin
  if not (public.has_admin_permission('users') or public.has_admin_permission('support')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', u.id, 'email', u.email, 'email_confirmed', u.email_confirmed_at is not null, 'phone', u.phone,
    'phone_confirmed', u.phone_confirmed_at is not null, 'identity_verified', public.user_identity_verified(u.id),
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'mfa_factors', (select count(*) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
    'active_sessions', (select count(*) from auth.sessions s where s.user_id = u.id and (s.not_after is null or s.not_after > now())),
    'providers', coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb));
end $function$;

create or replace function public.admin_user_directory(p_search text DEFAULT ''::text, p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, full_name text, avatar_url text, status text, identity_verified boolean, created_at timestamp with time zone, last_active_at timestamp with time zone, account_type text, workspaces bigint, workspace_name text, events bigint, upcoming_events bigint, tickets bigint, used_tickets bigint, trust_flag text, open_cases bigint, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.has_admin_permission('users') or public.has_admin_permission('support')) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
  with base as (
    select u.id, u.email::text, p.full_name, p.avatar_url, p.status, public.user_identity_verified(u.id) as identity_verified, u.created_at, coalesce(p.last_active_at, u.last_sign_in_at) as last_active_at,
      case when exists(select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = u.id and w.kind = 'provider') then 'provider'
           when exists(select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = u.id and w.kind = 'organizer') then 'organizer'
           when exists(select 1 from public.platform_admins a where a.user_id = u.id) then 'admin' else 'consumer' end as account_type,
      (select count(*) from public.workspace_members m where m.user_id = u.id and m.status = 'active') as workspaces,
      (select w.name from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = u.id order by m.created_at limit 1) as workspace_name,
      (select count(*) from public.events e where e.owner_id = u.id) as events,
      (select count(*) from public.events e where e.owner_id = u.id and e.starts_at > now()) as upcoming_events,
      (select count(*) from public.tickets t where t.holder_id = u.id) as tickets,
      (select count(*) from public.tickets t where t.holder_id = u.id and t.status = 'used') as used_tickets,
      (select tc.category || ' (' || count(*) over () || ')' from public.trust_cases tc where tc.subject_type = 'user' and tc.subject_id = u.id and tc.status in ('open','in_review') limit 1) as trust_flag,
      (select count(*) from public.support_cases c where c.requester_id = u.id and c.status <> 'resolved') as open_cases
    from auth.users u left join public.profiles p on p.id = u.id
    where (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%' or u.id::text = p_search)
  ), filtered as (
    select * from base b where p_filter = 'all' or (p_filter = 'restricted' and b.status = 'restricted') or (p_filter = 'verified' and b.identity_verified)
  )
  select f.*, count(*) over () as total_count from filtered f
  order by f.last_active_at desc nulls last limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
end $function$;

-- 5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.licence_save(p_event uuid, p jsonb, p_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare e public.events; l public.event_licences; doc_path text := nullif(p ->> 'document_path', '');
begin
  e := public.ops_event_require(p_event);
  -- Q59: a licence document must come through the files pipeline (type-sniffed, registered, scanned) and belong to the caller.
  if doc_path is not null and not exists (select 1 from public.verified_private_uploads v where v.path = doc_path and v.owner_id = auth.uid()) then
    raise exception 'upload_not_verified' using errcode = '42501', detail = 'Upload the document again.';
  end if;
  if p_id is null then
    insert into public.event_licences(event_id, workspace_id, licence_type, holder, authority, reference, valid_from, valid_to, conditions, document_path)
      values (e.id, e.workspace_id, p ->> 'licence_type', coalesce(nullif(p ->> 'holder', ''), 'organizer'), coalesce(p ->> 'authority', ''), coalesce(p ->> 'reference', ''),
        nullif(p ->> 'valid_from', '')::timestamptz, nullif(p ->> 'valid_to', '')::timestamptz, coalesce(p ->> 'conditions', ''), doc_path) returning * into l;
  else
    select * into l from public.event_licences where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.event_licences set holder = coalesce(nullif(p ->> 'holder', ''), holder), authority = coalesce(p ->> 'authority', authority), reference = coalesce(p ->> 'reference', reference),
      valid_from = case when p ? 'valid_from' then nullif(p ->> 'valid_from', '')::timestamptz else valid_from end,
      valid_to = case when p ? 'valid_to' then nullif(p ->> 'valid_to', '')::timestamptz else valid_to end,
      conditions = coalesce(p ->> 'conditions', conditions), document_path = coalesce(doc_path, document_path),
      last_reminder_days = case when p ? 'valid_to' then null else last_reminder_days end where id = l.id returning * into l;
    if l.status = 'granted' and l.valid_to is null and exists (select 1 from public.licence_types t where t.key = l.licence_type and t.expires) then
      raise exception 'valid_to_required' using errcode = '22023', detail = 'This licence type expires: a granted licence needs a valid-to date.';
    end if;
  end if;
  if doc_path is not null then
    update public.storage_attribution set file_class = 'sensitive' where bucket = 'workspace-files' and name = doc_path and file_class <> 'sensitive';
    if exists (select 1 from public.storage_attribution a where a.bucket = 'workspace-files' and a.name = doc_path and coalesce(a.av_verdict, '') <> 'clean') then
      perform public.enqueue_job('files.scan', jsonb_build_object('bucket', 'workspace-files', 'name', doc_path), 'files.scan:workspace-files/' || doc_path, null, e.workspace_id);
    end if;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.licence_saved',
    jsonb_build_object('event_id', e.id, 'licence_id', l.id, 'licence_type', l.licence_type, 'document', doc_path is not null));
  return jsonb_build_object('id', l.id, 'status', l.status);
end $function$;

create or replace function public.licence_document_access(p_licence uuid) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare l public.event_licences;
begin
  select * into l from public.event_licences where id = p_licence;
  if not found or l.document_path is null or not public.can_access_event(l.event_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('bucket', 'workspace-files', 'path', l.document_path, 'event_id', l.event_id, 'workspace_id', l.workspace_id,
    'file_name', l.licence_type || '-' || coalesce(nullif(l.reference, ''), 'document') || '.' || coalesce(substring(l.document_path from '\.([a-z]+)$'), 'pdf'));
end $$;
revoke all on function public.licence_document_access(uuid) from public, anon;
grant execute on function public.licence_document_access(uuid) to authenticated, service_role;

-- 7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.data_retention_rules(key, table_name, action, retention_days, basis, enabled, legal_review_required) values
  ('provider_documents.retain', 'provider_documents', 'retain', 2190, 'Provider verification, credentials and insurance documents: kept while the listing is active and 6 years after (legal claims; consumer safety). DRAFT — legal review.', false, true),
  ('verification_checks.retain', 'verification_checks', 'retain', 2190, 'Identity and business verification checks: kept while the listing is active and 6 years after. DRAFT — legal review.', false, true),
  ('verification_records.retain', 'verification_records', 'retain', 2190, 'Verification decision history: kept while the listing is active and 6 years after. DRAFT — legal review.', false, true)
on conflict (key) do nothing;

alter table public.provider_documents add constraint provider_documents_uploaded_by_set_null_fkey foreign key (uploaded_by) references auth.users(id) on delete set null not valid;
alter table public.provider_documents validate constraint provider_documents_uploaded_by_set_null_fkey;
alter table public.provider_documents drop constraint if exists provider_documents_uploaded_by_fkey;
alter table public.provider_documents add constraint provider_documents_reviewed_by_set_null_fkey foreign key (reviewed_by) references auth.users(id) on delete set null not valid;
alter table public.provider_documents validate constraint provider_documents_reviewed_by_set_null_fkey;
alter table public.provider_documents drop constraint if exists provider_documents_reviewed_by_fkey;
alter table public.verification_records add constraint verification_records_decided_by_set_null_fkey foreign key (decided_by) references auth.users(id) on delete set null not valid;
alter table public.verification_records validate constraint verification_records_decided_by_set_null_fkey;
alter table public.verification_records drop constraint if exists verification_records_decided_by_fkey;

-- 8 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.storage_object_locked(p_bucket text, p_name text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select p_bucket = 'workspace-files' and (
    exists (select 1 from public.provider_documents d where d.file_path = p_name and d.status <> 'rejected')
    or exists (select 1 from public.event_licences l where l.document_path = p_name));
$$;
revoke all on function public.storage_object_locked(text, text) from public, anon;
grant execute on function public.storage_object_locked(text, text) to authenticated, service_role;

alter policy workspace_files_delete on storage.objects
  using ((bucket_id = 'workspace-files') and ((storage.foldername(name))[1] = ((select auth.uid()))::text) and not public.storage_object_locked(bucket_id, name));
