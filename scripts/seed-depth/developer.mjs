// Q30: a demo organiser API key (scope feed:read) and a DISABLED webhook endpoint for Alex Events, created with the same
// commands the Developer panel uses (create_api_key with only the SHA-256 hash stored; create_webhook_endpoint, then
// set_webhook_endpoint_status → disabled). The key value is generated, hashed and discarded — it is never printed or stored,
// so the demo key cannot be used (the panel shows its prefix, scopes and dates). The endpoint URL is on the reserved
// example.com domain and is disabled, so nothing is ever delivered.
// These commands require a live session (require_step_up → session_is_live), so this module signs in as the demo organiser
// (password from the git-ignored .env.local, DEMO_ORGANIZER_PASSWORD) and calls the RPCs exactly like the panel.
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sql } from "./lib.mjs";

const OWNER = "alex.events@example.com";
const URL = "https://hooks.example.com/gala-dock/alex-events";
const rand = n => randomBytes(n * 2).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, n);

export async function run() {
  const pw = process.env.DEMO_ORGANIZER_PASSWORD;
  if (!pw) return { skipped: "DEMO_ORGANIZER_PASSWORD not set" };
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await c.auth.signInWithPassword({ email: OWNER, password: pw });
  if (s.error) throw new Error(`sign-in: ${s.error.message}`);
  const out = {};
  try {
    const ws = (await sql(`select id from public.workspaces where name = 'Alex Events' and owner_id = (select id from auth.users where email = '${OWNER}')`))[0].id;
    const keys = await sql(`select count(*)::int n from public.api_keys where workspace_id = '${ws}' and name = 'Demo partner feed (read-only)' and revoked_at is null`);
    if (!keys[0].n) {
      const prefix = rand(8), key = `gd_live_${prefix}_${rand(32)}`;
      const r = await c.rpc("create_api_key", { p_workspace: ws, p_name: "Demo partner feed (read-only)", p_scopes: ["feed:read"], p_prefix: prefix,
        p_hash: createHash("sha256").update(key).digest("hex"), p_expires: new Date(Date.now() + 180 * 864e5).toISOString() });
      if (r.error && /plan_required/.test(r.error.message)) out.api_keys_blocked = "Alex Events is on Starter; api.access needs Pro (owner/billing decision)";
      else if (r.error) throw new Error(`create_api_key: ${r.error.message}`);
      else out.api_keys = 1;
    }
    let ep = (await sql(`select id, status from public.webhook_endpoints where workspace_id = '${ws}' and url = '${URL}'`))[0];
    if (!ep) {
      const r = await c.rpc("create_webhook_endpoint", { p_workspace: ws, p_url: URL, p_events: ["event.published", "order.paid", "ticket.checked_in"],
        p_description: "Demo CRM sync (disabled)", p_secret: `whsec_${randomBytes(24).toString("base64url")}` });
      if (r.error && /plan_required/.test(r.error.message)) { out.webhook_blocked = "plan_required"; return out; }
      if (r.error) throw new Error(`create_webhook_endpoint: ${r.error.message}`);
      out.webhook_endpoints = 1;
      ep = (await sql(`select id, status from public.webhook_endpoints where workspace_id = '${ws}' and url = '${URL}'`))[0];
    }
    if (ep.status !== "disabled") {
      const r = await c.rpc("set_webhook_endpoint_status", { p_endpoint: ep.id, p_status: "disabled" });
      if (r.error) throw new Error(`set_webhook_endpoint_status: ${r.error.message}`);
      out.webhook_disabled = 1;
    }
  } finally { await c.auth.signOut(); }
  return out;
}
