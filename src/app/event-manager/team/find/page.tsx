import { requireWorkspace } from "@/lib/workspace";
import { getTeamDirectoryMembers, getTeamWorkspaceData } from "../_data/queries";
import { FindTeamClient } from "./FindTeamClient";

export const dynamic = "force-dynamic";

export default async function FindTeamPage() {
  const { workspaceId } = await requireWorkspace();
  const [directory, { assignments }] = await Promise.all([
    getTeamDirectoryMembers(workspaceId),
    getTeamWorkspaceData(workspaceId),
  ]);
  return <FindTeamClient directory={directory} assignments={assignments} />;
}
