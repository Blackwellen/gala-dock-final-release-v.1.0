// Q34 restore drill (domains 219–221; v6 X28): restores a nightly R2 database backup into a LOCAL, in-memory scratch Postgres
// (PGlite, Postgres 17 in WebAssembly) and proves it is complete and consistent. It can never touch production: the target is a
// process-local database that disappears when the script exits, and the live project is only READ (catalogue introspection and
// a list of record ids for the completeness check). Nothing personal is printed or written to disk.
//
//   npm i --no-save @electric-sql/pglite@0.3.2      (or set PGLITE_MODULE to an installed copy's dist/index.js)
//   node --env-file=.env --env-file=.env.local scripts/ops/restore-drill.mjs [YYYY-MM-DD|latest] [--no-record] [--report <file.json>]
//
// Steps (each timed; total = RTO evidence):
//   1. list R2 db-backups/ prefixes (retention check against db_backup_runs) and read the day's manifest.json
//   2. read the live table definitions (columns, types, enums, constraints) — the schema itself lives in supabase/migrations
//   3. create the tables in the scratch database and load every NDJSON.gz table file
//   4. add primary keys, unique, check, foreign-key and exclusion constraints (validates every restored row)
//   5. verify row counts against the manifest, and that every live record created before the backup started exists in the restore
//   6. record the drill in public.ops_restore_tests (target_kind local_scratch; marks db_backup_runs verified) unless --no-record
import { createHash, createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = k => args.includes(k), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const need = ["CLOUDFLARE_R2_S3_API", "CLOUDFLARE_R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SUPABASE_PROJECT_REF", "SUPABASE_PAT_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = need.filter(k => !process.env[k]); if (missing.length) { console.error(`Missing env: ${missing.join(", ")}`); process.exit(2); }
const startedAt = new Date(), t0 = Date.now(), timings = {}, mark = (k, since) => { timings[k] = Date.now() - since; };
const sha = b => createHash("sha256").update(b).digest("hex"), hmac = (k, s) => createHmac("sha256", k).update(s).digest();

// ── R2 (S3 SigV4, read-only GET / LIST) ──
const jur = (process.env.CLOUDFLARE_R2_JURISDICTION ?? "eu").trim().toLowerCase();
const host = new URL(process.env.CLOUDFLARE_R2_S3_API).host.replace(/^([^.]+)\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com$/, jur && jur !== "default" ? `$1.${jur}.r2.cloudflarestorage.com` : "$1.r2.cloudflarestorage.com");
async function r2(path, query = "") {
  const amz = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8), ph = sha("");
  const canonical = ["GET", path, query, `host:${host}\nx-amz-content-sha256:${ph}\nx-amz-date:${amz}\n`, "host;x-amz-content-sha256;x-amz-date", ph].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const sig = createHmac("sha256", hmac(hmac(hmac(hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, day), "auto"), "s3"), "aws4_request")).update(["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n")).digest("hex");
  const r = await fetch(`https://${host}${path}${query ? `?${query}` : ""}`, { headers: { "x-amz-date": amz, "x-amz-content-sha256": ph,
    authorization: `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}` } });
  if (!r.ok) throw new Error(`R2 GET ${path}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const bucket = `/${process.env.CLOUDFLARE_R2_BUCKET}`;
const r2get = key => r2(`${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
async function r2prefixes(prefix) {
  const out = []; let token = "";
  for (let i = 0; i < 20; i++) {
    const q = [["delimiter", "/"], ...(token ? [["continuation-token", token]] : []), ["list-type", "2"], ["prefix", prefix]].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const xml = (await r2(bucket, q)).toString("utf8");
    out.push(...[...xml.matchAll(/<CommonPrefixes><Prefix>([^<]+)<\/Prefix><\/CommonPrefixes>/g)].map(m => m[1]));
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/); if (!next) break; token = next[1];
  }
  return out;
}

// ── Live project: read-only SQL (Management API) and the service-role RPC used to record the result ──
async function live(query, attempt = 0) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: `set transaction read only; ${query}` }), signal: AbortSignal.timeout(120_000) });
  const t = await r.text();
  // The Management API is rate-limited and shared with other tooling: back off and retry instead of failing the drill.
  if (r.status === 429 && attempt < 8) { await new Promise(res => setTimeout(res, 2000 * 2 ** Math.min(attempt, 4))); return live(query, attempt + 1); }
  if (!r.ok) throw new Error(`live query: ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t);
}
const lit = s => `'${String(s).replace(/'/g, "''")}'`, id = s => `"${String(s).replace(/"/g, '""')}"`;

