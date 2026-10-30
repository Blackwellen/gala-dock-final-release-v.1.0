-- Q32 follow-up (lane D, 2026-10-29): the audited fixture purge (4022) was blocked for 19 test workspaces by append-only /
-- immutability triggers added by other packets after 4022 (plan_immutable = safety_plans, rider_immutable = talent_riders,
-- stock_movements_append_only) and by NO ACTION / RESTRICT foreign keys ("update or delete on table tickets violates foreign key
-- constraint checkout_resale_allocations_ticket_id_fkey / ticket_transfers_new_ticket_id_fkey" is the "update" blocker; then
-- merch_order_lines -> merch_items RESTRICT inside the workspace cascade).
-- Every append-only / immutable trigger now honours the purge record exactly like trg_contracts_immutable (fixture_purge_active():
-- gala.fixture_purge = a fixture_purges id created in this transaction; only admin_purge_test_workspaces can create one).
-- Deliberately NOT bypassed: ledger_immutable (workspaces with ledger postings are refused by fixture_purge_refusals), storage
-- protect_delete, and the purge's own audit tables. Same signatures; CREATE OR REPLACE from the live definitions; nothing is purged here.

CREATE OR REPLACE FUNCTION public.consent_records_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  raise exception 'consent_records_append_only' using errcode = '55000';
end $function$;

CREATE OR REPLACE FUNCTION public.event_order_versions_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  -- Deletion is only allowed as part of removing the whole order (cascade from account/workspace deletion).
  if tg_op = 'DELETE' then
    if exists (select 1 from public.event_orders o where o.id = old.order_id) then raise exception 'event order versions are immutable' using errcode = '42501'; end if;
    return old;
  end if;
  if new.content is distinct from old.content or new.financial is distinct from old.financial or new.version <> old.version then
    raise exception 'event order versions are immutable' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.map_rule_packs_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op = 'DELETE' or new.rules is distinct from old.rules or new.key <> old.key or new.version <> old.version then
    raise exception 'map_rule_pack_immutable' using errcode = '42501', hint = 'Publish a new version instead.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ranking_models_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op = 'DELETE' then raise exception 'ranking_model_immutable' using errcode = '42501'; end if;
  if new.weights is distinct from old.weights or new.params is distinct from old.params or new.version is distinct from old.version then
    raise exception 'ranking_model_immutable' using errcode = '42501', hint = 'Add a new version instead.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.reliability_formulas_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op = 'DELETE' then raise exception 'formula_versions_are_append_only' using errcode = '42501'; end if;
  if new.weights is distinct from old.weights or new.min_samples is distinct from old.min_samples or new.review_prior is distinct from old.review_prior
     or new.review_prior_weight is distinct from old.review_prior_weight or new.window_days is distinct from old.window_days then
    raise exception 'formula_versions_are_append_only' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.resale_policies_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if TG_OP = 'DELETE' then
    if old.status <> 'draft' then raise exception 'resale_policy_immutable' using errcode = '22023'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.jurisdiction, new.version, new.effective_from, new.price_cap_pct, new.cap_basis, new.listing_cutoff_hours,
      new.max_active_listings_per_user, new.required_disclosures, new.legal_text) is distinct from (old.jurisdiction, old.version, old.effective_from,
      old.price_cap_pct, old.cap_basis, old.listing_cutoff_hours, old.max_active_listings_per_user, old.required_disclosures, old.legal_text) then
    raise exception 'resale_policy_immutable' using errcode = '22023';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then raise exception 'resale_policy_immutable' using errcode = '22023'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.safety_plans_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if TG_OP = 'DELETE' then
    if old.status <> 'draft' then raise exception 'plan_immutable' using errcode = '22023'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.sections is distinct from old.sections or new.title is distinct from old.title or new.kind is distinct from old.kind or new.version is distinct from old.version
     or new.stewards is distinct from old.stewards or new.first_aiders is distinct from old.first_aiders or new.document_path is distinct from old.document_path or new.medical_provider is distinct from old.medical_provider) then
    raise exception 'plan_immutable' using errcode = '22023'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.stock_movements_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare it public.stock_items;
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op <> 'INSERT' then raise exception 'stock_movements_append_only' using errcode = '22023'; end if;
  select * into it from public.stock_items where id = new.item_id for update;
  new.delta := case new.kind when 'receive' then new.quantity when 'return' then new.quantity when 'transfer_in' then new.quantity when 'refund' then new.quantity
    when 'issue' then -new.quantity when 'transfer_out' then -new.quantity when 'waste' then -new.quantity when 'sale' then -new.quantity
    when 'count' then new.quantity - it.on_hand else new.delta end;   -- adjust: caller-signed delta; count: absolute stock-take
  if it.on_hand + new.delta < (case when new.kind = 'sale' then it.reserved - new.quantity else it.reserved end) or it.on_hand + new.delta < 0 then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;
  update public.stock_items set on_hand = on_hand + new.delta, reserved = case when new.kind = 'sale' then greatest(0, reserved - new.quantity) else reserved end, updated_at = now()
   where id = it.id;
  new.on_hand_after := it.on_hand + new.delta;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.support_case_events_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  raise exception 'support_case_events_append_only' using errcode = '42501';
