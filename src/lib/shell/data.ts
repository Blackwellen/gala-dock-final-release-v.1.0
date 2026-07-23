import { createClient } from "@/lib/supabase/server";
import type { WorkspaceType } from "@/lib/flags/registry";

export interface ShellWorkspace {
  id: string;
  name: string;
  type: WorkspaceType;
}

export interface ShellNotification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: string;
  category: string;
  createdAt: string;
  read: boolean;
}

export interface ShellData {
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  notifications: ShellNotification[];
  unreadCount: number;
  userInitials: string;
  userEmail: string;
  sidebarCollapsed: boolean;
}

function initials(name: string | null, email: string): string {
  const src = (name ?? "").trim() || email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || src.slice(0, 2)).toUpperCase();
}

/**
 * Resolve the data the app shell needs once per layout render:
 * the user's workspaces (for the switcher), recent notifications, and avatar info.
 * All reads are RLS-scoped to the signed-in user.
 */
export async function getShellData(): Promise<ShellData> {
  const empty: ShellData = {
    workspaces: [],
    activeWorkspaceId: null,
    notifications: [],
    unreadCount: 0,
    userInitials: "GD",
    userEmail: "",
    sidebarCollapsed: false,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const [{ data: profile }, { data: members }, { data: notifs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("active_workspace_id, display_name, sidebar_collapsed")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspace:workspaces(id, name, workspace_type)")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("notifications")
      .select("id, title, body, link, severity, category, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const workspaces: ShellWorkspace[] = (members ?? [])
    .map((m) => {
      const w = m.workspace as unknown as { id: string; name: string; workspace_type: string } | null;
      return w ? { id: w.id, name: w.name, type: (w.workspace_type as WorkspaceType) ?? "organizer" } : null;
    })
    .filter((w): w is ShellWorkspace => w !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const notifications: ShellNotification[] = (notifs ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    severity: n.severity,
    category: n.category,
    createdAt: n.created_at,
    read: n.read_at != null,
  }));

  return {
    workspaces,
    activeWorkspaceId: profile?.active_workspace_id ?? workspaces[0]?.id ?? null,
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    userInitials: initials(profile?.display_name ?? null, user.email ?? ""),
    userEmail: user.email ?? "",
    sidebarCollapsed: profile?.sidebar_collapsed ?? false,
  };
}
