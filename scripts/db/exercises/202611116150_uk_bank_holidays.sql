-- Exercise for 202611116150 (rolled back): Fri 24 Dec 2027 + 5 business days skips 25–28 Dec (weekend + Christmas and Boxing Day
-- substitutes) and Mon 3 Jan 2028 (New Year substitute) → Wed 5 Jan 2028. Scotland also skips 4 Jan 2028 (2 January substitute).
do $$
declare d date;
begin
  d := (public.dec107_add_business_days('2027-12-24 20:00+00', 5) at time zone 'Europe/London')::date;
  if d <> '2028-01-05' then raise exception 'E&W got %', d; end if;
  d := (public.dec107_add_business_days('2026-11-13 18:00+00', 5) at time zone 'Europe/London')::date;
  if d <> '2026-11-20' then raise exception 'plain week got %', d; end if;
  d := (public.dec107_add_business_days_in('2027-12-24 20:00+00', 5, 'scotland') at time zone 'Europe/London')::date;
  raise exception 'EXERCISE_OK bank holidays (E&W 2028-01-05, Scotland %)', d;
end $$;
