"use server";

import { createClient } from "@/lib/supabase/server";
import { hashToken, isTokenFormat, rateLimit } from "@/lib/security";
import { untyped } from "@/lib/workspace/db";

const MESSAGES: Record<string, string> = {
  mismatch: "This invitation was sent to a different email address. Sign out and sign in with the invited address.",
  expired: "This invitation has expired. Ask for a new one.",
  used: "This invitation has already been used.",
  revoked: "This invitation was replaced by a newer one.",
  already_partner: "This account is already linked to another partner. Contact partner support.",
  unavailable: "This invitation is no longer available.",
};

/** Accepts a partner / promoter login invitation for the signed-in user (portal_invite_accept checks the email binding). */
export async function acceptPortalInvite(token: string): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  if (typeof token !== "string" || !isTokenFormat(token)) return { ok: false, error: MESSAGES.unavailable };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };
  if (!(await rateLimit(`join:${user.id}`, 20, 600))) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  const { data, error } = await untyped(supabase).rpc("portal_invite_accept", { p_token_hash: hashToken(token) });
  if (error) return { ok: false, error: "Couldn’t accept the invitation — please try again." };
  const r = data as { result: string; next?: string };
  if (r.result === "accepted" && r.next) return { ok: true, next: r.next };
  return { ok: false, error: MESSAGES[r.result] ?? MESSAGES.unavailable };
}
