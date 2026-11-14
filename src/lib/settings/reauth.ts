import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { untyped } from "@/lib/workspace/db";
import { stepUpError } from "./rules";

/** Accounts without a password (Google / passkey only) re-authenticate by having signed in within this window. */
export const FRESH_SIGN_IN_MS = 10 * 60_000;
export const hasPasswordLogin = (user: Pick<User, "identities">) => (user.identities ?? []).some(i => i.provider === "email");

/**
 * Q67 re-authentication for sensitive account/workspace changes (email change, ownership transfer):
 *  1. the current password, checked against the caller's own hash by verify_my_password (rate limited, no session side effects);
 *     password-less accounts must instead have signed in within the last 10 minutes;
 *  2. then require_step_up(): aal2 whenever the person has two-step verification (and the workspace MFA policy, when given).
 * Returns an error message, or null when the caller may proceed.
 */
export async function reauthenticate(supabase: SupabaseClient, user: User, password: string, workspaceId?: string | null): Promise<string | null> {
  if (hasPasswordLogin(user)) {
    if (!password) return "Enter your current password.";
    const { data, error } = await untyped(supabase as never).rpc("verify_my_password", { p_password: password });
    if (error) return /rate_limited/.test(error.message) ? "Too many attempts. Wait 15 minutes and try again." : "Could not check your password. Please try again.";
    if (data !== true) return "Your current password is incorrect.";
  } else {
    const last = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
    if (!(Date.now() - last < FRESH_SIGN_IN_MS)) return "For your security, sign out and sign back in (with Google or your passkey), then try again within 10 minutes.";
  }
  const { error: su } = await untyped(supabase as never).rpc("require_step_up", workspaceId ? { p_workspace: workspaceId } : {});
  if (su) return stepUpError(su.message) ?? "Could not verify your session. Sign in again.";
  return null;
}
