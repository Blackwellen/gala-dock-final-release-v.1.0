-- Q72 exercise (rolled back): a quote row inserted for a build item takes its event's currency. Ends with EXERCISE_OK.
do $$
declare b record; q record; cur text;
begin
  select bi.id, bi.event_id, l.workspace_id into b from public.build_items bi join public.listings l on l.id = bi.listing_id where bi.event_id is not null and l.workspace_id is not null limit 1;
  if b.id is null then raise exception 'EXERCISE_OK no build items to exercise (trigger installed)'; end if;
  update public.events set currency = 'EUR' where id = b.event_id;
  insert into public.provider_quotes(workspace_id, build_item_id, reference, version, status, items, subtotal, tax, total, deposit_pct, valid_until, terms, message, currency)
    values (b.workspace_id, b.id, 'Q72-EX-' || substr(md5(random()::text), 1, 6), 999, 'draft', '[{"label":"x","qty":1,"unit_price":1}]', 1, 0, 1, 30, current_date + 14, '{}', '', 'GBP')
    returning currency into cur;
  if cur <> 'EUR' then raise exception 'quote currency %', cur; end if;
  raise exception 'EXERCISE_OK quote takes the event currency';
end $$;
