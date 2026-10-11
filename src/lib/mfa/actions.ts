"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { hashRecoveryCode } from "./hash";

// MFA self-service (release spec §7–8). Factor enrol/verify/remove happen client-side through Supabase Auth (which enforces aal2
// for removal); recovery codes and the workspace policy are server-side here.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O/1/I

/** Issues 10 new single-use codes (replacing unused ones). Requires a verified second factor in this session. */
export async function generateRecoveryCodes(): Promise<R<string[]>> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { ok: false, error: "Verify with your authenticator first, then generate recovery codes." };
  const codes = Array.from({ length: 10 }, () => { const b = randomBytes(10); const s = Array.from(b, x => ALPHABET[x % ALPHABET.length]).join(""); return `${s.slice(0, 5)}-${s.slice(5)}`; });
  const db = untyped(createAdminClient() as never);
  await db.from("mfa_recovery_codes").delete().eq("user_id", user.id).is("used_at", null);
  const { error } = await db.from("mfa_recovery_codes").insert(codes.map(c => ({ user_id: user.id, code_hash: hashRecoveryCode(c) })));
  if (error) return { ok: false, error: "Couldn’t create recovery codes." };
  await db.from("audit_events").insert({ actor_id: user.id, actor_type: "user", event: "mfa.recovery_codes_generated", metadata: { count: 10 } });
  return { ok: true, data: codes };
}

/** Records factor changes for the audit trail and notifies the user (a change they didn't make is a compromise signal). */
export async function recordFactorChange(kind: "enrolled" | "removed"): Promise<R> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const db = untyped(createAdminClient() as never);
  await db.from("audit_events").insert({ actor_id: user.id, actor_type: "user", event: `mfa.factor_${kind}`, metadata: {} });
  await db.from("notifications").insert({ user_id: user.id, kind: "security", title: kind === "enrolled" ? "Two-step verification turned on" : "An authenticator was removed",
    body: "If this wasn’t you, change your password and contact support immediately.", link: "/account?tab=security" });
  if (kind === "removed") {
    const { data: f } = await sb.auth.mfa.listFactors();
    if (!f?.totp?.some(x => x.status === "verified")) await db.from("mfa_recovery_codes").delete().eq("user_id", user.id);
  }
  revalidatePath("/account", "page");
  return { ok: true };
}

/** Owner sets the workspace requirement. Turning it on requires the owner to be MFA-verified themselves (enforced in SQL). */
export async function setWorkspaceMfaPolicy(workspaceId: string, policy: "optional" | "admins" | "finance" | "all"): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("set_workspace_mfa_policy" as never, { p_workspace: workspaceId, p_policy: policy } as never);
  if (error) return { ok: false, error: /owner_mfa_required/.test(error.message) ? "Turn on two-step verification for your own account first." : /not_authorized/.test(error.message) ? "Only the workspace owner can change this." : "Couldn’t save the policy." };
  revalidatePath("/organizer/settings", "page"); revalidatePath("/provider/settings", "page");
  return { ok: true };
}
