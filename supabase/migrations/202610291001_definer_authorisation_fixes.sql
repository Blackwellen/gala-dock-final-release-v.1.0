-- Q01 (lane A): SECURITY DEFINER authorisation fixes found by the definer audit. Additive and idempotent.
-- 1. payout_eligible: exposed every workspace's Stripe Connect payout state to anon/authenticated. Only the payments worker (service role) calls it.
-- 2. rls_auto_enable: event-trigger helper, executable by anon/authenticated through PUBLIC. Revoked (event triggers run as the DDL role).
-- 3. cancellation_quote: returned paid amounts, deposits and policy for ANY build item to any signed-in user. Now requires event access, the listing's provider or a platform admin.
-- 4. space_conflicts: returned provider job/hold ids and private block notes for ANY venue space. Non-members now get level, generic reason and times only.
-- 5. event_virtual_public: returned virtual-session settings for draft/private events. Now public events, event members and ticket holders only.
-- 6. contact_support: attached a case to a workspace for revoked/suspended members (checked membership rows without status). Uses is_workspace_member().
-- 7. can_access_event / can_edit_event / can_see_event_money / template_usable / template_used: the "owner_id = me" shortcut also applied to
--    WORKSPACE records, so a revoked member who created a record, or the owner of a SUSPENDED workspace, kept access. The shortcut now applies
--    only to personal records (workspace_id is null); workspace records always go through is_workspace_member/has_workspace_role (active member of an active workspace).

