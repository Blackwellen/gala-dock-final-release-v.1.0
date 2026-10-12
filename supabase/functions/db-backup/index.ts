// Nightly logical database backup → Cloudflare R2 (EU). Runs as a Supabase Edge Function, triggered by pg_cron (job "db-backup",
// migration 202610280006). Each table is written as gzipped NDJSON to db-backups/<YYYY-MM-DD>/<schema>.<table>.ndjson.gz, then a
// manifest.json marks the day complete. Runs are resumable: tables already uploaded today are skipped, so the job is simply re-invoked
// until the manifest exists. Retention: 35 daily backups plus the 1st of each month for 12 months.
// The schema itself is restored from supabase/migrations (git); this backup holds the data. Restore: scripts/db-backup-restore.mjs.
import postgres from "npm:postgres@3.4.4";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const env = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`missing_env_${k}`); return v; };
const BUDGET_MS = 120_000, BATCH = 5000;
// auth: accounts, sign-in identities and MFA factors (needed so users can sign in after a restore). No sessions, tokens or logs.
const AUTH_TABLES = ["users", "identities", "mfa_factors"];
// High-churn operational tables whose loss doesn't matter (rebuilt or transient).
const SKIP = new Set(["public.rate_limits", "public.queue_heartbeats"]);

const day = (d: Date) => d.toISOString().slice(0, 10);
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env("DB_BACKUP_SECRET")}`) return new Response("Unauthorised", { status: 401 });

  const started = Date.now(), date = day(new Date());
  const r2 = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
  const base = `${env("R2_ENDPOINT").replace(/\/+$/, "")}/${env("R2_BUCKET")}`;
  const url = (key: string, qs = "") => `${base}/${key.split("/").map(encodeURIComponent).join("/")}${qs}`;
  const exists = async (key: string) => (await r2.fetch(url(key), { method: "HEAD" })).ok;
  const put = async (key: string, body: Uint8Array, type: string) => {
    const r = await r2.fetch(url(key), { method: "PUT", body, headers: { "content-type": type } });
    if (!r.ok) throw new Error(`r2_put_${r.status}`);
  };

  const sql = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 1, idle_timeout: 5 });
  try {
    if (await exists(`db-backups/${date}/manifest.json`)) return Response.json({ date, done: true, skipped: "already_complete" });
    await sql`insert into public.db_backup_runs(run_date, status) values (${date}, 'running') on conflict (run_date) do update set status = 'running', attempts = public.db_backup_runs.attempts + 1, error = null`;

    const tables = await sql<{ schema: string; name: string }[]>`
      select table_schema as schema, table_name as name from information_schema.tables
      where table_type = 'BASE TABLE' and (table_schema = 'public' or (table_schema = 'auth' and table_name = any(${AUTH_TABLES})))
      order by table_schema, table_name`;
    const list = tables.filter(t => !SKIP.has(`${t.schema}.${t.name}`));

    for (const t of list) {
      if (Date.now() - started > BUDGET_MS) {
        await sql`update public.db_backup_runs set status = 'partial' where run_date = ${date}`;
        return Response.json({ date, done: false, reason: "time_budget" });
      }
      const key = `db-backups/${date}/${t.schema}.${t.name}.ndjson.gz`;
      if (await exists(key)) continue;
      // Stream rows in batches into a gzip stream (one JSON object per line).
      const gz = new CompressionStream("gzip"), w = gz.writable.getWriter(), enc = new TextEncoder();
      const out = new Response(gz.readable).arrayBuffer();
      let rows = 0;
      await sql.unsafe(`select row_to_json(t)::text as j from ${ident(t.schema)}.${ident(t.name)} t`)
        .cursor(BATCH, async (batch: { j: string }[]) => { rows += batch.length; await w.write(enc.encode(batch.map(r => r.j).join("\n") + "\n")); });
      await w.close();
      const body = new Uint8Array(await out);
      await put(key, body, "application/gzip");
      await sql`insert into public.db_backup_tables(run_date, schema_name, table_name, rows, bytes) values (${date}, ${t.schema}, ${t.name}, ${rows}, ${body.byteLength})
        on conflict (run_date, schema_name, table_name) do update set rows = excluded.rows, bytes = excluded.bytes, uploaded_at = now()`;
    }

    const done = await sql<{ schema_name: string; table_name: string; rows: number; bytes: number }[]>`
      select schema_name, table_name, rows, bytes from public.db_backup_tables where run_date = ${date} order by 1, 2`;
    const manifest = { date, created_at: new Date().toISOString(), project: Deno.env.get("SUPABASE_URL"), format: "ndjson.gz (row_to_json per line)",
      schema_source: "supabase/migrations in the gala-dock repository", tables: done };
    await put(`db-backups/${date}/manifest.json`, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), "application/json");
    const totals = done.reduce((a, r) => ({ rows: a.rows + Number(r.rows), bytes: a.bytes + Number(r.bytes) }), { rows: 0, bytes: 0 });
    await sql`update public.db_backup_runs set status = 'complete', tables = ${done.length}, rows = ${totals.rows}, bytes = ${totals.bytes}, finished_at = now() where run_date = ${date}`;

    // Retention: keep 35 daily backups and the 1st of each month for 12 months.
    const now = new Date(), cutDaily = day(new Date(now.getTime() - 35 * 86400_000)), cutMonthly = day(new Date(now.getTime() - 366 * 86400_000));
    const old = await sql<{ run_date: string }[]>`select run_date::text from public.db_backup_runs
      where (run_date < ${cutDaily}::date and extract(day from run_date) <> 1) or run_date < ${cutMonthly}::date`;
    let purged = 0;
    for (const o of old) {
      const keys = await sql<{ schema_name: string; table_name: string }[]>`select schema_name, table_name from public.db_backup_tables where run_date = ${o.run_date}::date`;
      for (const k of keys) await r2.fetch(url(`db-backups/${o.run_date}/${k.schema_name}.${k.table_name}.ndjson.gz`), { method: "DELETE" });
      await r2.fetch(url(`db-backups/${o.run_date}/manifest.json`), { method: "DELETE" });
      await sql`delete from public.db_backup_runs where run_date = ${o.run_date}::date`;
      purged++;
    }
    return Response.json({ date, done: true, tables: done.length, ...totals, purged, ms: Date.now() - started });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await sql`update public.db_backup_runs set status = 'failed', error = ${msg} where run_date = ${date}`.catch(() => {});
    return Response.json({ date, done: false, error: msg }, { status: 500 });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
