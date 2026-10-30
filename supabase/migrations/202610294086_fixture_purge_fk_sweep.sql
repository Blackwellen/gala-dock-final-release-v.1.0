-- Test-fixture purge, FK sweep (lane D, 2026-10-29). Same signature and guards as 202610294031 (admin_require 'workspaces' at aal2 +
-- reason, ≤ 50 workspaces, fixture_purge_refusals: ledger postings / non-test members, users_to_remove, fixture_purges + counts,
-- audit_events, dry run raises inside and rolls back). The dry run of 2026-10-29 failed on 27 workspaces with
-- ticket_pass_components_component_tier_id_fkey (RESTRICT): a RESTRICT child inside the event cascade can be reached after its parent.
-- Swept every RESTRICT / NO ACTION FK into a table the purge deletes (pg_constraint, cascade closure from workspaces + events):
--   RESTRICT, child inside the cascade → now removed explicitly before events: ticket_pass_components (pass tier in a fixture event),
--     registrations / form_responses (fixture event or fixture form), bar_selections, catering_selections, event_waivers,
--     waiver_signatures (fixture event or fixture template), event_parties (package_id → event_party_packages; their SET NULL children
--     exhibitor_booths / logistics_windows / parking_permits / room_allocations / transport_movements first), provider_jobs of the
--     fixture workspaces (build_item_id → build_items), tickets of fixture events (tier_id → ticket_tiers).
--   Already handled: booking_cancellations / booking_disputes / transactions / invoices / merch chain / resale allocations / transfers.
--   NO ACTION inside one statement (tickets.replaced_by, promoter_sales → promoter_payouts, resale_payouts → checkout_orders): checked at
--     statement end, fine. ledger_transactions (NO ACTION, outside the cascade): covered by the ledger refusal guard.
--   New today: event_getting_there, pass_entitlements, access_passes cascade / set null; party logos and public_settings add no FK.

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
    -- 4086 (FK sweep): RESTRICT children inside the event / workspace cascade whose parent can be removed first in the same cascade.
    -- Removed explicitly, scoped to the fixtures' own events and workspaces. A row in a NON-fixture tenant that references fixture
    -- rows still blocks the purge (purge_blocked), as before.
    delete from public.ticket_pass_components pc using public.ticket_tiers t where pc.pass_tier_id = t.id and t.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
    delete from public.registrations r where r.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or r.form_id in (select f.id from public.registration_forms f where f.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)));
    delete from public.form_responses r where r.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or r.form_id in (select f.id from public.event_forms f where f.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)));
    delete from public.bar_selections s where s.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or s.bar_package_id in (select b.id from public.bar_packages b where b.workspace_id = any(p_workspaces));
    delete from public.catering_selections s where s.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or s.menu_id in (select m.id from public.menus m where m.workspace_id = any(p_workspaces));
    delete from public.event_waivers x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or x.waiver_template_id in (select t.id from public.waiver_templates t where t.workspace_id = any(p_workspaces));
    delete from public.waiver_signatures x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or x.waiver_template_id in (select t.id from public.waiver_templates t where t.workspace_id = any(p_workspaces));
    -- parties go before events (package_id → event_party_packages is RESTRICT); first their fixture-event SET NULL children, which would
    -- otherwise be nulled into check violations (exhibitor_booths_check) before the event cascade removes them anyway.
    delete from public.exhibitor_booths x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
    delete from public.logistics_windows x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
    delete from public.parking_permits x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
    delete from public.room_allocations x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
    delete from public.transport_movements x where x.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
    delete from public.event_parties p where p.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces)) or p.workspace_id = any(p_workspaces);
    delete from public.provider_jobs j where j.workspace_id = any(p_workspaces);
    delete from public.tickets t where t.event_id in (select e.id from public.events e where e.workspace_id = any(p_workspaces));
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
