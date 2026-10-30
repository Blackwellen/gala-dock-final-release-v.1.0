// Q04: once the shared ClamAV gateway is reachable (CLAMAV_SCAN_URL + CLAMAV_SCAN_TOKEN set on the app), enqueue files.scan for every
// quarantined or not-yet-scanned object so the app worker records real verdicts (clean releases the quarantine; infected removes the object).
// Idempotent (job dedupe key per object). Never logs file contents or credentials.
// Usage: node --env-file=.env --env-file=.env.local scripts/files/rescan-quarantined.mjs [--dry-run] [--all-not-scanned]
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const dry = process.argv.includes("--dry-run"), all = process.argv.includes("--all-not-scanned");
let q = db.from("storage_attribution").select("bucket,name").is("deleted_at", null).limit(5000);
q = all ? q.or("scan_status.eq.quarantined,av_verdict.eq.not_scanned") : q.eq("scan_status", "quarantined");
const { data, error } = await q;
if (error) throw new Error(error.message);
let n = 0;
for (const r of data ?? []) {
  if (!dry) { const e = await db.rpc("enqueue_job", { p_kind: "files.scan", p_payload: { bucket: r.bucket, name: r.name }, p_dedupe_key: `files.scan:rescan:${r.bucket}/${r.name}` }); if (e.error) throw new Error(e.error.message); }
  n++;
}
console.log(JSON.stringify({ dryRun: dry, enqueued: n }));