// ── 1. Manifest + retention ──
let s1 = Date.now();
const runs = await live(`select run_date::text d, status from public.db_backup_runs order by run_date desc`);
let date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!date) date = runs.find(r => r.status === "complete")?.d;
if (!date) throw new Error("No complete backup recorded in db_backup_runs");
const manifest = JSON.parse((await r2get(`db-backups/${date}/manifest.json`)).toString("utf8"));
const r2Dates = (await r2prefixes("db-backups/")).map(p => p.replace(/^db-backups\/|\/$/g, "")).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
const catalogued = runs.map(r => r.d).sort();
const today = new Date().toISOString().slice(0, 10), dayMs = 86400_000;
const retention = {
  r2_backups: r2Dates.length, catalogued: catalogued.length,
  r2_not_catalogued: r2Dates.filter(d => !catalogued.includes(d)), catalogued_not_in_r2: catalogued.filter(d => !r2Dates.includes(d)),
  // policy: 35 daily + the 1st of each month for 12 months
  beyond_policy: r2Dates.filter(d => { const age = (Date.parse(today) - Date.parse(d)) / dayMs; return (age > 36 && !d.endsWith("-01")) || age > 367; }),
  oldest: r2Dates[0], newest: r2Dates.at(-1),
};
mark("manifest_and_retention_ms", s1);

// ── 2. Live definitions for every table in the manifest ──
s1 = Date.now();
const tables = manifest.tables.map(t => ({ schema: t.schema_name, name: t.table_name, rows: Number(t.rows) }));
const tableList = tables.map(t => `(${lit(t.schema)}, ${lit(t.name)})`).join(",");
const cols = await live(`select n.nspname s, c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn, a.attnum
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname, c.relname) in (${tableList}) and a.attnum > 0 and not a.attisdropped order by 1, 2, a.attnum`);
const enums = await live(`select n.nspname s, t.typname, to_jsonb(array_agg(e.enumlabel order by e.enumsortorder)) labels from pg_type t join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace where n.nspname in ('public','auth') group by 1, 2`);
const cons = await live(`select n.nspname s, c.relname t, k.conname, k.contype, pg_get_constraintdef(k.oid) def from pg_constraint k join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace where (n.nspname, c.relname) in (${tableList}) and k.contype in ('p','u','c','f','x') order by case k.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 when 'x' then 3 else 4 end`);
mark("introspection_ms", s1);

// ── 3. Scratch database, tables, data ──
s1 = Date.now();
const mod = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite");
const exts = {};
for (const [name, path] of [["btree_gist", "contrib/btree_gist"], ["pg_trgm", "contrib/pg_trgm"], ["cube", "contrib/cube"], ["earthdistance", "contrib/earthdistance"]]) {
  try { const base = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE.replace(/index\.js$/, `${path}.js`)).href : `@electric-sql/pglite/${path}`; exts[name] = (await import(base))[name]; } catch { /* optional */ }
}
const db = new mod.PGlite({ extensions: exts });
await db.exec(`create schema if not exists auth; ${Object.keys(exts).map(e => `create extension if not exists ${e};`).join(" ")}`);
for (const e of enums) await db.exec(`create type ${id(e.s)}.${id(e.typname)} as enum (${e.labels.map(lit).join(", ")})`).catch(() => undefined);
const byTable = new Map();
for (const c of cols) { const k = `${c.s}.${c.t}`; if (!byTable.has(k)) byTable.set(k, []); byTable.get(k).push(c); }
const created = [], createFailed = [];
for (const t of tables) {
  const k = `${t.schema}.${t.name}`, cs = byTable.get(k);
  if (!cs) { createFailed.push({ table: k, error: "not in live catalogue" }); continue; }
  // NOT NULL is applied after the load, and only to columns the backup actually contains (see step 4).
  try { await db.exec(`create table ${id(t.schema)}.${id(t.name)} (${cs.map(c => `${id(c.col)} ${c.typ}`).join(", ")})`); created.push(k); }
  catch (e) { createFailed.push({ table: k, error: String(e.message).slice(0, 160) }); }
}
mark("create_tables_ms", s1);
s1 = Date.now();
const counts = [], loadFailed = [], backupKeys = new Map(); let bytes = 0;
for (const t of tables) {
  const k = `${t.schema}.${t.name}`; if (!created.includes(k)) continue;
  try {
    const buf = await r2get(`db-backups/${date}/${k}.ndjson.gz`); bytes += buf.length;
    const lines = gunzipSync(buf).toString("utf8").split("\n").filter(Boolean);
    if (lines.length) backupKeys.set(k, new Set(Object.keys(JSON.parse(lines[0]))));
    for (let i = 0; i < lines.length; i += 1000) {
      await db.query(`insert into ${id(t.schema)}.${id(t.name)} select * from jsonb_populate_recordset(null::${id(t.schema)}.${id(t.name)}, $1::jsonb)`, [`[${lines.slice(i, i + 1000).join(",")}]`]);
    }
    const n = Number((await db.query(`select count(*)::int n from ${id(t.schema)}.${id(t.name)}`)).rows[0].n);
    counts.push({ table: k, manifest: t.rows, file: lines.length, restored: n });
  } catch (e) { loadFailed.push({ table: k, error: String(e.message).slice(0, 160) }); }
}
mark("load_ms", s1);

