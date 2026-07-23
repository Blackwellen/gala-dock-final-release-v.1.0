import { requireWorkspace } from "@/lib/workspace";
import { getTeamWorkspaceData } from "../_data/queries";
import { TeamAvailabilityClient } from "./TeamAvailabilityClient";

export const dynamic = "force-dynamic";

export default async function TeamAvailabilityPage() {
  const { workspaceId } = await requireWorkspace();
  const data = await getTeamWorkspaceData(workspaceId);
  return <TeamAvailabilityClient {...data} />;
}