end $function$;

CREATE OR REPLACE FUNCTION public.talent_riders_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if TG_TABLE_NAME = 'talent_riders' then
    if TG_OP = 'DELETE' then raise exception 'rider_immutable' using errcode = '22023'; end if;
    if old.status <> 'draft' and (new.summary is distinct from old.summary or new.kind is distinct from old.kind or new.version is distinct from old.version or new.party_id is distinct from old.party_id) then
      raise exception 'rider_immutable' using errcode = '22023'; end if;
    return new;
  end if;
  if exists (select 1 from public.talent_riders r where r.id = coalesce(new.rider_id, old.rider_id) and r.status <> 'draft') then
    if TG_OP <> 'UPDATE' or new.category is distinct from old.category or new.description is distinct from old.description or new.quantity is distinct from old.quantity
       or new.required is distinct from old.required or new.spec is distinct from old.spec or new.rider_id is distinct from old.rider_id then
      raise exception 'rider_immutable' using errcode = '22023'; end if;
  end if;
  return coalesce(new, old);
end $function$;

CREATE OR REPLACE FUNCTION public.trg_event_lifecycle_overrides_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  raise exception 'append_only: event_lifecycle_overrides rows cannot be changed' using errcode = '42501';
end $function$;

CREATE OR REPLACE FUNCTION public.agent_tool_calls_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  -- Only the open call row may be completed once; history is never rewritten.
  if TG_OP = 'DELETE' then return old; end if;   -- cascades from run/workspace deletion (retention) only; no client can delete (no policy)
  if old.status <> 'running' or new.id <> old.id or new.idempotency_key <> old.idempotency_key or new.tool_id <> old.tool_id or new.actor_id is distinct from old.actor_id
     or new.workspace_id is distinct from old.workspace_id or new.args_hash <> old.args_hash then
    raise exception 'agent_tool_calls_append_only' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.waiver_templates_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' and (new.body is distinct from old.body or new.title is distinct from old.title or new.minors_allowed is distinct from old.minors_allowed
     or new.adult_age is distinct from old.adult_age or new.version <> old.version) then raise exception 'waiver_version_immutable' using errcode = '22023'; end if;
  new.body_sha256 := encode(extensions.digest(new.body, 'sha256'), 'hex');
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.event_forms_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f jsonb;
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.fields is distinct from old.fields or new.title is distinct from old.title or new.audience is distinct from old.audience or new.version <> old.version then
      raise exception 'form_version_immutable' using errcode = '22023';
    end if;
    if not (old.status = 'published' and new.status = 'retired') and new.status <> old.status then raise exception 'illegal_form_transition' using errcode = '22023'; end if;
  end if;
  for f in select * from jsonb_array_elements(new.fields) loop
    if coalesce(f->>'key', '') !~ '^[a-z][a-z0-9_]{0,39}$' or coalesce(f->>'type', '') not in ('text','textarea','number','email','phone','date','select','multiselect','checkbox','consent','signature') then
      raise exception 'invalid_field' using errcode = '22023';
    end if;
  end loop;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.registration_forms_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if tg_op = 'UPDATE' and old.status in ('published','superseded','archived') and (new.fields is distinct from old.fields or new.version is distinct from old.version
     or new.capacity is distinct from old.capacity or new.approval_required is distinct from old.approval_required) then
    raise exception 'published_form_immutable' using errcode = '22023'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.build_items_client_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  -- States from which the buyer may cancel directly (no provider commitment, no money taken).
  open_states constant text[] := array['suggested','draft','enquiry_created','requested','sent','awaiting','awaiting_provider','clarification',
    'clarification_requested','available','quoted','quote_received','quote_revised','customer_reviewing','hold','held','conditional_hold_requested',
    'standby','expired','expired_no_response','declined','unavailable'];
  composing boolean;
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('suggested', 'draft', 'sent') or (new.status = 'sent' and new.request_id is null) then
      raise exception 'build_item_status_requires_command:%', new.status using errcode = '42501',
        hint = 'New build lines start as suggested/draft; requests, holds and confirmations go through their commands.';
    end if;
    if new.terms_snapshot is not null or new.hold_expires_at is not null or new.responded_at is not null or new.response_status is not null
       or new.status_before_hold is not null or new.space_id is not null or coalesce(new.response_reminders, 0) <> 0 or new.sent_at is not null then
      raise exception 'build_item_protected_fields' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status not in ('suggested', 'draft') then
      raise exception 'build_item_not_deletable:%', old.status using errcode = '42501', hint = 'Cancel committed lines through the cancellation flow.';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.event_id is distinct from old.event_id or new.request_id is distinct from old.request_id
     or new.terms_snapshot is distinct from old.terms_snapshot or new.hold_expires_at is distinct from old.hold_expires_at
     or new.response_deadline is distinct from old.response_deadline or new.sent_at is distinct from old.sent_at
     or new.responded_at is distinct from old.responded_at or new.response_status is distinct from old.response_status
     or new.response_reminders is distinct from old.response_reminders or new.status_before_hold is distinct from old.status_before_hold
     or new.space_id is distinct from old.space_id or new.created_at is distinct from old.created_at or new.id is distinct from old.id then
    raise exception 'build_item_protected_fields' using errcode = '42501';
  end if;
  composing := old.status in ('suggested', 'draft');
  if not composing and (new.listing_id is distinct from old.listing_id or new.category is distinct from old.category
     or new.amount is distinct from old.amount or new.deposit is distinct from old.deposit
     or new.price_basis is distinct from old.price_basis or new.quote is distinct from old.quote) then
    raise exception 'build_item_terms_locked:%', old.status using errcode = '42501', hint = 'Prices and terms change only through quotes.';
  end if;
  if new.status is distinct from old.status then
    if not (composing and new.status in ('suggested', 'draft'))
       and not (new.status in ('cancelled', 'cancelled_by_customer') and old.status = any(open_states)) then
      raise exception 'build_item_status_requires_command:%->%', old.status, new.status using errcode = '42501',
        hint = 'Confirmation and payment states are set by the payment path; use the booking commands.';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.protect_job_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
  if old.commercial_snapshot <> '{}'::jsonb and new.commercial_snapshot is distinct from old.commercial_snapshot then
    raise exception 'commercial_snapshot_immutable' using errcode = '42501';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_media_file_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); source_id uuid; source_owner uuid;
