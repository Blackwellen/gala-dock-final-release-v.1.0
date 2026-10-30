-- Lane D · B1 (D4 backend gaps, 2026-10-29). Additive commands behind existing organiser screens; every one audited.
--   1. retire_waiver_draft         Plan › Forms & waivers — retires a DRAFT waiver version (machine waiver_template draft → retired);
--                                  published versions are retired only by publishing a successor (publish_waiver_template). Owner/manager.
--   2. delete_promotion_blackout   Sell › Campaigns calendar — whoever can save a blackout (campaign_can manage = promotion.manage).
--   3. dispose_found_item          Ops › Lost property — machine found_item → disposed once the retention period (dispose_after) has
--                                  passed; reason + method recorded; claimed / collected items and items with an open claim refused.
--                                  events.write. New nullable columns found_items.disposed_at / disposed_by / disposal_method / disposal_reason.
--   4. archive_event_template_family  archives EVERY version of a template family (active and superseded). archive_event_template
--                                  (active version only) is unchanged for existing callers.
--   5. licence_clear_expiry        Plan › Compliance — explicit clear of a licence's valid-to date, refused (valid_to_required) when the
--                                  licence is granted and its type expires (licence_types.expires), matching licence_transition.
--                                  licence_save is re-created with the same rule so its `valid_to: ""` path can't bypass it.

