import { requireWorkspace } from "@/lib/workspace";
import { getMemberDetail } from "../_data/member";
import { getTeamWorkspaceData } from "../../../_data/queries";
import { OverviewClient } from "./OverviewClient";

export const dynamic = "force-dynamic";

export default async function MemberOverviewPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const { workspaceId } = await requireWorkspace();
  const [member, { assignments }] = await Promise.all([
    getMemberDetail(workspaceId, memberId),
    getTeamWorkspaceData(workspaceId),
  ]);
  const myAssignments = assignments.filter((a) => a.userId === memberId && a.status !== "declined");
  return <OverviewClient member={member} assignments={myAssignments} />;
}
