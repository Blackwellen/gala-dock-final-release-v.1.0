// Restores a nightly db-backup (R2: db-backups/<date>/) — see supabase/functions/db-backup and docs/operations runbook §2.
//   Verify only:    node --env-file=.env --env-file=.env.local scripts/db-backup-restore.mjs <YYYY-MM-DD> --verify   (downloads, decompresses and parses every table in memory; checks row counts against the manifest; writes nothing)
//   Download only:  node --env-file=.env --env-file=.env.local scripts/db-backup-restore.mjs <YYYY-MM-DD> --out artifacts/restore
//   Load into a project (schema first: apply supabase/migrations to the target, then):
//                   node --env-file=.env --env-file=.env.local scripts/db-backup-restore.mjs <YYYY-MM-DD> --target <project-ref> [--tables public.events,...]
// Loading truncates each target table before inserting, with triggers and FK checks off (session_replication_role = replica).
// Never point --target at production unless you are deliberately restoring it.
import { createHash, createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [date, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.error("Usage: db-backup-restore.mjs <YYYY-MM-DD> (--out <dir> | --target <ref>) [--tables a,b]"); process.exit(1); }
const out = opt("--out"), target = opt("--target"), only = opt("--tables")?.split(","), verify = rest.includes("--verify");
if (!out && !target && !verify) { console.error("Give --verify, --out <dir> or --target <project-ref>."); process.exit(1); }
const t0 = Date.now(), problems = [];

// ── R2 (S3 SigV4) ──
const j = (process.env.CLOUDFLARE_R2_JURISDICTION ?? "eu").trim().toLowerCase();
const host = new URL(process.env.CLOUDFLARE_R2_S3_API).host.replace(/^([^.]+)\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com$/, j && j !== "default" ? `$1.${j}.r2.cloudflarestorage.com` : "$1.r2.cloudflarestorage.com");
const sha = b => createHash("sha256").update(b).digest("hex"), hmac = (k, s) => createHmac("sha256", k).update(s).digest();
async function r2get(key) {
  const path = `/${process.env.CLOUDFLARE_R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const amz = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8), ph = sha("");
  const canonical = ["GET", path, "", `host:${host}\nx-amz-content-sha256:${ph}\nx-amz-date:${amz}\n`, "host;x-amz-content-sha256;x-amz-date", ph].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const sig = createHmac("sha256", hmac(hmac(hmac(hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, day), "auto"), "s3"), "aws4_request")).update(["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n")).digest("hex");
  const r = await fetch(`https://${host}${path}`, { headers: { "x-amz-date": amz, "x-amz-content-sha256": ph, authorization: `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}` } });
  if (!r.ok) throw new Error(`r2 GET ${key}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ── Target project (Management API) ──
const query = async q => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${target}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), signal: AbortSignal.timeout(300_000) });
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 400)); return t;
};
const lit = s => `'${s.replace(/'/g, "''")}'`, id = s => `"${s.replace(/"/g, '""')}"`;

const manifest = JSON.parse((await r2get(`db-backups/${date}/manifest.json`)).toString("utf8"));
const tables = manifest.tables.filter(t => !only || only.includes(`${t.schema_name}.${t.table_name}`));
console.log(`Backup ${date}: ${tables.length} tables, ${tables.reduce((a, t) => a + Number(t.rows), 0)} rows`);
if (target === process.env.SUPABASE_PROJECT_REF) console.warn("WARNING: target is the production project.");

for (const t of tables) {
  const name = `${t.schema_name}.${t.table_name}`;
  const text = gunzipSync(await r2get(`db-backups/${date}/${name}.ndjson.gz`)).toString("utf8");
  if (verify) {
    const lines = text.split("\n").filter(Boolean); let bad = 0;
    for (const l of lines) { try { if (typeof JSON.parse(l) !== "object") bad++; } catch { bad++; } }
    if (lines.length !== Number(t.rows) || bad) problems.push(`${name}: manifest ${t.rows}, file ${lines.length}${bad ? `, ${bad} unparseable` : ""}`);
  }
  if (out) { mkdirSync(join(out, date), { recursive: true }); writeFileSync(join(out, date, `${name}.ndjson`), text); }
  if (target) {
    const rows = text.split("\n").filter(Boolean);
    let sqlText = `set session_replication_role = replica; truncate ${id(t.schema_name)}.${id(t.table_name)} cascade;`;
    await query(sqlText);
    for (let i = 0; i < rows.length; i += 500) {
      const batch = `[${rows.slice(i, i + 500).join(",")}]`;
      sqlText = `set session_replication_role = replica; insert into ${id(t.schema_name)}.${id(t.table_name)} select * from jsonb_populate_recordset(null::${id(t.schema_name)}.${id(t.table_name)}, ${lit(batch)}::jsonb);`;
      await query(sqlText);
    }
  }
  console.log(`  ${name}: ${t.rows} rows${out ? " saved" : ""}${target ? " loaded" : ""}`);
}
if (verify) {
  console.log(problems.length ? `VERIFY FAILED (${problems.length}):\n  ${problems.join("\n  ")}` : `VERIFY OK: every table decompressed, every row parsed, counts match the manifest.`);
  console.log(`Elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (problems.length) process.exit(1);
}
console.log("Done.");
