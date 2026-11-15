do $$ declare uid uuid; lid uuid; bid uuid; begin
  select id into uid from auth.users where email = 'alex.thompson@example.com';
  select id into lid from public.listings where published limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  insert into public.build_items(event_id, listing_id, category, title, package, scope, status, role, sort, price_basis, quote)
    values ('efd4d0af-9437-4b0b-99cf-af7816fa2a62', lid, 'extras', 'W02 exercise', 'x', '', 'suggested', 'primary', 999, 'estimate', '{}'::jsonb) returning id into bid;
  update public.build_items set sort = 998 where id = bid;
  delete from public.build_items where id = bid;
  if public.fixture_purge_active() then raise exception 'fixture_purge_active must be false outside a purge'; end if;
  perform set_config('role', 'postgres', true);
end $$;
select 'exercise ok' as result;
