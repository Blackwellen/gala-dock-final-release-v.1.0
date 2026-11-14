-- Q57 exercise: a held ticket can't be offered for transfer (and an unheld one still can); an unsupported business country makes the
-- workspace's listings and packages enquiry-only; anon reads public review columns but not user_id / moderated_by / moderation_reason.
-- Ends with EXERCISE_OK (rolled back).
do $$
declare tk public.tickets; ok boolean; tid uuid; ws uuid; lst uuid; n integer;
begin
  select t.* into tk from public.tickets t join public.events e on e.id = t.event_id
   where t.status = 'valid' and t.dispute_hold_at is null and t.holder_id is not null and coalesce((e.settings->>'transfers')::boolean, true)
   limit 1;
  if tk.id is null then raise exception 'no valid ticket to exercise'; end if;
  update public.tickets set dispute_hold_at = now(), dispute_hold_ref = 'dp_q57_exercise' where id = tk.id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', tk.holder_id, 'role', 'authenticated')::text, true); set local role authenticated;
  begin perform public.offer_ticket_transfer(tk.id, 'q57-exercise@example.invalid', 'Q57', repeat('a', 64)); ok := false;
  exception when others then ok := sqlerrm = 'ticket_on_hold'; end;
  if not ok then raise exception 'held ticket offered for transfer'; end if;
  reset role;
  update public.tickets set dispute_hold_at = null, dispute_hold_ref = null where id = tk.id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', tk.holder_id, 'role', 'authenticated')::text, true); set local role authenticated;
  tid := public.offer_ticket_transfer(tk.id, 'q57-exercise@example.invalid', 'Q57', repeat('b', 64));
  if tid is null then raise exception 'unheld ticket transfer offer failed'; end if;
  reset role;

  select l.workspace_id, l.id into ws, lst from public.listings l where l.booking_mode <> 'enquiry' and l.workspace_id is not null limit 1;
  if ws is null then raise exception 'no request/instant listing to exercise'; end if;
  update public.workspaces set settings = jsonb_set(coalesce(settings, '{}'), '{note_q57}', '"x"') where id = ws;   -- unrelated settings change: untouched
  if (select booking_mode from public.listings where id = lst) = 'enquiry' then raise exception 'unrelated settings change flipped the listing'; end if;
  update public.workspaces set settings = jsonb_set(coalesce(settings, '{}'), '{country}', '"KP"') - 'organisation' - 'business' where id = ws;
  if public.workspace_payments_country_ok(ws) then raise exception 'KP should be unsupported'; end if;
  select count(*) into n from public.listings where workspace_id = ws and (booking_mode <> 'enquiry' or instant_book);
  if n <> 0 then raise exception 'listings not enquiry-only after unsupported country: %', n; end if;
  select count(*) into n from public.packages where workspace_id = ws and booking_mode <> 'enquiry';
  if n <> 0 then raise exception 'packages not enquiry-only after unsupported country: %', n; end if;

  set local role anon;
  perform id, rating, body, build_item_id, provider_response, created_at from public.reviews limit 1;
  begin perform user_id from public.reviews limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can still read reviews.user_id'; end if;
  begin perform moderated_by from public.reviews limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can still read reviews.moderated_by'; end if;
  reset role;

  raise exception 'EXERCISE_OK Q57 marketplace';
end $$;
