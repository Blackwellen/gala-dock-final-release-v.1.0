-- Booking form dates/times are London wall-clock values, not UTC timestamps.
-- Reuse the canonical privacy-preserving availability query after conversion.
create or replace function public.listing_availability_local(p_listing uuid,p_date date,p_start time,p_end time) returns text
language plpgsql stable security invoker set search_path='' as $$
declare local_start timestamp;local_end timestamp;utc_start timestamptz;utc_end timestamptz;
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501';end if;
 if p_date is null or p_start is null or p_end is null then return 'unknown';end if;
 local_start:=p_date+p_start;
 local_end:=(p_date+case when p_end<=p_start then 1 else 0 end)+p_end;
 utc_start:=local_start at time zone 'Europe/London';utc_end:=local_end at time zone 'Europe/London';
 if utc_start at time zone 'Europe/London' <> local_start or utc_end at time zone 'Europe/London' <> local_end then
  raise exception 'invalid_local_time' using errcode='22023';
 end if;
 return public.listing_availability(p_listing,utc_start,utc_end);
end $$;
revoke all on function public.listing_availability_local(uuid,date,time,time) from public,anon;
grant execute on function public.listing_availability_local(uuid,date,time,time) to authenticated;
