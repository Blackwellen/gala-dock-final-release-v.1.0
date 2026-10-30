-- Lane D4 / S2 (W03 organiser UI backlog: Q18 access, Q20 inventory). Additive only.
--   1. Promoter allocation mirror (Q20 gap): promoters.ticket_allocation is mirrored into one `promoter` ticket_allocations row
--      per promoter (source = 'promoter_mirror'). The mirror reserves what the promoter still has to sell
--      (ticket_allocation − tickets_sold − unused manual promoter allocations), never more than the tier's free stock, and never
--      less than the units already used through the allocation. Organisers opt in with sync_promoter_allocations(event, tier?);
--      after that, changing a promoter's allocation or status re-syncs automatically (trigger, never blocks the promoter save).
--      No automatic backfill: reserving remaining promoter quota on events already on sale removes public availability, so the
--      first sync is an explicit organiser action.
--   2. Registration form drafts (Q18): one editable draft per event; publishing a draft creates the next published version
--      through the existing publish_registration_form and archives the draft.
--   3. Scanner assignment by email (Q18) for outside door staff, and an editor list of event scanners with names.
-- Grants: authenticated + service_role only (nothing to anon).

-- ═══ 1. Promoter allocation mirror ═══
alter table public.ticket_allocations add column if not exists source text not null default 'manual';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_allocations_source_check' and conrelid = 'public.ticket_allocations'::regclass) then
    alter table public.ticket_allocations add constraint ticket_allocations_source_check check (source in ('manual', 'promoter_mirror'));
  end if;
end $$;
create unique index if not exists ticket_allocations_promoter_mirror_uq on public.ticket_allocations(promoter_id) where source = 'promoter_mirror' and status = 'active';

create or replace function public.promoter_allocation_sync_internal(p_promoter uuid, p_tier uuid default null, p_create boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare p public.promoters; a public.ticket_allocations; t public.ticket_tiers; v_tier uuid; used int := 0; target int; manual_unused int; others int; free int; room int; qty int;
begin
  select * into p from public.promoters where id = p_promoter;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into a from public.ticket_allocations x where x.promoter_id = p.id and x.source = 'promoter_mirror' and x.status = 'active' order by x.created_at limit 1 for update;
  select coalesce(sum(greatest(0, x.quantity - public.ticket_allocation_used(x.id))), 0) into manual_unused
    from public.ticket_allocations x where x.promoter_id = p.id and x.source = 'manual' and x.status = 'active';
  target := case when p.status = 'paused' then 0 else greatest(0, coalesce(p.ticket_allocation, 0) - coalesce(p.tickets_sold, 0) - manual_unused) end;
  if a.id is null then
    if not p_create or target = 0 then return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'none', 'target', target); end if;
    v_tier := coalesce(p_tier, (select x.id from public.ticket_tiers x where x.event_id = p.event_id and x.pass_kind is null and x.status in ('on_sale', 'scheduled', 'draft')
      order by (x.kind = 'general') desc, (x.status = 'on_sale') desc, x.sort, x.name limit 1));
    if v_tier is null then return jsonb_build_object('ok', false, 'promoter_id', p.id, 'name', p.name, 'reason', 'no_tier'); end if;
  else
    v_tier := a.tier_id; used := public.ticket_allocation_used(a.id);
  end if;
  select * into t from public.ticket_tiers where id = v_tier and event_id = p.event_id for update;
  if not found then return jsonb_build_object('ok', false, 'promoter_id', p.id, 'name', p.name, 'reason', 'tier_not_in_event'); end if;
  -- Guard rule (sum of active allocations ≤ tier quantity) and stock: never reserve units that are sold, held, committed to
  -- passes or reserved by another allocation.
  select coalesce(sum(x.quantity), 0) into others from public.ticket_allocations x where x.tier_id = t.id and x.status = 'active' and x.id is distinct from a.id;
  free := t.quantity - t.sold - t.held - public.ticket_tier_reserved(t.id) + case when a.id is null then 0 else greatest(0, a.quantity - used) end;
  room := least(t.quantity - others, used + greatest(0, free));
  qty := greatest(used, least(used + target, room));
  if a.id is null then
    if qty = 0 then return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'none', 'target', target, 'capped', true, 'tier_id', t.id); end if;
    insert into public.ticket_allocations(event_id, tier_id, kind, promoter_id, label, quantity, status, source)
      values (p.event_id, t.id, 'promoter', p.id, left('Promoter: ' || p.name, 80), qty, 'active', 'promoter_mirror') returning * into a;
    return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'created', 'allocation_id', a.id, 'tier_id', t.id, 'quantity', qty, 'used', used, 'target', target, 'capped', qty < used + target);
  end if;
  if qty = 0 then
    update public.ticket_allocations set status = 'released' where id = a.id;
    return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', 'released', 'allocation_id', a.id, 'tier_id', t.id, 'quantity', 0, 'used', 0, 'target', target);
  end if;
  if qty <> a.quantity then update public.ticket_allocations set quantity = qty, label = left('Promoter: ' || p.name, 80) where id = a.id; end if;
  return jsonb_build_object('ok', true, 'promoter_id', p.id, 'name', p.name, 'action', case when qty <> a.quantity then 'updated' else 'unchanged' end, 'allocation_id', a.id,
    'tier_id', t.id, 'quantity', qty, 'used', used, 'target', target, 'capped', qty < used + target);
