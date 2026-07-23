import { requireWorkspace } from "@/lib/workspace";
import { getMemberDetail } from "../_data/member";
import { RolesSkillsClient } from "./RolesSkillsClient";

export const dynamic = "force-dynamic";

export default async function MemberRolesSkillsPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const { workspaceId } = await requireWorkspace();
  const member = await getMemberDetail(workspaceId, memberId);
  return <RolesSkillsClient member={member} />;
}