-- 1, 2
revoke execute on function public.payout_eligible(uuid) from public, anon, authenticated;
grant execute on function public.payout_eligible(uuid) to service_role;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- 3
CREATE OR REPLACE FUNCTION public.cancellation_quote(p_item uuid, p_party text, p_kind text, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.build_items; e public.events; j public.provider_jobs; pol jsonb; t jsonb; days numeric; pct numeric := null; paid numeric; total numeric;
  dep numeric; nonrec numeric; refund numeric; retain numeric; review boolean := false; notes text[] := '{}';
begin
  select * into b from public.build_items where id = p_item;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Service-role callers (no JWT user) are trusted workers; signed-in callers must be a party to the booking.
  if auth.uid() is not null and not (public.can_access_event(b.event_id) or (b.listing_id is not null and public.is_listing_provider(b.listing_id)) or public.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into e from public.events where id = b.event_id;
  select * into j from public.provider_jobs where build_item_id = b.id order by created_at desc limit 1;
  pol := coalesce(b.terms_snapshot->'cancellation',
    (select q.terms->'cancellation' from public.provider_quotes q where q.build_item_id = b.id and q.status in ('accepted','sent','viewed') order by q.version desc limit 1),
    (select l.details->'cancellation' from public.listings l where l.id = b.listing_id));
  if jsonb_typeof(pol) is distinct from 'object' then pol := null; end if;
  total := coalesce(b.amount, 0);
  paid := coalesce(j.paid_amount, case when b.status in ('confirmed','active','fulfilled') then coalesce(b.deposit, 0) else 0 end, 0);
  dep := least(coalesce(b.deposit, 0), paid);
  days := case when e.starts_at is null then null else extract(epoch from (e.starts_at - p_at)) / 86400 end;
  nonrec := least(paid, greatest(coalesce((pol->>'nonrecoverable')::numeric, 0), 0));
  if p_party = 'provider' then
    refund := paid; pct := 100; notes := notes || 'Provider cancellation: the customer is refunded in full.'::text;
  elsif p_kind = 'force_majeure' or p_party = 'platform' then
    review := true; refund := null; notes := notes || 'Force majeure or platform cancellation is decided by Gala Dock review.'::text;
  elsif p_kind = 'reschedule' then
    refund := 0; pct := null; notes := notes || 'Reschedule keeps the booking value; the provider must agree the new date.'::text;
  elsif pol is null or jsonb_typeof(pol->'tiers') <> 'array' then
    review := true; refund := null; notes := notes || 'No cancellation policy on record, so this needs review rather than an automatic forfeit.'::text;
  else
    for t in select x from jsonb_array_elements(pol->'tiers') x order by (x->>'days_before')::numeric desc loop
      if days is not null and days >= (t->>'days_before')::numeric then pct := greatest(least((t->>'refund_pct')::numeric, 100), 0); exit; end if;
    end loop;
    pct := coalesce(pct, 0);
    refund := round((paid - case when coalesce((pol->>'deposit_refundable')::boolean, true) then 0 else dep end - nonrec) * pct / 100.0, 2);
    refund := greatest(refund, 0);
    if p_party = 'mutual' then notes := notes || 'Mutual cancellation: the amounts shown apply unless both sides agree otherwise.'::text; review := false; end if;
  end if;
  if p_kind = 'partial' then review := true; notes := notes || 'Partial cancellations are agreed with the provider before any refund.'::text; end if;
  retain := case when refund is null then null else paid - refund end;
  return jsonb_build_object('paid', paid, 'total', total, 'deposit', dep, 'nonrecoverable', nonrec, 'days_before_event', round(days, 1),
    'refund_pct', pct, 'refund_amount', refund, 'provider_retains', retain, 'requires_review', review, 'policy', pol, 'notes', to_jsonb(notes),
    'event_within_72h', days is not null and days < 3);
end $function$
;

-- 4: the unredacted calculation moves to a service-only function; the public name becomes a redacting wrapper.
CREATE OR REPLACE FUNCTION public.space_conflicts_internal(p_space uuid, p_starts timestamp with time zone, p_ends timestamp with time zone, p_exclude_item uuid DEFAULT NULL::uuid)
 RETURNS TABLE(level text, reason text, ref_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.spaces; setup interval; clear interval; turn interval; win tstzrange; hrs jsonb; dow text;
begin
  select * into s from public.spaces where id = p_space;
  if not found then return; end if;
  setup := make_interval(mins => coalesce((s.details->>'setup_minutes')::int, 0));
  clear := make_interval(mins => coalesce((s.details->>'cleardown_minutes')::int, 0));
  turn := make_interval(mins => coalesce(s.turnaround_minutes, 0));
  win := tstzrange(p_starts - setup - turn, p_ends + clear + turn);
  -- Same space, linked spaces (part/whole, shared walls) and anything in the same exclusive group.
  return query
    with related as (
      select s.id sid, 'this space' why union
      select case when l.space_a = s.id then l.space_b else l.space_a end, case when l.kind = 'exclusive' then 'exclusive pairing' else 'linked space' end
        from public.space_links l where l.space_a = s.id or l.space_b = s.id union
      select x.id, 'same exclusive group' from public.spaces x where s.exclusive_group is not null and x.exclusive_group = s.exclusive_group and x.id <> s.id)
    select 'hard', 'Booked: ' || r.why, j.id, j.starts_at, j.ends_at
      from public.provider_jobs j join related r on r.sid = j.space_id
      where j.status in ('held','confirmed','active','deposit_paid') and tstzrange(j.starts_at, coalesce(j.ends_at, j.starts_at + interval '6 hours')) && win
        and (p_exclude_item is null or j.build_item_id is distinct from p_exclude_item)
    union all
    -- Exclusive venue hire blocks every space at the venue.
    select 'hard', 'Exclusive hire of the whole venue', j.id, j.starts_at, j.ends_at
      from public.provider_jobs j where j.listing_id = s.venue_id and j.space_id is null and coalesce((j.details->>'exclusive')::boolean, false)
        and j.status in ('held','confirmed','active','deposit_paid') and tstzrange(j.starts_at, coalesce(j.ends_at, j.starts_at + interval '6 hours')) && win
    union all
    select 'hard', 'Hold on this space', h.id, h.window_start, h.window_end
      from public.conditional_holds h join related r on r.sid = h.space_id
      where h.status = 'held' and h.blocking_level = 'hard' and tstzrange(h.window_start, h.window_end) && win and h.build_item_id is distinct from p_exclude_item
    union all
    select 'soft', 'Soft hold on this space', h.id, h.window_start, h.window_end
      from public.conditional_holds h join related r on r.sid = h.space_id
      where h.status = 'held' and h.blocking_level = 'soft' and tstzrange(h.window_start, h.window_end) && win and h.build_item_id is distinct from p_exclude_item
    union all
    select 'hard', initcap(replace(b.kind, '_', ' ')) || coalesce(': ' || nullif(b.note, ''), ''), b.id, b.starts_at, b.ends_at
      from public.availability_blocks b where (b.space_id = s.id or (b.space_id is null and b.listing_id = s.venue_id)) and b.kind <> 'emergency_window'
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts, p_ends);
  -- Business hours (details.hours = {"mon":"09:00-23:00",...}); outside hours is a soft conflict (venue may agree overtime).
  hrs := s.details->'hours';
  if jsonb_typeof(hrs) = 'object' then
    dow := lower(to_char(p_starts at time zone 'Europe/London', 'dy'));
    if hrs ? dow and coalesce(hrs->>dow, '') ~ '^\d{2}:\d{2}-\d{2}:\d{2}$' then
      if (p_starts at time zone 'Europe/London')::time < split_part(hrs->>dow, '-', 1)::time
         or ((p_ends at time zone 'Europe/London')::time > split_part(hrs->>dow, '-', 2)::time and split_part(hrs->>dow, '-', 2) <> '00:00'
             and (p_ends at time zone 'Europe/London')::date = (p_starts at time zone 'Europe/London')::date) then
        return query select 'soft'::text, ('Outside opening hours (' || (hrs->>dow) || ')')::text, null::uuid, p_starts, p_ends;
      end if;
    elsif hrs ? dow and coalesce(hrs->>dow, '') in ('closed','') then
      return query select 'hard'::text, 'Venue closed on this day'::text, null::uuid, p_starts, p_ends;
    end if;
  end if;
end $function$
;
revoke execute on function public.space_conflicts_internal(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.space_conflicts_internal(uuid, timestamptz, timestamptz, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.space_conflicts(p_space uuid, p_starts timestamp with time zone, p_ends timestamp with time zone, p_exclude_item uuid DEFAULT NULL::uuid)
 RETURNS TABLE(level text, reason text, ref_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.spaces; trusted boolean;
begin
  select * into s from public.spaces where id = p_space;
  if not found then return; end if;
  -- Members of the venue's workspace, platform admins and service workers see references and notes; everyone else sees only that a slot is taken.
  trusted := auth.uid() is null or public.is_workspace_member(s.workspace_id) or public.is_platform_admin();
  return query
    select c.level,
      case when trusted or c.reason like 'Booked:%' or c.reason like 'Exclusive hire%' or c.reason like 'Hold on%' or c.reason like 'Soft hold%'
             or c.reason like 'Outside opening hours%' or c.reason like 'Venue closed%' then c.reason
           else split_part(c.reason, ':', 1) end,
      case when trusted then c.ref_id end, c.starts_at, c.ends_at
    from public.space_conflicts_internal(p_space, p_starts, p_ends, p_exclude_item) c;
end
$function$;

-- 5
CREATE OR REPLACE FUNCTION public.event_virtual_public(p_event uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('format', v.format, 'provider', v.provider, 'ticket_required', v.ticket_required, 'opens_minutes_before', v.opens_minutes_before,
    'replay_available', v.replay_available and v.recording_url is not null) from public.event_virtual v join public.events e on e.id = v.event_id
   where v.event_id = p_event
     and ((e.visibility = 'public' and e.status in ('published','on_sale','live','completed')) or public.can_access_event(e.id) or public.holds_ticket_for(e.id));
$function$
;

-- 6
CREATE OR REPLACE FUNCTION public.contact_support(p_subject text, p_body text, p_category text DEFAULT 'other'::text, p_workspace uuid DEFAULT NULL::uuid, p_source text DEFAULT 'Help Centre'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_case uuid; v_ref text; n integer; v_name text; v_ws uuid; v_ws_name text; v_cat text;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 3 and 200 or length(btrim(coalesce(p_body, ''))) not between 10 and 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_cat := case when p_category in ('booking','ticketing','payment','account','technical','refund','other') then p_category else 'other' end;
  if not public.hit_rate_limit('support:contact:' || auth.uid(), 5, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if p_workspace is not null and public.is_workspace_member(p_workspace) then
    v_ws := p_workspace; select name into v_ws_name from public.workspaces where id = v_ws;
  end if;
  select coalesce(nullif(p.full_name, ''), u.email, 'Gala Dock user') into v_name from auth.users u left join public.profiles p on p.id = u.id where u.id = auth.uid();
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  v_ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_id, requester_name, workspace_id, sla_due_at, related)
    values (v_ref, btrim(p_subject), v_cat, case when v_cat in ('payment','refund') then 'high' else 'medium' end, 'open', auth.uid(), left(v_name, 120), v_ws,
      now() + case when v_cat in ('payment','refund') then interval '4 hours' else interval '8 hours' end,
      jsonb_build_object('source', left(coalesce(nullif(btrim(p_source), ''), 'Help Centre'), 60)) || case when v_ws is null then '{}'::jsonb else jsonb_build_object('workspace', v_ws_name) end)
    returning id into v_case;
  insert into public.support_messages(case_id, author_id, author, body, internal, role) values (v_case, auth.uid(), left(v_name, 120), btrim(p_body), false, 'customer');
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', v_ws, 'support.case_opened', jsonb_build_object('case_id', v_case, 'reference', v_ref, 'category', v_cat, 'source', p_source));
  return v_ref;
end $function$
;

-- 7
CREATE OR REPLACE FUNCTION public.can_access_event(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.events e where e.id = target and (
    (e.workspace_id is null and e.owner_id = (select auth.uid())) or (e.workspace_id is not null and public.is_workspace_member(e.workspace_id))));
$function$
;

CREATE OR REPLACE FUNCTION public.can_edit_event(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.events e where e.id = target and ((e.workspace_id is null and e.owner_id = (select auth.uid()))
    or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager','member']))));
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_event_money(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.events e where e.id = target and (
    (e.workspace_id is null and e.owner_id = (select auth.uid())) or (e.workspace_id is not null and public.has_workspace_role(e.workspace_id, array['owner','manager','finance']))));
$function$
;

CREATE OR REPLACE FUNCTION public.template_usable(p_template uuid, p_link_hash text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.design_templates t where t.id = p_template and t.status = 'active' and (
    t.visibility = 'public' or (t.workspace_id is null and t.owner_id is null) or (t.workspace_id is null and t.owner_id = (select auth.uid()))
    or (t.workspace_id is not null and t.visibility <> 'private' and public.is_workspace_member(t.workspace_id))
    or (t.visibility = 'link' and p_link_hash is not null and t.link_token_hash = p_link_hash)));
$function$
;

CREATE OR REPLACE FUNCTION public.template_used(p_template uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.design_templates t set usage_count = usage_count + 1
   where t.id = p_template and t.status = 'active'
     and (t.visibility = 'public' or (t.workspace_id is null and t.owner_id is null) or (t.workspace_id is null and t.owner_id = auth.uid())
          or (t.workspace_id is not null and t.visibility in ('workspace','link','public') and public.is_workspace_member(t.workspace_id)));
end $function$
;

