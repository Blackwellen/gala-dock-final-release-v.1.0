-- Q45 performance (lane C, 2026-10-29): calendar_window validated its timezone with a scan of pg_catalog.pg_timezone_names, which
-- reads the whole tz database on every call: measured 188 ms on a cold connection and 15–25 ms per call warm (200-call loops),
-- the whole of calendar_events' (anon) time in pg_stat_statements.
-- timezone_valid(tz) accepts exactly the same names as before (pg_timezone_names), cheaply:
--   1. public.ref_timezones primary-key hit (the 18 offered zones, Europe/London default) → valid, no catalogue read;
--   2. otherwise an AT TIME ZONE probe in an exception block: anything Postgres cannot resolve is rejected without the scan;
--   3. a name Postgres resolves but that is not in ref_timezones (POSIX strings such as 'UTC+3' resolve too) must be a
--      pg_timezone_names entry: checked against a snapshot of the catalogue names, then the catalogue itself, so the accepted set
--      is unchanged.
-- calendar_window: same signature, STABLE, invoker rights and search_path; only the validity check changes.
-- Rollback: re-apply the previous calendar_window body (check `exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz)`);
-- timezone_valid can stay (unused) or be dropped.

-- The catalogue snapshot is taken when this file is applied (598 names on Postgres today) and embedded as a constant array, so the
-- function needs no table (no new RLS surface) and stays exact: a name a later Postgres upgrade adds falls through to step 3, and
-- a name an upgrade removes fails the probe in step 2 first.
do $mig$
begin
  execute format($fn$
create or replace function public.timezone_valid(p_tz text)
 returns boolean
 language plpgsql
 stable
 set search_path to ''
as $body$
begin
  if p_tz is null or p_tz = '' then return false; end if;
  if exists (select 1 from public.ref_timezones z where z.tz = p_tz) then return true; end if;
  begin
    perform now() at time zone p_tz;
  exception when data_exception then
    return false;
  end;
  if p_tz = any (%L::text[]) then return true; end if;
  return exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz);
end $body$
$fn$, (select array_agg(name order by name) from pg_catalog.pg_timezone_names)::text);
end $mig$;

-- calendar_window runs with the caller's rights (anon on the public calendar), so the helper must be executable by the client roles.
grant execute on function public.timezone_valid(text) to anon, authenticated, service_role;
comment on function public.timezone_valid(text) is 'True when p_tz is a pg_timezone_names zone: ref_timezones hit, AT TIME ZONE probe, then a catalogue snapshot taken at migration time; the live catalogue scan only runs for names added by a later Postgres upgrade (Q45).';

create or replace function public.calendar_window(p_range text, p_tz text default 'Europe/London'::text, p_anchor date default null::date)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare tz text := coalesce(nullif(p_tz, ''), 'Europe/London'); d date; f timestamp; t timestamp; dow int;
begin
  if not public.timezone_valid(tz) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  d := coalesce(p_anchor, (now() at time zone tz)::date);
  dow := extract(isodow from d)::int;   -- 1 Mon … 7 Sun
  case p_range
    when 'today' then f := d::timestamp; t := (d + 1)::timestamp;
    when 'weekend' then
      f := (d + (5 - dow))::timestamp + interval '17 hours';   -- this week's Friday (Sat/Sun look back to it)
      t := (d + (8 - dow))::timestamp;                          -- following Monday 00:00
    when 'month' then f := date_trunc('month', d::timestamp); t := date_trunc('month', d::timestamp) + interval '1 month';
    else raise exception 'invalid_range' using errcode = '22023';
  end case;
  return jsonb_build_object('range', p_range, 'timezone', tz, 'from', f at time zone tz, 'to', t at time zone tz, 'local_from', f, 'local_to', t);
end $function$;
