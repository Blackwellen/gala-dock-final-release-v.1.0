-- Dry-run exercise for 202610294086 (always rolled back by migrate.mjs — nothing is purged).
--   as the platform admin (authenticated, aal2 claims — the client role the command runs under):
--   * dry run over the 27 workspaces that failed on 2026-10-29 with ticket_pass_components_component_tier_id_fkey → no purge_blocked
--   * a REAL purge (p_dry_run = false) of one of them that has pass components, inside this rolled-back transaction → its pass
--     components, tickets, tiers, events and the workspace are gone; fixture_purges row + audit event written
--   * guards unchanged: aal1 → refused; < 5 char reason → refused; a ledger-protected fixture → purge_refused
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;

do $$
declare adm uuid := (select id from auth.users where email = 'admin.demo@example.com');
  sid text := (select s.id::text from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'admin.demo@example.com' and (s.not_after is null or s.not_after > now()) order by s.created_at desc limit 1);
  ids uuid[] := '{6c94eba9-8eae-4b49-a5b7-ea2ad79f9230,b9a05448-8ee9-44e7-bd84-5267ee1f68f6,c3eb3bae-507d-48ad-9981-29f16cacbdd3,aa14c506-7807-4fa0-a6d5-0317efcbde46,6fceed77-2aa3-480c-9a9f-a68331ae1822,c24c29e8-8fe6-4770-9b7f-21c95f09c2b4,a4849ebb-57fe-4ea8-9956-c113bda6bc0f,2291a8eb-0884-48c7-8acb-1efcabedb3ee,96fd0190-0b10-4e65-aad8-f9d19130ac71,dc68a5f8-5992-4088-982c-c7533ec37a7f,0e28f88c-3534-467a-a2ca-2c9ca0d32a16,dd11affe-8524-4215-9e6d-741fe149d6b0,dbb633af-cb48-4226-90d2-37899f8475f7,3c90ad37-d03d-4803-a2ea-267cba392c4d,2d5a51fc-efce-4ac3-afad-ed5d81ede32f,980d2d0c-09ec-46fb-8d12-8a72afc74d1f,b52db009-c767-46c8-b90b-59cc98b877dd,e3ea69c3-8d0d-469d-b3d7-668befaed788,ac9af75d-4a18-4d4f-970f-90d0273e780b,caa09a8a-0ee4-403a-bcbb-77ba1909e3fc,3995d9ef-1f62-48ec-9077-47cefad3805a,81b5d8fd-e403-4adb-b32f-c2382495b940,0797b352-74bf-4ed3-8cdd-5c4451d09cc7,ba281272-b144-4b97-9dca-842b8378033e,2d172911-04e0-47f0-a5ba-52b5847ce8e4,c44ddb6f-6f47-4ac9-a7ca-e4e89678e1b8,b83a0a6e-ba24-4241-972f-11fdfd5c6554}'::uuid[]; one uuid; j jsonb; n int; ok boolean; ledger_ws uuid; msg text;
begin
  select w into one from unnest(ids) w where exists (select 1 from public.ticket_pass_components pc join public.ticket_tiers t on t.id = pc.pass_tier_id join public.events e on e.id = t.event_id where e.workspace_id = w) limit 1;
  if one is null then raise exception 'exercise: no blocked fixture with pass components'; end if;
  if sid is null then   -- no live session for the demo admin: create one inside this rolled-back transaction (aal2, as after a TOTP sign-in)
    sid := gen_random_uuid()::text;
    insert into auth.sessions(id, user_id, created_at, updated_at, aal) values (sid::uuid, adm, now(), now(), 'aal2');
  end if;

  select f.id into ledger_ws from public.workspaces f where f.is_test_fixture and cardinality(public.fixture_purge_refusals(f.id)) > 0 limit 1;
  -- guards: aal1 refused
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', sid)::text, true);
  set local role authenticated;
  ok := false; begin perform public.admin_purge_test_workspaces(array[one], 'EX4086 guard check', true); exception when sqlstate '42501' then ok := true; end;
  reset role;
  if not ok then raise exception 'guard: aal1 not refused'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', sid)::text, true);
  set local role authenticated;
  ok := false; begin perform public.admin_purge_test_workspaces(array[one], 'x', true); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'guard: short reason not refused'; end if;
  if ledger_ws is not null then
    ok := false; begin perform public.admin_purge_test_workspaces(array[ledger_ws], 'EX4086 guard check', true); exception when sqlstate '42501' then ok := sqlerrm like 'purge_refused%'; end;
    if not ok then raise exception 'guard: refused fixture not refused'; end if;
  end if;
  insert into _ex values ('guards', 'aal1, short reason, refusal unchanged');

  -- dry run over all 27
  j := public.admin_purge_test_workspaces(ids, 'EX4086 dry run of the 27 blocked fixtures', true);
  if (j->>'dry_run')::boolean is distinct from true then raise exception 'dry run flag'; end if;
  if coalesce((j->'tables'->'ticket_pass_components'->>'deleted')::int, 0) = 0 then raise exception 'dry run: no pass components removed'; end if;
  insert into _ex values ('dry_run_27', 'ok; events deleted=' || coalesce(j->'tables'->'events'->>'deleted', '0') || ', pass components=' || (j->'tables'->'ticket_pass_components'->>'deleted') || ', users=' || jsonb_array_length(j->'users_to_remove'));

  -- real purge of one (rolled back with the transaction)
  j := public.admin_purge_test_workspaces(array[one], 'EX4086 real purge inside the rolled-back exercise', false);
  reset role;
  if exists (select 1 from public.workspaces where id = one) or exists (select 1 from public.events where workspace_id = one) then raise exception 'real purge: rows remain'; end if;
  select count(*) into n from public.ticket_pass_components pc where not exists (select 1 from public.ticket_tiers t where t.id = pc.pass_tier_id);
  if n <> 0 then raise exception 'real purge: orphan pass components'; end if;
  if not exists (select 1 from public.fixture_purges where id = (j->>'purge_id')::uuid and not dry_run) then raise exception 'real purge: no fixture_purges row'; end if;
  if not exists (select 1 from public.audit_events where event = 'admin.test_fixtures_purged' and metadata->>'purge_id' = j->>'purge_id') then raise exception 'real purge: no audit event'; end if;
  insert into _ex values ('real_purge_one', one::text || ' gone incl. ' || coalesce(j->'tables'->'ticket_pass_components'->>'deleted', '0') || ' pass components; audited');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
