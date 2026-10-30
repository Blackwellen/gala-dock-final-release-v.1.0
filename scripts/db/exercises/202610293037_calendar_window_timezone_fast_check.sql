-- Dry-run exercise for 202610293037 (always rolled back by migrate.mjs).
--  1. timezone_valid(tz) == old predicate (exists in pg_timezone_names) for every catalogue name and for edge cases
--     (case variants, POSIX/offset strings, abbreviations, garbage, injection-shaped strings).
--  2. calendar_window output identical to the previous body (kept here as pg_temp.old_window) for every ref zone × range × anchors.
--  3. Called as anon and as the client role (authenticated with real claims): works; invalid zone still raises 22023.
--  4. Timing, new vs old, 200 calls each (reported in EXERCISE_OK).
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

create function pg_temp.old_window(p_range text, p_tz text default 'Europe/London', p_anchor date default null) returns jsonb language plpgsql stable set search_path to '' as $f$
declare tz text := coalesce(nullif(p_tz, ''), 'Europe/London'); d date; f timestamp; t timestamp; dow int;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  d := coalesce(p_anchor, (now() at time zone tz)::date);
  dow := extract(isodow from d)::int;
  case p_range
    when 'today' then f := d::timestamp; t := (d + 1)::timestamp;
    when 'weekend' then f := (d + (5 - dow))::timestamp + interval '17 hours'; t := (d + (8 - dow))::timestamp;
    when 'month' then f := date_trunc('month', d::timestamp); t := date_trunc('month', d::timestamp) + interval '1 month';
    else raise exception 'invalid_range' using errcode = '22023';
  end case;
  return jsonb_build_object('range', p_range, 'timezone', tz, 'from', f at time zone tz, 'to', t at time zone tz, 'local_from', f, 'local_to', t);
end $f$;

do $$
declare n int; bad text; z text; r text; a date; t0 timestamptz; j jsonb; new_ms numeric; old_ms numeric; cold_ms numeric; msg text; u uuid;
begin
  -- 1. Equivalence.
  select count(*) into n from pg_catalog.pg_timezone_names where not public.timezone_valid(name);
  if n <> 0 then raise exception 'timezone_valid rejected % catalogue names', n; end if;
  select string_agg(x, ', ') into bad from unnest(array['', 'europe/london', 'EUROPE/LONDON', 'Mars/Olympus', 'UTC+3', '+05:00', 'EST', 'EST5EDT', 'GMT', 'UTC', 'Z',
      'posixrules', 'Europe/London ', ' Europe/London', 'Europe/London''; select 1; --', 'America/Argentina/Buenos_Aires', 'Etc/GMT+12', 'localtime', repeat('x', 300)]) x
    where public.timezone_valid(x) is distinct from exists (select 1 from pg_catalog.pg_timezone_names p where p.name = x);
  if bad is not null then raise exception 'timezone_valid differs from old predicate for: %', bad; end if;
  if public.timezone_valid(null) then raise exception 'null accepted'; end if;
  insert into _ex values ('equivalence', (select count(*) from pg_catalog.pg_timezone_names)::text || ' catalogue names + 19 edge cases');

  -- 2. Output parity.
  n := 0;
  for z in select tz from public.ref_timezones union all select unnest(array['Pacific/Chatham', 'Asia/Kathmandu', 'UTC', 'Etc/GMT-14']) loop
    foreach r in array array['today', 'weekend', 'month'] loop
      foreach a in array array[null::date, date '2026-03-29', date '2026-10-25', date '2026-10-31', date '2026-11-01', date '2024-02-29'] loop
        if public.calendar_window(r, z, a) is distinct from pg_temp.old_window(r, z, a) then raise exception 'calendar_window differs: % % %', r, z, a; end if;
        n := n + 1;
      end loop;
    end loop;
  end loop;
  if public.calendar_window('month', '') is distinct from pg_temp.old_window('month', '') then raise exception 'empty tz default differs'; end if;
  if public.calendar_window('month', null) is distinct from pg_temp.old_window('month', null) then raise exception 'null tz default differs'; end if;
  insert into _ex values ('parity', n::text || ' (zone, range, anchor) results identical');

  -- 3. Client roles.
  set local role anon;
  j := public.calendar_window('month', 'Europe/London');
  if j->>'timezone' <> 'Europe/London' then raise exception 'anon month window wrong'; end if;
  begin perform public.calendar_window('month', 'Mars/Olympus'); msg := 'none'; exception when sqlstate '22023' then msg := sqlerrm; end;
  if msg <> 'invalid_timezone' then raise exception 'anon invalid tz said %', msg; end if;
  begin perform public.calendar_window('fortnight', 'Europe/London'); msg := 'none'; exception when sqlstate '22023' then msg := sqlerrm; end;
  if msg <> 'invalid_range' then raise exception 'anon invalid range said %', msg; end if;
  reset role;
  select id into u from auth.users order by created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.calendar_window('weekend', 'America/New_York');
  if j->>'range' <> 'weekend' then raise exception 'authenticated weekend window wrong'; end if;
  begin perform public.calendar_window('today', 'europe/london'); msg := 'none'; exception when sqlstate '22023' then msg := sqlerrm; end;
  if msg <> 'invalid_timezone' then raise exception 'authenticated case-variant tz said %', msg; end if;
  reset role;
  insert into _ex values ('anon', 'month ok; invalid tz/range 22023'), ('authenticated', 'weekend ok; case-variant tz 22023');

  -- 4. Timing (same connection; old first so the new path cannot benefit from a catalogue cache it never reads).
  t0 := clock_timestamp(); for i in 1..200 loop j := pg_temp.old_window('month', 'Europe/London'); end loop;
  old_ms := round((extract(epoch from clock_timestamp() - t0) * 1000 / 200)::numeric, 3);
  t0 := clock_timestamp(); for i in 1..200 loop j := public.calendar_window('month', 'Europe/London'); end loop;
  new_ms := round((extract(epoch from clock_timestamp() - t0) * 1000 / 200)::numeric, 3);
  t0 := clock_timestamp(); for i in 1..200 loop j := public.calendar_window('month', 'Pacific/Chatham'); end loop;
  cold_ms := round((extract(epoch from clock_timestamp() - t0) * 1000 / 200)::numeric, 3);
  insert into _ex values ('ms_per_call', format('old %s, new ref-zone %s, new non-ref zone %s', old_ms, new_ms, cold_ms));
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