-- ═══ 1. Retire a draft waiver ═══
create or replace function public.retire_waiver_draft(p_template uuid, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w public.waiver_templates;
begin
  select * into w from public.waiver_templates where id = p_template for update;
  if not found or not public.has_workspace_role(w.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if w.status <> 'draft' then raise exception 'waiver_not_draft' using errcode = '22023'; end if;
  if p_reason is not null and length(p_reason) > 500 then raise exception 'invalid_reason' using errcode = '22023'; end if;
  update public.waiver_templates set status = 'retired' where id = w.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), w.workspace_id, 'waiver.draft_retired',
    jsonb_build_object('template_id', w.id, 'family_id', w.family_id, 'version', w.version, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('ok', true, 'id', w.id, 'version', w.version, 'status', 'retired');
end $$;

-- ═══ 2. Delete a promotion blackout ═══
create or replace function public.delete_promotion_blackout(p_blackout uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.promotion_blackouts;
begin
  select * into b from public.promotion_blackouts where id = p_blackout for update;
  if not found or not public.campaign_can(b.workspace_id, 'manage') then raise exception 'not_authorized' using errcode = '42501'; end if;
  delete from public.promotion_blackouts where id = b.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values ((select auth.uid()), b.workspace_id, 'promotion.blackout_deleted',
    jsonb_build_object('blackout_id', b.id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'channel', b.channel, 'reason', b.reason));
  return jsonb_build_object('ok', true, 'id', b.id);
end $$;

-- ═══ 3. Dispose of a found item ═══
alter table public.found_items add column if not exists disposed_at timestamptz;
alter table public.found_items add column if not exists disposed_by uuid;
alter table public.found_items add column if not exists disposal_method text;
alter table public.found_items add column if not exists disposal_reason text;
do $$ begin
  alter table public.found_items add constraint found_items_disposal_method_check check (disposal_method is null or disposal_method in ('donated','destroyed','recycled','handed_to_police','returned_to_venue','other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.found_items add constraint found_items_disposal_reason_len check (disposal_reason is null or length(disposal_reason) <= 500);
exception when duplicate_object then null; end $$;

create or replace function public.dispose_found_item(p_item uuid, p_reason text, p_method text default 'other') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare i public.found_items; e public.events; uid uuid := (select auth.uid());
begin
  select * into i from public.found_items where id = p_item for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into e from public.events where id = i.event_id;
  if e.workspace_id is null or not public.has_permission(e.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then raise exception 'reason_required' using errcode = '22023'; end if;
  if coalesce(p_method, '') not in ('donated','destroyed','recycled','handed_to_police','returned_to_venue','other') then raise exception 'invalid_method' using errcode = '22023'; end if;
  if i.status = 'disposed' then raise exception 'already_disposed' using errcode = '22023'; end if;
  if i.status in ('claimed','collected') then raise exception 'item_claimed_or_returned' using errcode = '22023'; end if;
  if exists (select 1 from public.lost_claims c where c.item_id = i.id and c.status in ('pending','manual_review','verified')) then raise exception 'item_has_open_claim' using errcode = '22023'; end if;
  if now() < i.dispose_after then raise exception 'retention_not_elapsed' using errcode = '22023', detail = 'Held until ' || to_char(i.dispose_after, 'FMDD Mon YYYY'); end if;
  update public.found_items set status = 'disposed', disposed_at = now(), disposed_by = uid, disposal_method = p_method, disposal_reason = btrim(p_reason) where id = i.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, e.workspace_id, 'lost_property.item_disposed',
    jsonb_build_object('event_id', e.id, 'item_id', i.id, 'category', i.category, 'method', p_method, 'from', i.status, 'held_until', i.dispose_after));
  return jsonb_build_object('ok', true, 'id', i.id, 'status', 'disposed', 'method', p_method);
end $$;

-- ═══ 4. Archive a whole template family ═══
create or replace function public.archive_event_template_family(p_template uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.event_templates; n int;
begin
  select * into t from public.event_templates where id = p_template;
  if not found or t.workspace_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission(t.workspace_id, 'events.write') then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform 1 from public.event_templates where family_id = t.family_id and workspace_id = t.workspace_id for update;
  update public.event_templates set status = 'archived', updated_at = now() where family_id = t.family_id and workspace_id = t.workspace_id and status <> 'archived';
  get diagnostics n = row_count;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, t.workspace_id, 'template.family_archived',
    jsonb_build_object('template_id', t.id, 'family_id', t.family_id, 'versions_archived', n));
  return jsonb_build_object('ok', true, 'family_id', t.family_id, 'versions_archived', n);
end $$;

-- ═══ 5. Clear a licence expiry ═══
create or replace function public.licence_clear_expiry(p_licence uuid, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.event_licences; e public.events; t public.licence_types;
begin
  select * into l from public.event_licences where id = p_licence for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  e := public.ops_event_require(l.event_id);
  select * into t from public.licence_types where key = l.licence_type;
  if l.status = 'granted' and t.expires then raise exception 'valid_to_required' using errcode = '22023', detail = 'This licence type expires: a granted licence needs a valid-to date.'; end if;
  if p_reason is not null and length(p_reason) > 500 then raise exception 'invalid_reason' using errcode = '22023'; end if;
  if l.valid_to is null then return jsonb_build_object('ok', true, 'id', l.id, 'changed', false); end if;
  update public.event_licences set valid_to = null, last_reminder_days = null where id = l.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.licence_expiry_cleared',
    jsonb_build_object('event_id', e.id, 'licence_id', l.id, 'licence_type', l.licence_type, 'status', l.status, 'previous_valid_to', l.valid_to, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('ok', true, 'id', l.id, 'changed', true);
end $$;

-- licence_save (Q26, 202610293017) unchanged except: a granted licence of an expiring type can't lose its valid-to date here either.
create or replace function public.licence_save(p_event uuid, p jsonb, p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.events; l public.event_licences; path text := nullif(p ->> 'document_path', '');
begin
  e := public.ops_event_require(p_event);
  if path is not null and not (path like e.workspace_id::text || '/%' or path like auth.uid()::text || '/%') then raise exception 'invalid_storage_path' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.event_licences(event_id, workspace_id, licence_type, holder, authority, reference, valid_from, valid_to, conditions, document_path)
      values (e.id, e.workspace_id, p ->> 'licence_type', coalesce(nullif(p ->> 'holder', ''), 'organizer'), coalesce(p ->> 'authority', ''), coalesce(p ->> 'reference', ''),
        nullif(p ->> 'valid_from', '')::timestamptz, nullif(p ->> 'valid_to', '')::timestamptz, coalesce(p ->> 'conditions', ''), path) returning * into l;
  else
    select * into l from public.event_licences where id = p_id and event_id = e.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.event_licences set holder = coalesce(nullif(p ->> 'holder', ''), holder), authority = coalesce(p ->> 'authority', authority), reference = coalesce(p ->> 'reference', reference),
      valid_from = case when p ? 'valid_from' then nullif(p ->> 'valid_from', '')::timestamptz else valid_from end,
      valid_to = case when p ? 'valid_to' then nullif(p ->> 'valid_to', '')::timestamptz else valid_to end,
      conditions = coalesce(p ->> 'conditions', conditions), document_path = coalesce(path, document_path), last_reminder_days = null where id = l.id returning * into l;
    if l.status = 'granted' and l.valid_to is null and exists (select 1 from public.licence_types t where t.key = l.licence_type and t.expires) then
      raise exception 'valid_to_required' using errcode = '22023', detail = 'This licence type expires: a granted licence needs a valid-to date.';
    end if;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (auth.uid(), e.workspace_id, 'compliance.licence_saved', jsonb_build_object('event_id', e.id, 'licence_id', l.id, 'licence_type', l.licence_type));
  return jsonb_build_object('id', l.id, 'status', l.status);
end $$;

insert into public.domain_event_types(event_type, schema_version, aggregate, description, public_type) values
  ('waiver.draft_retired', 1, 'waiver_template', 'A draft waiver version was retired without publishing (payload: template_id, family_id, version).', null),
  ('promotion.blackout_deleted', 1, 'promotion_blackout', 'A promotion blackout was deleted (payload: blackout_id, starts_at, ends_at, channel).', null),
  ('lost_property.item_disposed', 1, 'found_item', 'A found item was disposed of after its retention period (payload: event_id, item_id, category, method).', null),
  ('template.family_archived', 1, 'event_template', 'Every version of an event template family was archived (payload: template_id, family_id, versions_archived).', null),
  ('compliance.licence_expiry_cleared', 1, 'event_licence', 'A licence valid-to date was cleared (payload: event_id, licence_id, licence_type, status).', null)
on conflict (event_type) do update set description = excluded.description, aggregate = excluded.aggregate;

revoke all on function public.retire_waiver_draft(uuid, text), public.delete_promotion_blackout(uuid), public.dispose_found_item(uuid, text, text),
  public.archive_event_template_family(uuid), public.licence_clear_expiry(uuid, text) from public, anon;
grant execute on function public.retire_waiver_draft(uuid, text), public.delete_promotion_blackout(uuid), public.dispose_found_item(uuid, text, text),
  public.archive_event_template_family(uuid), public.licence_clear_expiry(uuid, text) to authenticated, service_role;
