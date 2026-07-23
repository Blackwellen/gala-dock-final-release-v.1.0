"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Switch the active workspace for the current user.
 * Verifies membership before writing profiles.active_workspace_id, then
 * revalidates the app shell so persona/flags/nav refresh cleanly.
 */
export async function switchWorkspace(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Security: only switch to a workspace the user actually belongs to.
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace:workspaces(workspace_type)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  const workspaceType = (member?.workspace as unknown as { workspace_type?: string } | null)?.workspace_type;
  if (!member || !["organizer", "venue", "supplier"].includes(workspaceType ?? "")) {
    return { ok: false, error: "No access to that workspace" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active_workspace_id: workspaceId })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/organizer", "layout");
  revalidatePath("/venue", "layout");
  revalidatePath("/supplier", "layout");
  redirect(`/${workspaceType}/home?workspace=${workspaceId}`);
}

/** Persist the floating shell's sidebar collapse preference for the current user. */
export async function setSidebarCollapsed(collapsed: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase
    .from("profiles")
    .update({ sidebar_collapsed: collapsed })
    .eq("user_id", user.id);

  return { ok: true };
}

/** Mark a single notification read for the current user. */
export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/event-manager", "layout");
  return { ok: true };
}

/** Mark every unread notification read for the current user. */
export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/event-manager", "layout");
  return { ok: true };
}
