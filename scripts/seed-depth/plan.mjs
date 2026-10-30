// Q38 pass 2 / Q30 (owner-delegated decision 2026-10-29): move the Alex Events demo workspace to Pro through the audited admin
// plan change (admin_set_workspace_plan — the command behind the admin console's setWorkspacePlan), reason
// "demo: API access showcase", then create the demo API key (scope feed:read) exactly like the Developer panel does.
//   * The admin step signs in as admin.demo@example.com and steps up to aal2 with its demo TOTP factor (DEMO_ADMIN_TOTP_SECRET,
//     git-ignored .env.local) because admin_require → admin_mfa_required needs aal2. Audit: audit_events 'admin.workspace_plan_changed'.
//   * The key step signs in as the demo owner (live session; require_step_up passes — the demo owner has no second factor and the
//     workspace MFA policy is optional) and calls create_api_key with only the SHA-256 hash. The key value is generated, hashed and
//     discarded: it is never printed, logged or stored, so it cannot be used (the panel shows prefix, scopes and dates).
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sql } from "./lib.mjs";
import { totp } from "../totp.mjs";

const OWNER = "alex.events@example.com", ADMIN = "admin.demo@example.com";
const REASON = "demo: API access showcase", KEY_NAME = "Demo partner feed (read-only)";
const rand = n => randomBytes(n * 2).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, n);
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export async function run() {
  const out = {};
  const ws = (await sql(`select id, plan from public.workspaces where name = 'Alex Events' and owner_id = (select id from auth.users where email = '${OWNER}')`))[0];
  if (!ws) return { skipped: "Alex Events demo workspace not found" };
  if (ws.plan !== "pro") {
    const pw = process.env.DEMO_ADMIN_PASSWORD, secret = process.env.DEMO_ADMIN_TOTP_SECRET;
    if (!pw || !secret) return { blocked: "DEMO_ADMIN_PASSWORD / DEMO_ADMIN_TOTP_SECRET not set" };
    const a = client();
    const s = await a.auth.signInWithPassword({ email: ADMIN, password: pw });
    if (s.error) throw new Error(`admin sign-in: ${s.error.message}`);
    try {
      const f = await a.auth.mfa.listFactors();
      const factor = f.data?.totp?.find(x => x.status === "verified");
      if (!factor) return { blocked: "admin demo has no verified TOTP factor" };
      const v = await a.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
      if (v.error) throw new Error(`admin step-up: ${v.error.message}`);
      const r = await a.rpc("admin_set_workspace_plan", { p_ws: ws.id, p_plan: "pro", p_reason: REASON });
      if (r.error) throw new Error(`admin_set_workspace_plan: ${r.error.message}`);
      out.plan_changed = 1;
    } finally { await a.auth.signOut(); }
  }
  const keys = await sql(`select count(*)::int n from public.api_keys where workspace_id = '${ws.id}' and name = '${KEY_NAME}' and revoked_at is null`);
  if (!keys[0].n) {
    const pw = process.env.DEMO_ORGANIZER_PASSWORD;
    if (!pw) return { ...out, blocked: "DEMO_ORGANIZER_PASSWORD not set" };
    const c = client();
    const s = await c.auth.signInWithPassword({ email: OWNER, password: pw });
    if (s.error) throw new Error(`owner sign-in: ${s.error.message}`);
    try {
      let prefix = rand(8), key = `gd_live_${prefix}_${rand(32)}`;
      const r = await c.rpc("create_api_key", { p_workspace: ws.id, p_name: KEY_NAME, p_scopes: ["feed:read"], p_prefix: prefix,
        p_hash: createHash("sha256").update(key).digest("hex"), p_expires: new Date(Date.now() + 180 * 864e5).toISOString() });
      key = prefix = null;   // discarded, never printed
      if (r.error && /step_up_required|mfa_required/.test(r.error.message)) return { ...out, blocked: `create_api_key: ${r.error.message} (demo owner has no TOTP)` };
      if (r.error) throw new Error(`create_api_key: ${r.error.message}`);
      out.api_keys = 1;
    } finally { await c.auth.signOut(); }
  }
  return out;
}
