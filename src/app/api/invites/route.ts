import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { clientIp, hashToken, isTokenFormat, rateLimit, sameOrigin } from "@/lib/security";
import { createWorkspaceInvite } from "@/lib/workspace/invites";
import { memberRoles } from "@/lib/onboarding-schema";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const messages: Record<string, string> = {
  mismatch: "This invitation was sent to a different email address. Switch to the invited account to accept it.",
  expired: "This invitation has expired. Ask the workspace owner to send a new one.",
  used: "This invitation has already been used.",
  declined: "This invitation was declined.",
  revoked: "This invitation is no longer valid.",
  unavailable: "This invitation is unavailable.",
};

/** Accept/decline (by token, or by id for the signed-in recipient), or create an invite as a workspace owner. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Please log in." }, 401);
  if (!(await hasRequiredAssurance(supabase))) return json({ error: "Complete multi-factor authentication first." }, 403);
  if (!(await rateLimit(`invites:${user.id}`, 20, 60)) || !(await rateLimit(`invites-ip:${clientIp(request)}`, 60, 60))) return json({ error: "Too many attempts. Please wait a minute and try again." }, 429);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "Invalid invitation." }, 400);

  if ("token" in body || "inviteId" in body) {
    const token = typeof body.token === "string" ? body.token : null;
    const inviteId = typeof body.inviteId === "string" && /^[0-9a-f-]{36}$/i.test(body.inviteId) ? body.inviteId : null;
    if ((!token || !isTokenFormat(token)) && !inviteId) return json({ error: messages.unavailable }, 400);
    const { data, error } = await supabase.rpc("respond_to_invite", { p_token_hash: token ? hashToken(token) : null, p_invite_id: inviteId, p_accept: body.accept !== false } as never);
    if (error || !data) return json({ error: "Could not respond to this invitation. Please try again." }, 500);
    const result = data as { result: string; kind?: string };
    if (result.result === "accepted" || result.result === "already_member") return json({ result: result.result, next: `/${result.kind}` });
    if (result.result === "declined" && body.accept === false) return json({ result: "declined", next: "/continue" });
    return json({ error: messages[result.result] ?? messages.unavailable, result: result.result }, result.result === "mismatch" ? 403 : 410);
  }

  const role = memberRoles.find(r => r.value === body.role)?.value;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!role || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || typeof body.workspaceId !== "string") return json({ error: "Enter a valid email and role." }, 400);
  const { data: workspace } = await supabase.from("workspaces").select("id,onboarding_complete").eq("id", body.workspaceId).eq("owner_id", user.id).eq("status", "active").maybeSingle();
  if (!workspace) return json({ error: "Only workspace owners can invite members." }, 403);
  if (!workspace.onboarding_complete) return json({ error: "Finish setting up the workspace before inviting your team." }, 409);
  const created = await createWorkspaceInvite(supabase, workspace.id, email, role);
  if (!created.ok) return json({ error: created.error }, created.status);
  return json({ inviteUrl: `${new URL(request.url).origin}/invite/${created.token}` });
}
