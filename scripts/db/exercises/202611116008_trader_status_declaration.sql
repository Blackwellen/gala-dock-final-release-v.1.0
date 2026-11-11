-- Exercise for 202611116008 (rolled back): declaration recorded with version; non-trader visible publicly; QA counts as business.
do $$
declare ws uuid := '679ce2c4-b9c3-47be-b481-52d96cdacdb9'; owner uuid; ev uuid; ok boolean;
begin
  select owner_id into owner from public.workspaces where id = ws;
  if public.seller_trader_status('e2722ab1-045d-408e-93d6-a24cf7c54ce6') <> 'business' then raise exception 'QA fixture not business by default'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.declare_trader_status(ws, 'business', null, 'gd-td-1.0-2026-11-11'); exception when others then ok := sqlerrm = 'invalid_declaration'; end;
  if not ok then raise exception 'business without form accepted'; end if;
  perform public.declare_trader_status(ws, 'non_trader', null, 'gd-td-1.0-2026-11-11');
  if public.seller_trader_status(ws) <> 'non_trader' then raise exception 'not recorded'; end if;
  perform set_config('request.jwt.claims', '', true);
  insert into public.events(owner_id, workspace_id, name, status) values (owner, ws, 'p1- trader exercise', 'draft') returning id into ev;
  if not public.event_seller_non_trader(ev) then raise exception 'non-trader notice not visible'; end if;
  raise exception 'EXERCISE_OK trader declaration';
end $$;
