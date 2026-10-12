import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireRole, listWorkspaceAccess } from "@/lib/auth";
import { untyped, one, type Db } from "@/lib/workspace/db";
import { enforceWorkspaceMfa } from "@/lib/mfa/policy";

export type ProviderWorkspace = {
  id: string; name: string; capabilities: ("venue" | "service")[]; plan: string; commission_bps: number;
  verification_status: string; payout_status: string; cover_image: string; settings: Record<string, unknown>;
};
export type ProviderContext = {
  db: Db; userId: string; userName: string; userAvatar: string; role: string; workspace: ProviderWorkspace;
  workspaces: { id: string; name: string }[];
  /** Every active workspace the user belongs to (any kind), for the top-bar switcher. */
  allWorkspaces: { id: string; name: string; kind: string; role: string }[];
  can: { manage: boolean; finance: boolean };
};

/**
 * Resolves the signed-in user's active Provider workspace. Authorisation comes from requireRole (server-side
 * membership check); every query afterwards runs through the user's RLS-scoped client, never the service role.
 */
export const PROVIDER_WS_COOKIE = "gd_provider_ws";

export const getProvider = cache(async (): Promise<ProviderContext> => {
  const { supabase, user, aal, workspace: fallback } = await requireRole("provider");
  if (!fallback) redirect("/onboarding/provider?step=1");
  const db = untyped(supabase);
  // Selection order: last used (remember_workspace, updated by every switcher in every shell) → Provider cookie → requireRole default. Every candidate is validated against
  // the server's membership list, so a forged cookie can only ever select a workspace the user already holds.
  const [access, profile, jar] = await Promise.all([
    listWorkspaceAccess(supabase),
    one<{ full_name: string; avatar_url: string; last_workspace_id: string | null }>(db.from("profiles").select("full_name,avatar_url,last_workspace_id").eq("id", user.id).maybeSingle()),
    cookies(),
  ]);
  const usable = access.filter(w => w.kind === "provider" && w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete);
  const wanted = jar.get(PROVIDER_WS_COOKIE)?.value;
  const workspace = usable.find(w => w.id === profile?.last_workspace_id) ?? usable.find(w => w.id === wanted) ?? fallback;
  const ws = await one<ProviderWorkspace>(db.from("workspaces").select("id,name,capabilities,plan,commission_bps,verification_status,payout_status,cover_image,settings").eq("id", workspace.id).maybeSingle());
  if (!ws) redirect("/access?reason=denied");
  enforceWorkspaceMfa({ settings: ws.settings, role: workspace.role, aal, workspaceName: ws.name, next: "/provider" });
  return {
    db, userId: user.id, role: workspace.role, workspaces: usable.map(w => ({ id: w.id, name: w.name })),
    allWorkspaces: access.filter(w => w.member_status === "active" && w.workspace_status === "active").map(w => ({ id: w.id, name: w.name, kind: w.kind, role: w.role })),
    userName: profile?.full_name || user.email?.split("@")[0] || "there",
    userAvatar: profile?.avatar_url ?? "",
    workspace: { ...ws, capabilities: (ws.capabilities ?? []) as ProviderWorkspace["capabilities"] },
    can: { manage: ["owner", "manager"].includes(workspace.role), finance: ["owner", "manager", "finance"].includes(workspace.role) },
  };
});

export const capabilityLabel = (caps: string[]) =>
  caps.includes("venue") && caps.includes("service") ? "Venue + Services" : caps.includes("venue") ? "Venue" : caps.includes("service") ? "Services" : "Provider";
