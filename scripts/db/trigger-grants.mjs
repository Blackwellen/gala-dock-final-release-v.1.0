// Q39 (d) migration-governance check for the 4031 class of bug: a SECURITY INVOKER trigger runs as the CLIENT, so every function it
// calls (directly, or through further SECURITY INVOKER functions) must be executable by `authenticated`. 4031's guard triggers
// called fixture_purge_active() with EXECUTE granted to service_role only, and every client write on 9 tables failed with 42501.
//
// Scope: user triggers on public tables that `authenticated` can INSERT / UPDATE / DELETE. Callees are found in the function source
// (`schema.name(` or bare `name(` resolved against public), followed through SECURITY INVOKER callees up to depth 4; SECURITY
// DEFINER callees run as their owner, so their own callees are not followed. Built-ins (pg_catalog) are not checked.
// A hit = (table, trigger function, calling function, callee) where `authenticated` lacks EXECUTE on the callee.
export const triggerGrantSql = (role = "authenticated") => `
with recursive trg as materialized (
  select distinct c.relname tbl, p.oid fn, p.proname tfn
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and n.nspname = 'public' and not p.prosecdef
    -- table- OR column-level grants (many tables give clients UPDATE on a few columns only)
    and (has_any_column_privilege('${role}', c.oid, 'INSERT') or has_any_column_privilege('${role}', c.oid, 'UPDATE') or has_table_privilege('${role}', c.oid, 'DELETE'))
), userfn as materialized (
  select p.oid, p.proname, n.nspname, p.prosecdef, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_toast'
), reach(root, fn, via, depth) as (
  select t.fn, t.fn, t.tfn, 0 from (select distinct fn, tfn from trg) t
  union
  select r.root, callee.oid, src.proname, r.depth + 1
  from reach r join userfn src on src.oid = r.fn
  cross join lateral (select distinct lower(coalesce(m[1], 'public')) sch, lower(m[2]) nm
                from regexp_matches(src.prosrc, '(?:^|[^a-zA-Z0-9_."])(?:([a-zA-Z_][a-zA-Z0-9_]*)\\.)?([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(', 'g') m) x
  join userfn callee on callee.proname = x.nm and callee.nspname = x.sch and callee.oid <> r.fn
  where r.depth < 4 and (r.depth = 0 or not src.prosecdef)
), calls as (
  select t.tbl, t.tfn, r.via, r.fn, r.depth from reach r join trg t on t.fn = r.root
)
select distinct c.tbl as "table", c.tfn as "trigger_function", c.via as "caller", n.nspname || '.' || p.proname as "callee",
  pg_get_function_identity_arguments(p.oid) as "args", p.prosecdef as "callee_security_definer"
from calls c join pg_proc p on p.oid = c.fn join pg_namespace n on n.oid = p.pronamespace
where c.depth > 0 and not has_function_privilege('${role}', p.oid, 'EXECUTE')
order by 1, 2, 4`;

// Coverage numbers for the report (how much the check actually looked at).
export const triggerGrantCoverageSql = (role = "authenticated") => triggerGrantSql(role)
  .replace(/select distinct c\.tbl as "table"[\s\S]*$/, `select count(distinct c.tbl)::int as tables, count(distinct c.tfn)::int as trigger_functions,
  count(distinct c.fn) filter (where c.depth > 0)::int as callees from calls c`);