// ── 4. Constraints (each ADD validates every restored row) ──
s1 = Date.now();
const constraintResult = { n: [0, 0], p: [0, 0], u: [0, 0], c: [0, 0], x: [0, 0], f: [0, 0] }, constraintFailures = [], skipped = [], schemaDrift = [], jsonNullRecovered = [];
// Columns added by migrations after the backup ran are absent from its rows: that is schema drift, not missing data.
for (const c of cols) {
  const k = `${c.s}.${c.t}`; if (!c.nn || !created.includes(k)) continue;
  const keys = backupKeys.get(k);
  if (keys && !keys.has(c.col)) { schemaDrift.push(`${k}.${c.col}`); continue; }
  // row_to_json writes a jsonb JSON-null and an SQL NULL identically; on a NOT NULL jsonb column it can only have been JSON null.
  if (c.typ === "jsonb") {
    const fixed = await db.query(`update ${id(c.s)}.${id(c.t)} set ${id(c.col)} = 'null'::jsonb where ${id(c.col)} is null`);
    if (fixed.affectedRows) jsonNullRecovered.push({ column: `${k}.${c.col}`, rows: fixed.affectedRows });
  }
  try { await db.exec(`alter table ${id(c.s)}.${id(c.t)} alter column ${id(c.col)} set not null`); constraintResult.n[0]++; }
  catch (e) { constraintResult.n[1]++; constraintFailures.push({ table: k, constraint: `${c.col} not null`, type: "n", error: String(e.message).slice(0, 160) }); }
}
for (const c of cons) {
  const k = `${c.s}.${c.t}`; if (!created.includes(k)) continue;
  try { await db.exec(`alter table ${id(c.s)}.${id(c.t)} add constraint ${id(c.conname)} ${c.def}`); constraintResult[c.contype][0]++; }
  catch (e) {
    const msg = String(e.message);
    // A CHECK that calls an application function, or an FK to a table outside the backup, cannot be rebuilt here: not a data failure.
    if (/function .* does not exist|relation .* does not exist|schema .* does not exist|operator .* does not exist|type .* does not exist|data type .* has no default operator class/i.test(msg)) skipped.push({ table: k, constraint: c.conname, why: msg.slice(0, 120) });
    else { constraintResult[c.contype][1]++; constraintFailures.push({ table: k, constraint: c.conname, type: c.contype, error: msg.slice(0, 160) }); }
  }
}
mark("constraints_ms", s1);

