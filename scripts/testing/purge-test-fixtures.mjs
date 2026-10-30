// Purges TEST fixture workspaces through the audited admin command public.admin_purge_test_workspaces (Q32, migration
// 202610294022). Dry run by default: prints exactly what would be deleted per table and which test identities would be removed.
// The command runs AS A PLATFORM ADMIN (workspaces permission) at aal2 — this script signs in with the admin's password and
// verifies their TOTP factor; it never uses the service role for the purge itself. The service role is used only after a real
// purge to remove the listed disposable test identities through the Auth admin API (each re-checked first).
// Usage:
//   PURGE_ADMIN_EMAIL=… PURGE_ADMIN_PASSWORD=… PURGE_ADMIN_TOTP_SECRET=… \
//   node --env-file=.env --env-file=.env.local scripts/testing/purge-test-fixtures.mjs --workspaces=<uuid,uuid,…> --reason="…" [--execute]
// Never logs credentials.
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const execute = process.argv.includes("--execute");
const workspaces = (arg("workspaces") ?? "").split(",").map(s => s.trim()).filter(Boolean);
const reason = arg("reason") ?? "";
if (!workspaces.length || workspaces.some(w => !/^[0-9a-f-]{36}$/.test(w))) throw new Error("--workspaces=<uuid,…> required");
if (reason.trim().length < 5) throw new Error("--reason=… (at least 5 characters) required");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "PURGE_ADMIN_EMAIL", "PURGE_ADMIN_PASSWORD", "PURGE_ADMIN_TOTP_SECRET"])
  if (!process.env[k]) throw new Error(`Missing ${k}`);

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest(); const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const adminUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
const { error: signInError } = await adminUser.auth.signInWithPassword({ email: process.env.PURGE_ADMIN_EMAIL, password: process.env.PURGE_ADMIN_PASSWORD });
if (signInError) throw new Error(`Admin sign-in failed: ${signInError.message}`);
const { data: factors } = await adminUser.auth.mfa.listFactors();
const factor = factors?.totp?.find(f => f.status === "verified");
if (!factor) throw new Error("The admin has no verified TOTP factor (aal2 is required)");
const { error: mfaError } = await adminUser.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(process.env.PURGE_ADMIN_TOTP_SECRET) });
if (mfaError) throw new Error(`MFA verification failed: ${mfaError.message}`);

const { data, error } = await adminUser.rpc("admin_purge_test_workspaces", { p_workspaces: workspaces, p_reason: reason, p_dry_run: !execute });
if (error) throw new Error(`Purge ${execute ? "failed" : "dry run failed"}: ${error.message}`);
const result = { ...data, users_removed: [], users_skipped: [] };

if (execute && data.users_to_remove?.length) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for test identity removal");
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
  for (const id of data.users_to_remove) {
    const { data: u } = await service.auth.admin.getUserById(id);
    const email = u?.user?.email ?? "";
    const { count: memberships } = await service.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("user_id", id);
    const { count: owned } = await service.from("workspaces").select("id", { count: "exact", head: true }).eq("owner_id", id);
    if (!/^p1-[a-z0-9-]+-[0-9a-f]{8}@gala-dock\.test$/.test(email) || memberships || owned) { result.users_skipped.push(id); continue; }
    const { error: delError } = await service.auth.admin.deleteUser(id);
    (delError ? result.users_skipped : result.users_removed).push(id);
  }
}
await adminUser.auth.signOut();
console.log(JSON.stringify(result, null, 2));
