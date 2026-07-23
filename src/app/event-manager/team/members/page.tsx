import { requireWorkspace } from "@/lib/workspace";
import { getTeamWorkspaceData, getTeamDirectoryMembers } from "../_data/queries";
import { TeamMembersClient } from "./TeamMembersClient";

export const dynamic = "force-dynamic";

export default async function TeamMembersPage() {
  const { workspaceId } = await requireWorkspace();
  const [{ assignments, availability }, directory] = await Promise.all([
    getTeamWorkspaceData(workspaceId),
    getTeamDirectoryMembers(workspaceId),
  ]);
  return <TeamMembersClient directory={directory} assignments={assignments} availability={availability} />;
}
