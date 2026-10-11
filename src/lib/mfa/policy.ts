import "server-only";
import { redirect } from "next/navigation";

export type MfaPolicy = "optional" | "admins" | "finance" | "all";
export const policyOf = (settings: unknown): MfaPolicy => {
  const p = ((settings ?? {}) as { security?: { mfa_policy?: string } }).security?.mfa_policy;
  return p === "admins" || p === "finance" || p === "all" ? p : "optional";
};
/** Mirrors public.mfa_required(). */
export const mfaRequired = (policy: MfaPolicy, role: string) =>
  policy === "all" || (policy === "admins" && ["owner", "manager"].includes(role)) || (policy === "finance" && ["owner", "manager", "finance"].includes(role));

/**
 * Workspace MFA gate (release spec §8). If the workspace requires MFA for this member's role and the session isn't aal2:
 * members with a factor are sent to verify; members without one are sent to their security settings to set it up (never locked out).
 */
export function enforceWorkspaceMfa(o: { settings: unknown; role: string; aal: string | null | undefined; hasFactor?: boolean; workspaceName: string; next: string }) {
  if (!mfaRequired(policyOf(o.settings), o.role) || o.aal === "aal2") return;
  if (o.hasFactor) redirect(`/mfa?next=${encodeURIComponent(o.next)}&required=1`);
  redirect(`/account?tab=security&mfa=required&ws=${encodeURIComponent(o.workspaceName.slice(0, 80))}#mfa`);
}
