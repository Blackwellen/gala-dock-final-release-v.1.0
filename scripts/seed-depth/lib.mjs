// Shared helpers for the Q38 depth seed (scripts/seed-depth-pass1.mjs). Runs SQL through the Supabase management API in ONE
// transaction per call. `as` impersonates a demo identity (request.jwt.claims) so the real commands run with their guards,
// state machines and audit trail. Never prints credentials or personal data.
export const lit = v => v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
export const json = v => `${lit(JSON.stringify(v))}::jsonb`;

export async function sql(query, { as } = {}) {
  let q = query;
  if (as) {
    const uid = `(select id from auth.users where email = ${lit(as)})`;
    q = `select set_config('request.jwt.claims', json_build_object('sub', ${uid}, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', ${uid}::text, true);\n${q}`;
  }
  let r, t;
  for (let attempt = 0; ; attempt++) {   // the management API throttles bursts (HTTP 429): back off and retry
    r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }), signal: AbortSignal.timeout(180_000) });
    t = await r.text();
    if (r.status !== 429 || attempt >= 8) break;
    await new Promise(res => setTimeout(res, 2000 * 2 ** Math.min(attempt, 4)));
  }
  if (!r.ok) throw new Error(`sql: HTTP ${r.status} ${t.replace(/\s+/g, " ").slice(0, 600)}`);
  return JSON.parse(t);
}

/**
 * Runs a module body (plpgsql statements) inside a DO block and returns the counters it recorded with `perform pg_temp._n('key', n)`.
 * The body may switch identity with `perform pg_temp._as('email')` (transaction-local claims) and returns to the service role with `perform pg_temp._as(null)`.
 */
export async function block(body) {
  const q = `create temp table if not exists _seed_out(k text primary key, n int not null default 0) on commit drop;
create or replace function pg_temp._n(p_k text, p_n int default 1) returns void language sql as $f$
  insert into _seed_out(k, n) values (p_k, p_n) on conflict (k) do update set n = _seed_out.n + excluded.n $f$;
create or replace function pg_temp._as(p_email text) returns void language plpgsql as $f$
declare u uuid := (select id from auth.users where email = p_email);
begin
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
end $f$;
create or replace function pg_temp._uid(p_email text) returns uuid language sql stable as $f$ select id from auth.users where email = p_email $f$;
create or replace function pg_temp._ev(p_slug text) returns uuid language sql stable as $f$ select id from public.events where slug = p_slug $f$;
do $seed$
declare r jsonb; v uuid; v2 uuid; n int; t text;
begin
${body}
end $seed$;
select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) as out from _seed_out;`;
  const rows = await sql(q);
  return rows[0]?.out ?? {};
}
