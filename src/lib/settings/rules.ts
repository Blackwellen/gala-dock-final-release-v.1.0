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
  if (msg.includes("plan_limit_reached:seats")) return "Restoring this person needs a free team seat. Revoke a pending invitation, remove someone else, or upgrade the plan.";
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

// ── Q67 settings & billing build ─────────────────────────────────────────────────────────────────────────────────────────────

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/;
const RESERVED_DOMAIN = /(^|\.)(test|example|invalid|localhost)$|(^|\.)example\.(com|org|net)$/;
/** Validates a requested sign-in email change before anything is sent. */
export function emailChangeProblem(current: string | null | undefined, next: string): string | null {
  const n = next.trim().toLowerCase();
  if (!EMAIL.test(n) || n.length > 254) return "Enter a valid email address.";
  if (n === (current ?? "").trim().toLowerCase()) return "That's already your sign-in email.";
  if (RESERVED_DOMAIN.test(n.split("@")[1] ?? "")) return "That address can't receive email. Use a real mailbox.";
  return null;
}
/** Maps a Supabase Auth updateUser({ email }) error to copy a person can act on. */
export function emailChangeError(e: AuthErr): string {
  const code = e?.code ?? "", msg = e?.message ?? "";
  if (code === "email_exists" || /already (been )?registered|already exists/i.test(msg)) return "That email is already used by another Gala Dock account.";
  if (code === "insufficient_aal" || /aal2/i.test(msg)) return "Verify with your authenticator app first, then change your email.";
  if (code === "over_email_send_rate_limit" || /rate limit|security purposes/i.test(msg)) return "Too many emails were sent. Wait a few minutes and try again.";
  if (code === "email_address_invalid" || /invalid/i.test(msg)) return "Enter a valid email address.";
  return "Could not start the email change. Please try again.";
}

/** Database refusal for a new event/seat/listing over the plan cap (plan_limit_reached:<what>, detail = JSON). */
export function planLimitError(e: { message?: string; details?: string | null } | null | undefined): string | null {
  const m = /plan_limit_reached:(events|seats|listings)/.exec(e?.message ?? "");
  if (!m) return null;
  let d: { used?: number; max?: number; plan?: string } = {};
  try { d = JSON.parse(e?.details ?? "{}"); } catch { /* detail missing: generic copy */ }
  const plan = d.plan ? d.plan[0]!.toUpperCase() + d.plan.slice(1) : "your";
  const n = typeof d.max === "number" ? d.max : null;
  const what = m[1] === "events" ? `${n ?? "the maximum number of"} active event${n === 1 ? "" : "s"}` : m[1] === "seats" ? `${n ?? "the maximum number of"} team seat${n === 1 ? "" : "s"} (owner, members and pending invitations)` : `${n ?? "the maximum number of"} live listing${n === 1 ? "" : "s"}`;
  return `The ${plan} plan includes ${what}, and you're at the limit. Upgrade in Settings → Payments & Billing — nothing you already have is affected.`;
}
/** Where an upgrade prompt points (the plan picker is in the billing tab of each workspace's settings). */
export const upgradeHref = (kind: string) => kind === "provider" ? "/provider/settings?tab=billing" : "/organizer/settings?tab=billing";

export function ownershipError(msg = "", detail?: string | null): string {
  if (msg.includes("confirm_mismatch")) return "Type the workspace name exactly to confirm.";
  if (msg.includes("target_not_manager")) return "Ownership can only move to an active manager. Make them a manager first.";
  if (msg.includes("invalid_target")) return "Choose another manager.";
  if (msg.includes("transfer_pending")) return "A transfer is already waiting for an answer. Cancel it first.";
  if (msg.includes("transfer_blocked")) return detail || "This workspace can't change owner right now.";
  if (msg.includes("owner_changed")) return "The workspace owner has changed since this request was made.";
  if (msg.includes("not_pending")) return "This request has already been answered or cancelled.";
  if (msg.includes("rate_limited")) return "Too many transfer requests today. Try again tomorrow.";
  if (msg.includes("not_authorized")) return "Only the workspace owner can transfer ownership.";
  return stepUpError(msg) ?? "Could not complete the ownership transfer.";
}

/**
 * Organiser workspace notification switches (workspaces.settings.notifications), as delivered by the database
 * (trg_notification_workspace_prefs + trg_notification_email, migration 202611146901). Mandatory kinds ignore all of them.
 */
export const ORG_NOTIFICATION_SWITCHES = [
  { key: "in_app", label: "In-app alerts", detail: "Workspace alerts in the bell. When off they are still kept (already read) and can still be emailed." },
  { key: "email", label: "Email alerts", detail: "A copy of workspace alerts by email. Each person can also mute categories in their own account." },
  { key: "agent", label: "Gala Agent updates", detail: "Watch alerts and paused-task notices. Approval requests always arrive." },
] as const;
export const MANDATORY_NOTIFICATIONS = ["Security and sign-in", "Payments, payouts, refunds and invoices", "Disputes and chargebacks", "Legal and policy changes"] as const;
