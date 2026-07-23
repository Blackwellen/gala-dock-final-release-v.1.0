import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { NewLeadWizard, type MemberOption } from "./NewLeadWizard";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const nameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    for (const p of profiles ?? []) {
      if (p.display_name) nameById.set(p.user_id, p.display_name);
    }
  }

  const teamMembers: MemberOption[] = memberIds.map((id) => ({
    id,
    name: nameById.get(id) ?? "Team member",
  }));

  return <NewLeadWizard teamMembers={teamMembers} />;
}