begin
  -- Q32 fixture purge (4031): deletes, and the FK set-null updates their cascades cause, pass only inside an audited purge
  -- of test fixture workspaces (a fixture_purges record created in this transaction). Inserts are never bypassed.
  if tg_op in ('DELETE','UPDATE') and public.fixture_purge_active() then if tg_op = 'DELETE' then return old; end if; return new; end if;
 if tg_op='UPDATE' and new.url is not distinct from old.url then
  if new.storage_object_id is distinct from old.storage_object_id or new.source_verified is distinct from old.source_verified then
   raise exception 'private_file_source_immutable' using errcode='42501';
  end if;
  return new;
 end if;
 new.storage_object_id:=null;new.source_verified:=false;
 if new.url ~ '^[0-9a-f-]{36}/' then
  if actor is not null and split_part(new.url,'/',1)<>actor::text then raise exception 'private_file_source_not_owned' using errcode='42501';end if;
  if actor is null then
   -- Trusted server exports produce their own bytes after authorizing the publisher.
   select id into source_id from storage.objects where bucket_id='workspace-files' and name=new.url;
  else
   select v.object_id,v.owner_id into source_id,source_owner from public.verified_private_uploads v
    join storage.objects o on o.id=v.object_id and o.name=v.path and o.bucket_id='workspace-files'
    where v.path=new.url and v.owner_id=actor;
  end if;
  if source_id is null then raise exception 'private_file_source_unverified' using errcode='42501';end if;
  new.storage_object_id:=source_id;new.source_verified:=true;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_purge_test_workspaces(p_workspaces uuid[], p_reason text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid; w uuid; bad jsonb := '{}'; refs text[]; before jsonb; counts jsonb := '{}'; users uuid[]; err text; k text;
begin
  perform public.admin_require('workspaces', p_reason);
  if p_workspaces is null or cardinality(p_workspaces) = 0 or cardinality(p_workspaces) > 50 then raise exception 'invalid_workspaces' using errcode = '22023'; end if;
  perform 1 from public.workspaces where id = any(p_workspaces) for update;
  foreach w in array p_workspaces loop
    refs := public.fixture_purge_refusals(w);
    if cardinality(refs) > 0 then bad := bad || jsonb_build_object(w::text, to_jsonb(refs)); end if;
  end loop;
  if bad <> '{}' then raise exception 'purge_refused: %', bad::text using errcode = '42501'; end if;
  -- Test identities that lose their last membership / ownership (the script removes them through the Auth admin API).
  users := array(select distinct p.uid from (select owner_id uid from public.workspaces where id = any(p_workspaces)
      union select user_id from public.workspace_members where workspace_id = any(p_workspaces)) p
    join auth.users u on u.id = p.uid
    where public.is_test_identity_email(u.email)
      and not exists (select 1 from public.workspaces o where o.owner_id = p.uid and not (o.id = any(p_workspaces)))
      and not exists (select 1 from public.workspace_members m where m.user_id = p.uid and not (m.workspace_id = any(p_workspaces)))
      and not exists (select 1 from public.platform_admins a where a.user_id = p.uid));
  insert into public.fixture_purges(actor_id, reason, workspace_ids, dry_run, users_to_remove) values (auth.uid(), left(trim(p_reason), 500), p_workspaces, p_dry_run, users)
    returning id into pid;
  perform set_config('gala.fixture_purge', pid::text, true);
  select coalesce(jsonb_object_agg(relname, jsonb_build_array(n_tup_del, n_tup_upd)), '{}') into before from pg_stat_xact_user_tables where schemaname = 'public';
  begin
    -- FK-safe order: RESTRICT children of the workspace first, then events (RESTRICT; their own children cascade), then workspaces.
    delete from public.booking_cancellations where workspace_id = any(p_workspaces);
    delete from public.booking_disputes where workspace_id = any(p_workspaces);
    delete from public.transactions where workspace_id = any(p_workspaces);
    delete from public.invoices where workspace_id = any(p_workspaces);
    -- 4031: NO ACTION references into the fixtures' tickets from rows the event cascade doesn't reach (resale allocations on
    -- checkouts, the transferee side of a transfer whose source ticket lives elsewhere): remove / unlink them first.
    delete from public.checkout_resale_allocations a using public.tickets t join public.events e on e.id = t.event_id
      where a.ticket_id = t.id and e.workspace_id = any(p_workspaces);
    update public.ticket_transfers x set new_ticket_id = null from public.tickets t join public.events e on e.id = t.event_id
      where x.new_ticket_id = t.id and e.workspace_id = any(p_workspaces);
    -- RESTRICT chains inside the workspace cascade (order lines -> merch items -> stock items): children first.
    delete from public.merch_order_lines l using public.merch_items i where l.merch_item_id = i.id and i.workspace_id = any(p_workspaces);
    delete from public.merch_orders where workspace_id = any(p_workspaces);
    delete from public.merch_items where workspace_id = any(p_workspaces);
    delete from public.events where workspace_id = any(p_workspaces);
    delete from public.workspaces where id = any(p_workspaces);
    select coalesce(jsonb_object_agg(s.relname, jsonb_build_object('deleted', s.n_tup_del - coalesce((before->s.relname->>0)::bigint, 0), 'updated', s.n_tup_upd - coalesce((before->s.relname->>1)::bigint, 0))), '{}')
      into counts from pg_stat_xact_user_tables s where s.schemaname = 'public'
        and (s.n_tup_del <> coalesce((before->s.relname->>0)::bigint, 0) or s.n_tup_upd <> coalesce((before->s.relname->>1)::bigint, 0));
    if p_dry_run then raise exception 'gd_fixture_dry_run'; end if;
  exception when others then
    if sqlerrm <> 'gd_fixture_dry_run' then
      err := sqlerrm;
      perform set_config('gala.fixture_purge', '', true);
      raise exception 'purge_blocked: %', err using errcode = '55000';
    end if;
  end;
  perform set_config('gala.fixture_purge', '', true);
  -- The purge's own bookkeeping rows are not part of the counts.
  counts := counts - 'fixture_purges' - 'fixture_purge_counts';
  for k in select jsonb_object_keys(counts) loop
    insert into public.fixture_purge_counts(purge_id, table_name, deleted, updated) values (pid, k, (counts->k->>'deleted')::bigint, (counts->k->>'updated')::bigint);
  end loop;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', case when p_dry_run then 'admin.test_fixture_purge_previewed' else 'admin.test_fixtures_purged' end,
    jsonb_build_object('purge_id', pid, 'workspaces', to_jsonb(p_workspaces), 'tables', (select count(*) from jsonb_object_keys(counts)), 'users_to_remove', cardinality(users), 'reason', left(p_reason, 300)));
  return jsonb_build_object('purge_id', pid, 'dry_run', p_dry_run, 'workspaces', to_jsonb(p_workspaces), 'tables', counts, 'users_to_remove', to_jsonb(users));
end $function$;
