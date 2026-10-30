-- Q14 Event Core 10 — fix: event_dependency_graph's critical-path CTE column 'nodes' collided with the PL/pgSQL variable of the same
-- name (ambiguous reference at runtime). Same function with renamed CTE columns.

create or replace function public.event_dependency_graph(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare edges jsonb; nodes jsonb; blocked jsonb; path jsonb;
begin
  if not public.can_access_event(p_event) then raise exception 'not_authorized' using errcode = '42501'; end if;
  with e as (
    select d.*, public.event_dependency_node(d.dependent_kind, d.dependent_id) dn,
           case when d.prerequisite_kind = 'approval' then 'approval:' || d.id else public.event_dependency_node(d.prerequisite_kind, d.prerequisite_id) end pn,
           public.event_dependency_met(d.event_id, d.prerequisite_kind, d.prerequisite_id, d.id) met
      from public.event_dependencies d where d.event_id = p_event)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'dependent', dn, 'prerequisite', pn, 'hard', hard, 'lag_minutes', lag_minutes, 'met', met,
           'note', note, 'approval_status', approval_status, 'approval_expires_at', approval_expires_at) order by created_at), '[]') into edges from e;

  with keys as (
    select distinct k from (select x->>'dependent' k from jsonb_array_elements(edges) x union all select x->>'prerequisite' from jsonb_array_elements(edges) x) z),
  lab as (
    select k, split_part(k, ':', 1) kind, nullif(split_part(k, ':', 2), '') ref from keys)
  select coalesce(jsonb_agg(jsonb_build_object('key', l.k, 'kind', l.kind, 'id', l.ref,
      'label', case l.kind when 'task' then (select t.title from public.tasks t where t.id::text = l.ref)
                           when 'ticket_tier' then (select t.name from public.ticket_tiers t where t.id::text = l.ref)
                           when 'booking' then (select b.title from public.build_items b where b.id::text = l.ref)
                           when 'payment' then (select 'Payment: ' || b.title from public.build_items b where b.id::text = l.ref)
                           when 'team' then (select 'Shift: ' || s.role from public.shifts s where s.id::text = l.ref)
                           when 'venue' then 'Venue confirmed' when 'compliance' then 'Provider compliance' when 'approval' then 'Approval' end,
      'due_at', case l.kind when 'task' then (select t.due_at from public.tasks t where t.id::text = l.ref) end,
      'met', case when l.kind = 'approval' then public.event_dependency_met(p_event, 'approval', null, l.ref::uuid)
                  else public.event_dependency_met(p_event, l.kind, l.ref::uuid) end)), '[]') into nodes from lab l;

  select coalesce(jsonb_agg(jsonb_build_object('key', d, 'blocked_by', bl)), '[]') into blocked from (
    select x->>'dependent' d, jsonb_agg(x->>'prerequisite') bl from jsonb_array_elements(edges) x
     where (x->>'hard')::boolean and not (x->>'met')::boolean group by 1) z;

  with recursive ue as (
    select x->>'dependent' d, x->>'prerequisite' p, (x->>'lag_minutes')::int lag from jsonb_array_elements(edges) x where (x->>'hard')::boolean and not (x->>'met')::boolean),
  chain(head, tail, chain_nodes, chain_lag) as (
    select ue.d, ue.p, array[ue.d, ue.p], ue.lag from ue
    union all
    select c.head, u.p, c.chain_nodes || u.p, c.chain_lag + u.lag from chain c join ue u on u.d = c.tail where not u.p = any(c.chain_nodes) and array_length(c.chain_nodes, 1) < 60)
  select to_jsonb(c.chain_nodes) into path from chain c order by array_length(c.chain_nodes, 1) desc, c.chain_lag desc, c.head limit 1;

  return jsonb_build_object('nodes', nodes, 'edges', edges, 'blocked', blocked, 'critical_path', coalesce(path, '[]'::jsonb));
end $$;