end $$;

-- Organiser command: mirror every promoter of the event (first sync opts the event in). Idempotent.
create or replace function public.sync_promoter_allocations(p_event uuid, p_tier uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); r jsonb; res jsonb := '[]'; pr record;
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_tier is not null and not exists (select 1 from public.ticket_tiers t where t.id = p_tier and t.event_id = p_event and t.pass_kind is null) then
    raise exception 'tier_not_in_event' using errcode = '22023'; end if;
  perform public.advisory_xact_lock('promoter_allocations', p_event::text);
  for pr in select id from public.promoters where event_id = p_event order by created_at, id loop
    r := public.promoter_allocation_sync_internal(pr.id, p_tier, true);
    res := res || jsonb_build_array(r);
  end loop;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (uid, (select workspace_id from public.events where id = p_event), 'tickets.promoter_allocations_synced', jsonb_build_object('event_id', p_event, 'tier_id', p_tier, 'promoters', jsonb_array_length(res)));
  return jsonb_build_object('ok', true, 'results', res);
end $$;

-- After opt-in, a changed allocation or status re-syncs that promoter. Failures never block the promoter write.
create or replace function public.promoters_allocation_mirror() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.ticket_allocation is distinct from old.ticket_allocation or new.status is distinct from old.status)
     and exists (select 1 from public.ticket_allocations x where x.promoter_id = new.id and x.source = 'promoter_mirror' and x.status = 'active') then
    begin
      perform public.promoter_allocation_sync_internal(new.id, null, false);
    exception when others then
      raise warning 'promoter allocation mirror skipped for %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;
drop trigger if exists promoters_allocation_mirror on public.promoters;
create trigger promoters_allocation_mirror after update of ticket_allocation, status on public.promoters for each row execute function public.promoters_allocation_mirror();

-- ═══ 2. Registration form drafts ═══
create unique index if not exists registration_forms_one_draft on public.registration_forms(event_id) where status = 'draft';

