-- Dry-run exercise for 202610293035 (always rolled back): the three lookups now use the new indexes, and the client-role write
-- paths over both tables (an organiser admitting a ticket, which writes tickets + check_ins) still work.
create temp table _ex(k text, v text) on commit drop;
grant all on _ex to public;

do $$
declare ref text; ev uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; l text; p text; t0 timestamptz;
begin
  select order_ref into ref from public.tickets where order_ref is not null limit 1;
  p := ''; for l in execute format('explain (analyze, format text) select * from public.tickets where order_ref = %L', ref) loop p := p || l || ' '; end loop;
  if p !~ 'tickets_order_ref_idx' then raise exception 'order_ref lookup not indexed: %', left(p, 200); end if;
  insert into _ex values ('order_ref_plan', substring(p from 'Execution Time: [0-9.]+ ms'));
  set local enable_seqscan = off;   -- tiny email selectivity on test data: prove the index is usable
  p := ''; for l in execute 'explain (format text) select count(*) from public.tickets where lower(attendee_email) = ''x@example.com''' loop p := p || l || ' '; end loop;
  if p !~ 'tickets_attendee_email_idx' then raise exception 'email lookup cannot use index: %', left(p, 200); end if;
  p := ''; for l in execute format('explain (format text) select count(*) from public.check_ins where event_id = %L', ev) loop p := p || l || ' '; end loop;
  if p !~ 'check_ins_event_idx' then raise exception 'check_ins event lookup cannot use index: %', left(p, 200); end if;
  reset enable_seqscan;
  insert into _ex values ('email_index_usable', 'yes'), ('check_ins_event_index_usable', 'yes');
end $$;

-- Client role: the owner of the event admits a ticket (writes tickets + check_ins through scan_admission).
do $$
declare alex uuid; ev uuid := '392fdf17-4e5c-4473-987c-251dc0a97228'; tk record; r jsonb;
begin
  select owner_id into alex from public.workspaces where id = '75e6c471-8d5e-4b9f-b076-ff10cf209f01';
  select k.id, k.code into tk from public.tickets k where k.event_id = ev and k.status = 'valid' and k.checked_in_at is null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', alex, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', alex::text, true);
  set local role authenticated;
  r := public.scan_ticket(ev, tk.id, tk.code, null, null, 'q45-exercise', null, null);
  reset role;
  if not exists (select 1 from public.check_ins c where c.ticket_id = tk.id) then raise exception 'client scan wrote no check-in: %', r; end if;
  insert into _ex values ('client_scan_write', coalesce(r ->> 'result', r ->> 'status', 'ok'));
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
