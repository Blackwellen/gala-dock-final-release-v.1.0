import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { safeNext } from "./redirects";
import type { Role } from "./routes";

export { safeNext };

export type WorkspaceAccess = {
  id: string; name: string; kind: "organizer" | "provider"; role: string;
  member_status: string; workspace_status: string; onboarding_complete: boolean;
};

/** Requires a signed-in user who has satisfied any MFA requirement. */
export async function requireUser(next?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const returnTo = next ? `?next=${encodeURIComponent(next)}` : "";
  if (error || !data.user) redirect(`/login${returnTo}`);
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) redirect(`/login${returnTo}`);
  if (assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2") redirect(`/mfa${returnTo}`);
  return { supabase, user: data.user, aal: assurance.data.currentLevel };
}

export async function getOptionalUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function listWorkspaceAccess(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("my_workspace_access");
  return (data ?? []) as WorkspaceAccess[];
}

const isUsable = (w: WorkspaceAccess) => w.member_status === "active" && w.workspace_status === "active";

/**
 * Destination precedence after authentication:
 * explicit/pending intent → last authorised workspace → unfinished onboarding → /discover.
 */
export async function getDestination(next?: string | null) {
  const explicit = safeNext(next, "");
  if (explicit && explicit !== "/continue") return explicit;
  const { supabase, user } = await requireUser();
  const { data: admin } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (admin) return "/admin";
  const [{ data: profile }, workspaces, { data: invites }] = await Promise.all([
    supabase.from("profiles").select("onboarding_complete,last_workspace_id").eq("id", user.id).maybeSingle(),
    listWorkspaceAccess(supabase),
    supabase.rpc("my_pending_invites"),
  ]);
  if (invites?.length) return "/onboarding";
  const last = workspaces.find(w => w.id === profile?.last_workspace_id && isUsable(w) && w.onboarding_complete);
  if (last) return `/${last.kind}`;
  const active = workspaces.find(w => isUsable(w) && w.onboarding_complete);
  if (active) return `/${active.kind}`;
  const draft = workspaces.find(w => isUsable(w) && w.role === "owner" && !w.onboarding_complete);
  if (draft) return `/onboarding/${draft.kind}?step=1`;
  return profile?.onboarding_complete ? "/discover" : "/onboarding";
}

/** Server-side workspace authorisation. Never trusts client-supplied workspace IDs. */
export async function requireRole(role: Role) {
  const session = await requireUser(`/${role === "customer" ? "discover" : role}`);
  if (role === "customer") return { ...session, workspace: null };
  if (role === "admin") {
    const { data } = await session.supabase.from("platform_admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (!data) redirect("/access?reason=insufficient");
    // Platform Admin always requires a verified second factor.
    if (session.aal !== "aal2") redirect("/mfa?next=%2Fadmin&required=1");
    return { ...session, workspace: null };
  }
  const [all, { data: profile }] = await Promise.all([
    listWorkspaceAccess(session.supabase),
    session.supabase.from("profiles").select("last_workspace_id").eq("id", session.user.id).maybeSingle(),
  ]);
  const access = all.filter(w => w.kind === role);
  const candidates = access.filter(w => isUsable(w) && w.onboarding_complete);
  // Prefer the last workspace the user opened so switching sticks; otherwise the newest usable one.
  const usable = candidates.find(w => w.id === profile?.last_workspace_id) ?? candidates[0];
  if (usable) {
    if (usable.id !== profile?.last_workspace_id) await session.supabase.rpc("remember_workspace", { p_workspace: usable.id });
    return { ...session, workspace: usable };
  }
  if (access.some(w => w.workspace_status === "suspended" || w.member_status === "suspended")) redirect("/access?reason=suspended");
  if (access.some(w => w.member_status === "revoked")) redirect("/access?reason=revoked");
  if (!access.length || access.some(w => isUsable(w) && w.role === "owner")) redirect(`/onboarding/${role}?step=1`);
  redirect("/access?reason=denied");
}
