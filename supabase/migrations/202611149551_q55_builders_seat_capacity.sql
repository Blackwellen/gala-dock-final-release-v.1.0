-- Q55 builders bug hunt: seat capacity counted the way the seat inventory is synced.
-- map_el_seats (used by map_validate_core for capacity / density checks) subtracted "blocked" flags for seat blocks but not for tables,
-- so a table with killed chairs still counted every chair while the editor's sellable totals, the published event_seats
-- (status 'blocked') and the buyer's seat picker did not. Tables now subtract their blocked chairs too. Same signature and grants
-- (create or replace), immutable, no data change. Stale flag keys are pruned client-side before every save (pruneSeatMaps), so the
-- flag count only covers seats that exist.
create or replace function public.map_el_seats(e jsonb)
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when jsonb_typeof(e->'seating') = 'object' and jsonb_typeof(e->'seating'->'rows') = 'number' and jsonb_typeof(e->'seating'->'cols') = 'number' then
      greatest((e->'seating'->>'rows')::int * (e->'seating'->>'cols')::int
        - coalesce((select count(*)::int from jsonb_each_text(case when jsonb_typeof(e->'seatFlags') = 'object' then e->'seatFlags' else '{}' end) f where f.value = 'blocked'), 0), 0)
    when jsonb_typeof(e->'table') = 'object' and jsonb_typeof(e->'table'->'seats') = 'number' then
      greatest((e->'table'->>'seats')::int
        - coalesce((select count(*)::int from jsonb_each_text(case when jsonb_typeof(e->'seatFlags') = 'object' then e->'seatFlags' else '{}' end) f where f.value = 'blocked'), 0), 0)
    else 0 end
$function$;
