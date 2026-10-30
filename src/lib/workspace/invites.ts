import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createInviteToken } from "@/lib/security";

// Q01 P1: client roles only hold SELECT on workspace_invites, so invitations are created and revoked through the
// owner-only commands from migration 202610292008 (hashed single-use token, email-bound, audited, rate-limited).
type Client = Pick<SupabaseClient, "rpc">;
type Err = { message?: string; code?: string } | null;

const reasons: [RegExp, string, number][] = [
  [/not_authorized/, "Only the workspace owner can invite members.", 403],
  [/workspace_not_ready/, "Finish setting up the workspace before inviting your team.", 409],
  [/already_member/, "This person is already a member of the workspace.", 409],
  [/self_invite/, "You can’t invite yourself.", 400],
  [/rate_limited/, "Too many invitations. Please wait and try again later.", 429],
  [/invalid_role|invalid_email/, "Enter a valid email and role.", 400],
];

export function inviteError(error: Err): { error: string; status: number } {
  if (error?.code === "23505" && !/already_member/.test(error.message ?? "")) return { error: "This person already has a pending invitation.", status: 409 };
  const hit = reasons.find(([re]) => re.test(error?.message ?? ""));
  return hit ? { error: hit[1], status: hit[2] } : { error: "Could not create invitation.", status: 500 };
}

/** Creates an invitation and returns the raw token (shown once as a link; only its hash is stored). */
export async function createWorkspaceInvite(client: Client, workspaceId: string, email: string, role: string) {
  const { token, hash } = createInviteToken();
  const { error } = await client.rpc("create_workspace_invite", { p_workspace: workspaceId, p_email: email, p_role: role, p_token_hash: hash });
  if (error) return { ok: false as const, ...inviteError(error) };
  return { ok: true as const, token };
}

export async function revokeWorkspaceInvite(client: Client, inviteId: string) {
  const { error } = await client.rpc("revoke_workspace_invite", { p_invite: inviteId });
  if (!error) return { ok: true as const };
  if (/invite_already_used/.test(error.message)) return { ok: false as const, error: "This invitation has already been accepted." };
  if (/not_authorized/.test(error.message)) return { ok: false as const, error: "Only the workspace owner can manage invitations." };
  return { ok: false as const, error: "Couldn’t revoke the invitation." };
}
