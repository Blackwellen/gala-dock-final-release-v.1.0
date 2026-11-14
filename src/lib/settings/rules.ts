// Pure rules shared by the settings actions (Q60 settings bug hunt). No server imports, so tests/release can load them directly.

/** Account deletion grace period. Must match public.due_deletions() (14 days), /data-retention and the help centre. */
export const DELETION_GRACE_DAYS = 14;
export const deletionDate = (requestedAt: string | Date) => new Date(new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * 864e5);

type AuthErr = { code?: string; message?: string } | null | undefined;
/** Maps a Supabase Auth updateUser({ password }) error to copy a person can act on. */
export function passwordUpdateError(e: AuthErr): string {
  const code = e?.code ?? "", msg = e?.message ?? "";
  if (code === "insufficient_aal" || /aal2/i.test(msg)) return "Verify with your authenticator app first (Two-step verification on this page), then change your password.";
  if (code === "same_password" || /different from the old/i.test(msg)) return "Choose a password you haven't used here before.";
  if (code === "weak_password" || /weak|pwned|compromised/i.test(msg)) return "That password is too weak or has appeared in a data breach. Choose another.";
  if (code === "reauthentication_needed" || /reauthenticat/i.test(msg)) return "For your security, sign out and sign back in, then change your password.";
  return "Could not change your password.";
}

/** Step-up / session errors raised by public.require_step_up() inside owner/security commands. */
export function stepUpError(msg = ""): string | null {
  if (/step_up_required/.test(msg)) return "Verify with your authenticator app first, then try again.";
  if (/mfa_required/.test(msg)) return "This workspace requires two-step verification for your role. Turn it on in Security, then try again.";
  if (/account_review_hold/.test(msg)) return "Set up two-step verification, or wait for the security review to finish, then try again.";
  if (/session_revoked/.test(msg)) return "Your session has ended. Sign in again.";
  return null;
}

export function workspaceSettingsError(msg = ""): string {
  if (msg.includes("not_authorized")) return "Only owners and managers can change workspace settings.";
  if (msg.includes("invalid_email")) return "Enter a valid contact email.";
  if (msg.includes("invalid_currency")) return "Choose a supported currency.";
  if (msg.includes("invalid_timezone")) return "Choose a timezone from the list (for example Europe/London).";
  return stepUpError(msg) ?? "Could not save settings.";
}

export function memberRoleError(msg = ""): string {
  if (msg.includes("owner_locked")) return "The owner's role can't be changed.";
  if (msg.includes("not_authorized")) return "Only the workspace owner can change roles.";
  if (msg.includes("invalid_role")) return "Choose a role.";
  return stepUpError(msg) ?? "Could not change the role.";
}

export function removeMemberError(msg = ""): string {
  if (msg.includes("cannot_change_owner")) return "The workspace owner can't be removed.";
  if (msg.includes("not_authorized")) return "Only the workspace owner can remove members.";
  if (msg.includes("not_found")) return "Member not found.";
  return stepUpError(msg) ?? "Could not remove this member.";
}

/**
 * update_workspace_settings() silently keeps the old name / cover image when the new value is invalid, and stores any brand colour.
 * Reject those up front so "Settings saved" is never shown for a change that did not happen.
 */
export function workspacePatchProblem(p: Record<string, unknown>): string | null {
  if ("name" in p) { const n = String(p.name ?? "").trim(); if (n.length < 2 || n.length > 80) return "Enter a workspace name between 2 and 80 characters."; }
  if ("cover_image" in p) { const c = String(p.cover_image ?? "").trim(); if (c && !/^(\/assets\/|https:\/\/)/.test(c)) return "Use an image address that starts with https://."; }
  if ("brand_color" in p) { const c = String(p.brand_color ?? "").trim(); if (c && !/^#[0-9a-f]{6}$/i.test(c)) return "Enter the brand colour as a hex code, for example #2563EB."; }
  return null;
}
