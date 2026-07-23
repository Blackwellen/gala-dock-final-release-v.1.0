import { requireWorkspace } from "@/lib/workspace";
import { getTeamDirectoryMembers, getTeamWorkspaceData } from "../_data/queries";
import { InsightsClient } from "./InsightsClient";

export const dynamic = "force-dynamic";

export default async function TeamInsightsPage() {
  const { workspaceId } = await requireWorkspace();
  const [directory, { assignments }] = await Promise.all([
    getTeamDirectoryMembers(workspaceId),
    getTeamWorkspaceData(workspaceId),
  ]);
  return <InsightsClient directory={directory} assignments={assignments} />;
}
