-- Q76 exercise (rolled back): the catalogue is not readable by anon/authenticated; definer pricing still reads it. Ends with EXERCISE_OK.
do $$
begin
  if has_table_privilege('anon', 'public.ref_fee_catalogue', 'select') or has_table_privilege('authenticated', 'public.ref_fee_catalogue', 'select') then raise exception 'still readable'; end if;
  if public.fee_fixed_minor_in('ticket_fixed', 100, 'EUR') <> 120 then raise exception 'definer lookup broken'; end if;
  raise exception 'EXERCISE_OK q76 fee catalogue server-only';
end $$;
