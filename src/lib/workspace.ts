import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { Workspace } from "@/lib/supabase/types";

/**
 * Server-side workspace resolution helpers.
 *
 * All authenticated app pages should resolve the active workspace through these
 * helpers. RLS on the live database already scopes every query to workspaces the
 * user is a member of; we additionally filter by the resolved active workspace so
 * a user with multiple workspaces sees the correct one.
 */

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Resolve the active workspace id for the current user, or null if none. */
export async function getActiveWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Prefer the explicitly chosen active workspace on the profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_workspace_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.active_workspace_id) return profile.active_workspace_id;

  // Fall back to the first workspace the user belongs to.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.workspace_id ?? null;
}

export interface WorkspaceContext {
  user: User;
  workspaceId: string;
  workspace: Workspace;
}

/**
 * Require an authenticated user with an active workspace. Redirects to /login
 * when unauthenticated and /onboarding when the user has no workspace yet.
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/operator/login");

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) redirect("/onboarding");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!workspace) redirect("/onboarding");

  return { user, workspaceId, workspace };
}

/** Roles allowed to manage Workspace + Billing settings (3-settings model). */
const MANAGER_ROLES = ["owner", "admin", "manager"] as const;

/**
 * The current user's role in the active workspace, or null if not a member.
 */
export async function getWorkspaceRole(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  return member?.role ?? null;
}

/** Whether the current user can manage Workspace + Billing settings. */
export async function canManageWorkspace(): Promise<boolean> {
  const role = await getWorkspaceRole();
  return role != null && (MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * Require the current user to be a workspace manager (owner/admin/manager).
 * Redirects members without management rights back to their account settings.
 */
export async function requireWorkspaceManager(): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  if (!(await canManageWorkspace())) redirect("/event-manager/settings/account");
  return ctx;
}

/**
 * Require the active workspace to be a given persona (workspace_type). Redirects
 * to /event-manager/home when the logged-in workspace is the wrong persona — e.g.
 * an organizer hitting a venue-persona-only page. Composes on top of requireWorkspace()
 * the same way requireWorkspaceManager() does, rather than a separate auth model.
 */
async function requireWorkspaceType(type: "venue" | "supplier"): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  if (ctx.workspace.workspace_type !== type) redirect("/event-manager/home");
  return ctx;
}

/** Require the active workspace to be a venue-persona workspace. */
export async function requireVenueAccount(): Promise<WorkspaceContext> {
  return requireWorkspaceType("venue");
}

/** Require the active workspace to be a supplier-persona workspace. */
export async function requireSupplierAccount(): Promise<WorkspaceContext> {
  return requireWorkspaceType("supplier");
}
