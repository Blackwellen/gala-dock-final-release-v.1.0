import { requireWorkspace } from "@/lib/workspace";
import { getTeamWorkspaceData } from "../_data/queries";
import { TeamWorkloadClient } from "./TeamWorkloadClient";

export const dynamic = "force-dynamic";

export default async function TeamWorkloadPage() {
  const { workspaceId } = await requireWorkspace();
  const data = await getTeamWorkspaceData(workspaceId);
  return <TeamWorkloadClient {...data} />;
}
