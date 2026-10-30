-- Q06 fix-up: the job worker runs with safe-update protection, which refuses an unqualified DELETE. search_rebuild now clears
-- only queue rows enqueued before the run started (rows queued during the rebuild are kept for the drain job). Body otherwise unchanged.
create or replace function public.search_rebuild(p_kind text default 'rebuild') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run_id bigint; started timestamptz := clock_timestamp(); n integer := 0; v_removed integer := 0; v_drift integer := 0; r record; was boolean; now_pub boolean; qual jsonb;
begin
  insert into public.search_index_runs(kind) values (p_kind) returning id into run_id;
  for r in select 'event'::text t, id from public.events union all select case when kind = 'venue' then 'venue' else 'service' end, id from public.listings
           union all select kind, id from public.workspaces where kind in ('organizer','provider') loop
    select is_public into was from public.search_documents where doc_type = r.t and doc_id = r.id;
    now_pub := public.search_index_document(r.t, r.id);
    if was is distinct from now_pub then v_drift := v_drift + 1; end if;
    n := n + 1;
  end loop;
  with gone as (delete from public.search_documents d where (d.doc_type = 'event' and not exists (select 1 from public.events e where e.id = d.doc_id))
      or (d.doc_type in ('venue','service') and not exists (select 1 from public.listings l where l.id = d.doc_id))
      or (d.doc_type in ('organizer','provider') and not exists (select 1 from public.workspaces w where w.id = d.doc_id)) returning 1)
  select count(*) into v_removed from gone;
  delete from public.search_index_queue where enqueued_at < started;
  select jsonb_build_object('by_flag', coalesce((select jsonb_object_agg(f, c) from (select unnest(quality) f, count(*) c from public.search_documents where is_public group by 1) x), '{}'::jsonb),
         'duplicate_titles', (select count(*) from (select lower(title), city from public.search_documents where is_public group by 1, 2 having count(*) > 1) y),
         'public_by_type', coalesce((select jsonb_object_agg(doc_type, c) from (select doc_type, count(*) c from public.search_documents where is_public group by 1) z), '{}'::jsonb)) into qual;
  update public.search_index_runs set finished_at = now(), indexed = n, removed = v_removed, drift = v_drift,
    public_docs = (select count(*) from public.search_documents where is_public), quality = qual where id = run_id;
  perform public.cache_bump('search:public');
  return jsonb_build_object('run', run_id, 'indexed', n, 'removed', v_removed, 'drift', v_drift, 'quality', qual);
end $$;
revoke all on function public.search_rebuild(text) from public, anon, authenticated;
grant execute on function public.search_rebuild(text) to service_role;
