import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { enforceWorkspaceMfa } from "@/lib/mfa/policy";
import { requireUser, listWorkspaceAccess, type WorkspaceAccess } from "@/lib/auth";

export type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Customer surface: any signed-in user. Cached per request. */
export const getCustomer = cache(async (next = "/discover") => {
  const { supabase, user } = await requireUser(next);
  const [{ data: profile }, { count: unread }, { data: notes }] = await Promise.all([
    supabase.from("profiles").select("full_name,home_area,currency,interests,notifications,avatar_url,onboarding_complete").eq("id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    supabase.from("notifications").select("id,title,body,link,read_at,created_at,kind").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
  ]);
  const name = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || user.email?.split("@")[0] || "Guest";
  return { supabase, user, profile, name, unread: unread ?? 0, notifications: notes ?? [] };
});

const usable = (w: WorkspaceAccess) => w.kind === "organizer" && w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete;

/** Organizer surface: requires an active organizer workspace membership. Prefers the last opened workspace. */
export const getOrganizer = cache(async (next = "/organizer") => {
  const { supabase, user, aal } = await requireUser(next);
  const access = await listWorkspaceAccess(supabase);
  const { data: profile } = await supabase.from("profiles").select("full_name,last_workspace_id,avatar_url").eq("id", user.id).maybeSingle();
  const organizerWs = access.filter(usable);
  const ws = organizerWs.find(w => w.id === profile?.last_workspace_id) ?? organizerWs[0];
  if (!ws) {
    if (access.some(w => w.kind === "organizer" && w.role === "owner" && !w.onboarding_complete)) redirect("/onboarding/organizer?step=1");
    if (access.some(w => w.kind === "organizer" && (w.member_status !== "active" || w.workspace_status !== "active"))) redirect("/access?reason=suspended");
    redirect("/onboarding/organizer?step=1");
  }
  if (profile?.last_workspace_id !== ws.id) await supabase.rpc("remember_workspace", { p_workspace: ws.id });
  const [{ data: workspace }, { count: unread }, { data: notes }] = await Promise.all([
    supabase.from("workspaces").select("id,name,settings,verification_status,payout_status,stripe_account_id,cover_image").eq("id", ws.id).single(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    supabase.from("notifications").select("id,title,body,link,read_at,created_at,kind").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
  ]);
  enforceWorkspaceMfa({ settings: workspace?.settings, role: ws.role, aal, workspaceName: ws.name, next });
  const name = profile?.full_name || user.email?.split("@")[0] || "Organizer";
  const canMoney = ["owner", "manager", "finance"].includes(ws.role);
  return { supabase, user, name, avatar: (profile?.avatar_url as string | null | undefined) ?? null, role: ws.role, canMoney, workspace: { ...ws, ...(workspace ?? {}) }, workspaces: access.filter(w => w.member_status === "active"), unread: unread ?? 0, notifications: notes ?? [] };
});
export type OrganizerCtx = Awaited<ReturnType<typeof getOrganizer>>;
export type CustomerCtx = Awaited<ReturnType<typeof getCustomer>>;
