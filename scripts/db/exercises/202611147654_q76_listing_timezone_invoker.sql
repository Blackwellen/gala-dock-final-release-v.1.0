-- Q76 exercise (rolled back): listing_timezone is an invoker; the definer calendar still resolves the zone. Ends with EXERCISE_OK.
do $$
declare lid uuid; j jsonb;
begin
  if (select prosecdef from pg_proc where oid = 'public.listing_timezone(uuid)'::regprocedure) then raise exception 'still security definer'; end if;
  select id into lid from public.listings where published and paused_at is null order by created_at limit 1;
  if lid is not null and public.listing_timezone(lid) is null then raise exception 'no zone'; end if;
  if public.listing_timezone(gen_random_uuid()) <> 'Europe/London' then raise exception 'fallback'; end if;
  raise exception 'EXERCISE_OK q76 listing_timezone invoker';
end $$;
