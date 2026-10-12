// Deploys the db-backup Edge Function (supabase/functions/db-backup) and wires its secrets, without the Supabase CLI.
//  1. Edge Function secrets: DB_BACKUP_SECRET (generated, or reused from Vault), R2_* (from .env / .env.local).
//  2. Function code via the Management API deploy endpoint (verify_jwt off — the function checks DB_BACKUP_SECRET itself).
//  3. Vault: db_backup_secret + db_backup_url, read by public.dispatch_db_backup() (migration 202610280006).
// Usage: node --env-file=.env --env-file=.env.local scripts/deploy-db-backup.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
const need = ["SUPABASE_PROJECT_REF", "SUPABASE_PAT_KEY", "CLOUDFLARE_R2_S3_API", "CLOUDFLARE_R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(k => !process.env[k]);
if (need.length) { console.error(`Missing: ${need.join(", ")}`); process.exit(1); }
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { ...init, headers: { Authorization: `Bearer ${pat}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(120_000) });
  const t = await r.text(); if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null;
};
const sql = q => api("/database/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
const lit = s => `'${String(s).replace(/'/g, "''")}'`;

// The bucket is EU-jurisdiction (see src/lib/r2.ts); its S3 host is <account>.eu.r2.cloudflarestorage.com.
const j = (process.env.CLOUDFLARE_R2_JURISDICTION ?? "eu").trim().toLowerCase();
const host = new URL(process.env.CLOUDFLARE_R2_S3_API).host.replace(/^([^.]+)\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com$/, j && j !== "default" ? `$1.${j}.r2.cloudflarestorage.com` : "$1.r2.cloudflarestorage.com");

const existing = (await sql("select decrypted_secret s from vault.decrypted_secrets where name = 'db_backup_secret'"))?.[0]?.s;
const secret = existing ?? randomBytes(32).toString("hex");

await api("/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([
  { name: "DB_BACKUP_SECRET", value: secret },
  { name: "R2_ENDPOINT", value: `https://${host}` },
  { name: "R2_BUCKET", value: process.env.CLOUDFLARE_R2_BUCKET },
  { name: "R2_ACCESS_KEY_ID", value: process.env.R2_ACCESS_KEY_ID },
  { name: "R2_SECRET_ACCESS_KEY", value: process.env.R2_SECRET_ACCESS_KEY },
]) });
console.log("Edge Function secrets set (R2 host:", host.replace(/^[^.]+/, "<account>") + ")");

const form = new FormData();
form.append("metadata", JSON.stringify({ name: "db-backup", entrypoint_path: "index.ts", verify_jwt: false }));
form.append("file", new Blob([readFileSync(new URL("../supabase/functions/db-backup/index.ts", import.meta.url))], { type: "application/typescript" }), "index.ts");
const dep = await api("/functions/deploy?slug=db-backup", { method: "POST", body: form });
console.log("Deployed:", dep?.slug ?? dep?.name, "version", dep?.version, dep?.status ?? "");

const url = `https://${ref}.supabase.co/functions/v1/db-backup`;
await sql(`do $$ begin
  if exists (select 1 from vault.secrets where name = 'db_backup_secret') then perform vault.update_secret((select id from vault.secrets where name = 'db_backup_secret'), ${lit(secret)});
  else perform vault.create_secret(${lit(secret)}, 'db_backup_secret', 'Bearer secret for the db-backup Edge Function'); end if;
  if exists (select 1 from vault.secrets where name = 'db_backup_url') then perform vault.update_secret((select id from vault.secrets where name = 'db_backup_url'), ${lit(url)});
  else perform vault.create_secret(${lit(url)}, 'db_backup_url', 'db-backup Edge Function URL'); end if;
end $$`);
console.log("Vault secrets db_backup_secret / db_backup_url set.");