create or replace function public.save_registration_form_draft(p_event uuid, p_form jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); f jsonb; keys text[] := '{}'; v_id uuid;
begin
  if uid is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_form->'fields') <> 'array' or jsonb_array_length(p_form->'fields') > 40 then raise exception 'invalid_fields' using errcode = '22023'; end if;
  for f in select * from jsonb_array_elements(p_form->'fields') loop
    if coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$' or (f->>'key') = any(keys) then raise exception 'invalid_field_key' using errcode = '22023', detail = coalesce(f->>'key', ''); end if;
    if coalesce(f->>'type', '') not in ('text','textarea','email','phone','number','date','select','multiselect','checkbox') then raise exception 'invalid_field_type' using errcode = '22023', detail = f->>'key'; end if;
    if (f->>'type') in ('select','multiselect') and (jsonb_typeof(f->'options') <> 'array' or jsonb_array_length(f->'options') = 0) then raise exception 'options_required' using errcode = '22023', detail = f->>'key'; end if;
    keys := keys || (f->>'key');
  end loop;
  update public.registration_forms set title = left(coalesce(nullif(btrim(p_form->>'title'), ''), 'Registration'), 120), fields = p_form->'fields',
      capacity = nullif(p_form->>'capacity', '')::int, per_email_limit = coalesce(nullif(p_form->>'per_email_limit', '')::int, 1),
      approval_required = coalesce((p_form->>'approval_required')::boolean, false), waitlist = coalesce((p_form->>'waitlist')::boolean, true),
      opens_at = nullif(p_form->>'opens_at', '')::timestamptz, closes_at = nullif(p_form->>'closes_at', '')::timestamptz
    where event_id = p_event and status = 'draft' returning id into v_id;
  if v_id is null then
    insert into public.registration_forms(event_id, version, status, title, fields, capacity, per_email_limit, approval_required, waitlist, opens_at, closes_at, created_by)
      values (p_event, 1, 'draft', left(coalesce(nullif(btrim(p_form->>'title'), ''), 'Registration'), 120), p_form->'fields', nullif(p_form->>'capacity', '')::int,
        coalesce(nullif(p_form->>'per_email_limit', '')::int, 1), coalesce((p_form->>'approval_required')::boolean, false), coalesce((p_form->>'waitlist')::boolean, true),
        nullif(p_form->>'opens_at', '')::timestamptz, nullif(p_form->>'closes_at', '')::timestamptz, uid)
      returning id into v_id;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata) values (uid, (select workspace_id from public.events where id = p_event), 'registration.form_draft_saved', jsonb_build_object('event_id', p_event, 'form_id', v_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.publish_registration_form_draft(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d public.registration_forms; r jsonb;
begin
  if (select auth.uid()) is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select * into d from public.registration_forms where event_id = p_event and status = 'draft' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  r := public.publish_registration_form(p_event, jsonb_build_object('title', d.title, 'fields', d.fields, 'capacity', d.capacity, 'per_email_limit', d.per_email_limit,
    'approval_required', d.approval_required, 'waitlist', d.waitlist, 'opens_at', d.opens_at, 'closes_at', d.closes_at));
  update public.registration_forms set status = 'archived' where id = d.id;
  return r || jsonb_build_object('draft_id', d.id);
end $$;

create or replace function public.discard_registration_form_draft(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if (select auth.uid()) is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.registration_forms set status = 'archived' where event_id = p_event and status = 'draft';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'discarded', n);
end $$;

-- ═══ 3. Scanner assignment by email + editor list ═══
-- Same lookup precedent as virtual_role_assign: an event editor can grant door access to an existing Gala Dock account by email.
create or replace function public.assign_event_scanner_by_email(p_event uuid, p_email text, p_zones uuid[] default '{}', p_expires_at timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare target uuid;
begin
  if (select auth.uid()) is null or not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if coalesce(btrim(p_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  select u.id into target from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if target is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  return public.assign_event_scanner(p_event, target, coalesce(p_zones, '{}'), p_expires_at) || jsonb_build_object('user_id', target);
end $$;

create or replace function public.event_scanners_list(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.event_dependency_can_write(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id, 'name', nullif(pr.full_name, ''), 'email', u.email, 'zones', s.zones, 'expires_at', s.expires_at,
      'revoked_at', s.revoked_at, 'created_at', s.created_at, 'member', exists (select 1 from public.events e join public.workspace_members m on m.workspace_id = e.workspace_id where e.id = p_event and m.user_id = s.user_id))
    order by (s.revoked_at is null) desc, s.created_at desc)
    from public.event_scanners s left join auth.users u on u.id = s.user_id left join public.profiles pr on pr.id = s.user_id where s.event_id = p_event), '[]');
end $$;

-- ═══ Grants ═══
revoke all on function public.promoter_allocation_sync_internal(uuid, uuid, boolean), public.promoters_allocation_mirror() from public, anon, authenticated;
grant execute on function public.promoter_allocation_sync_internal(uuid, uuid, boolean) to service_role;
revoke all on function public.sync_promoter_allocations(uuid, uuid), public.save_registration_form_draft(uuid, jsonb), public.publish_registration_form_draft(uuid),
  public.discard_registration_form_draft(uuid), public.assign_event_scanner_by_email(uuid, text, uuid[], timestamptz), public.event_scanners_list(uuid) from public, anon;
grant execute on function public.sync_promoter_allocations(uuid, uuid), public.save_registration_form_draft(uuid, jsonb), public.publish_registration_form_draft(uuid),
  public.discard_registration_form_draft(uuid), public.assign_event_scanner_by_email(uuid, text, uuid[], timestamptz), public.event_scanners_list(uuid) to authenticated, service_role;
