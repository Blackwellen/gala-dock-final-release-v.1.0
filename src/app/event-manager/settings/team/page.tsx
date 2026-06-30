import { Users } from "lucide-react";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { TeamClient, type MemberRow } from "./TeamClient";

export const metadata = { title: "Team Settings" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function TeamSettingsPage() {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, joined_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });

  const rows = memberRows ?? [];

  // Resolve display names from profiles.
  const userIds = rows.map((r) => r.user_id);
  const nameByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      if (p.display_name) nameByUserId.set(p.user_id, p.display_name);
    }
  }

  const members: MemberRow[] = rows.map((r) => ({
    id: r.id,
    name: nameByUserId.get(r.user_id) ?? "Workspace member",
    role: r.role,
    joined: formatDate(r.joined_at ?? r.created_at),
    isCurrent: r.user_id === user.id,
  }));

  return (
    <SettingsShell title="Team" description="Invite members and manage roles within your workspace.">
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Members of this workspace will appear here once they are added."
        />
      ) : (
        <TeamClient members={members} />
      )}
    </SettingsShell>
  );
}