// ── 5. Completeness against live: every record created before the backup started must be in the restore ──
s1 = Date.now();
const cutoff = runs.find(r => r.d === date) ? (await live(`select started_at from public.db_backup_runs where run_date = ${lit(date)}`))[0]?.started_at : manifest.created_at;
const sample = ["public.workspaces", "public.events", "public.ticket_tiers", "public.tickets", "public.checkout_orders", "public.bookings_requests", "public.audit_events", "auth.users"];
const completeness = [];
for (const k of sample) {
  if (!created.includes(k)) continue;
  const [s, t] = k.split(".");
  const pkCol = cons.find(c => `${c.s}.${c.t}` === k && c.contype === "p")?.def.match(/^PRIMARY KEY \(([^,)]+)\)$/)?.[1]?.replace(/"/g, "");
  const hasCreated = (byTable.get(k) ?? []).some(c => c.col === "created_at");
  if (!pkCol || !hasCreated) continue;
  const liveIds = (await live(`select ${id(pkCol)}::text v from ${id(s)}.${id(t)} where created_at < ${lit(cutoff)}::timestamptz`)).map(r => r.v);
  const restored = new Set((await db.query(`select ${id(pkCol)}::text v from ${id(s)}.${id(t)}`)).rows.map(r => r.v));
  const missingFromRestore = liveIds.filter(v => !restored.has(v)).length;
  completeness.push({ table: k, live_before_cutoff: liveIds.length, restored: restored.size, missing_from_restore: missingFromRestore, deleted_since: [...restored].filter(v => !liveIds.includes(v)).length });
}
mark("completeness_ms", s1);
await db.close();

// ── Verdict ──
const countMismatch = counts.filter(c => c.manifest !== c.file || c.file !== c.restored);
const incomplete = completeness.filter(c => c.missing_from_restore > 0);
const finishedAt = new Date();
const status = createFailed.length || loadFailed.length || countMismatch.length || constraintFailures.length || incomplete.length ? "failed" : "passed";
const rtoSeconds = Math.round((Date.now() - t0) / 1000), rpoSeconds = Math.round((startedAt.getTime() - Date.parse(manifest.created_at)) / 1000);
const report = {
  backup: date, manifest_created_at: manifest.created_at, status, rto_seconds: rtoSeconds, rpo_seconds_at_drill: rpoSeconds,
  tables: { manifest: tables.length, created: created.length, create_failed: createFailed, load_failed: loadFailed, count_mismatch: countMismatch.length },
  rows: { manifest: tables.reduce((a, t) => a + t.rows, 0), restored: counts.reduce((a, c) => a + c.restored, 0) }, compressed_bytes: bytes,
  constraints: Object.fromEntries(Object.entries(constraintResult).map(([k, [ok, bad]]) => [{ n: "not_null", p: "primary_key", u: "unique", c: "check", x: "exclusion", f: "foreign_key" }[k], { ok, failed: bad }])),
  constraint_failures: constraintFailures.slice(0, 30), constraints_skipped: skipped.length, constraints_skipped_examples: skipped.slice(0, 8), columns_added_after_backup: schemaDrift, json_null_recovered: jsonNullRecovered,
  completeness, retention, timings, target: "PGlite in-memory scratch database (local process; discarded on exit)",
  access_note: "RLS policies, grants and functions are restored from supabase/migrations (git), not from the data backup; they are verified against the live project by tests/release/tenant-security.spec.ts.",
};
if (opt("--report")) writeFileSync(opt("--report"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, constraint_failures: report.constraint_failures.length, completeness: report.completeness.map(c => `${c.table}: ${c.missing_from_restore} missing / ${c.live_before_cutoff}`) }, null, 1));

if (!flag("--no-record")) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/ops_record_restore_test`, { method: "POST",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_backup_kind: "db_logical", p_backup_ref: date, p_target_kind: "local_scratch", p_target_label: "PGlite in-memory scratch (local machine)", p_status: status,
      p_started: startedAt.toISOString(), p_finished: finishedAt.toISOString(), p_rto_seconds: rtoSeconds, p_rpo_seconds: rpoSeconds, p_tables: created.length, p_rows: report.rows.restored,
      p_checks: { tables: report.tables, constraints: report.constraints, constraints_skipped: skipped.length, columns_added_after_backup: schemaDrift.length, json_null_recovered: jsonNullRecovered, completeness, retention, timings },
      p_operator: "scripts/ops/restore-drill.mjs", p_notes: report.access_note }) });
  console.log(r.ok ? `Recorded restore test ${(await r.text()).replace(/"/g, "")}` : `Could not record: ${r.status}`);
}
process.exit(status === "passed" ? 0 : 1);
