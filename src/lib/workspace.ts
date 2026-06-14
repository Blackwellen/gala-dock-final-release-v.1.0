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
  if (!user) redirect("/login");

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
