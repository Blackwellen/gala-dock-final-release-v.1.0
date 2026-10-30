-- Dry-run exercise for 202610295020 (rolled back). The spelling exists once; anon and authenticated resolve "Webinar (online)" (any case /
-- spacing) to webinar exactly as the TypeScript catalog does; re-running the insert is a no-op (idempotent).
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to anon, authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.taxonomy_spellings where taxonomy = 'event_type' and spelling = 'webinar (online)' and key = 'webinar';
  if n <> 1 then raise exception 'spelling rows: %', n; end if;
  insert into public.taxonomy_spellings(taxonomy, spelling, key) values ('event_type', 'webinar (online)', 'webinar') on conflict (taxonomy, spelling) do nothing;
  select count(*) into n from public.taxonomy_spellings where taxonomy = 'event_type' and spelling = 'webinar (online)';
  if n <> 1 then raise exception 'not idempotent'; end if;
  set local role anon;
  if public.taxonomy_resolve('event_type', 'Webinar (online)') is distinct from 'webinar' then raise exception 'anon resolve: %', public.taxonomy_resolve('event_type', 'Webinar (online)'); end if;
  if public.taxonomy_resolve('event_type', '  webinar (ONLINE) ') is distinct from 'webinar' then raise exception 'anon resolve (case/space)'; end if;
  reset role;
  set local role authenticated;
  if public.taxonomy_resolve('event_type', 'Webinar (online)') is distinct from 'webinar' then raise exception 'authenticated resolve'; end if;
  reset role;
  insert into _ex values ('spelling', 'present once; idempotent; anon + authenticated resolve to webinar');
end $$;
do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ') from _ex); end $$;
