import { requireWorkspace } from "@/lib/workspace";
import { getMemberDetail } from "../_data/member";
import { getTeamWorkspaceData } from "../../../_data/queries";
import { ScheduleClient } from "./ScheduleClient";

export const dynamic = "force-dynamic";

export default async function MemberSchedulePage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const { workspaceId } = await requireWorkspace();
  const [member, { assignments, availability }] = await Promise.all([
    getMemberDetail(workspaceId, memberId),
    getTeamWorkspaceData(workspaceId),
  ]);
  return (
    <ScheduleClient
      member={member}
      assignments={assignments.filter((a) => a.userId === memberId && a.status !== "declined")}
      availability={availability.filter((b) => b.userId === memberId)}
    />
  );
}
