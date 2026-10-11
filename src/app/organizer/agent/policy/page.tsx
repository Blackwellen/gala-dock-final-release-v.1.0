import { getOrganizer } from "@/lib/data/context";
import { PageHead } from "@/components/kit";
import { PolicyForm } from "@/components/agent/policy-form";
import { untyped } from "@/lib/workspace/db";
import "@/styles/marketplace.css";

export const metadata = { title: "Agent policy" };

/** Organizer → Settings → Agent (§11): what Gala Agent may do on its own in this workspace. */
export default async function OrganizerAgentPolicyPage() {
  const ctx = await getOrganizer("/organizer/agent/policy");
  const db = untyped(ctx.supabase as never);
  const [{ data: tools }, { data: policy }] = await Promise.all([db.from("agent_tools").select("id,title,risk,description").in("surface", ["organizer", "both"]).lt("risk", 5).order("risk").order("title"), db.from("agent_policies").select("*").eq("workspace_id", ctx.workspace.id).maybeSingle()]);
  return <div className="k-col" style={{ gap: 16, maxWidth: 980 }}>
    <PageHead crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Gala Agent", href: "/organizer/agent" }, { label: "Policy" }]} title="Agent policy" sub="Decide what Gala Agent may do by itself. Your role permissions always apply — the Agent can never do more than the person who asked." />
    <section className="mk-card"><PolicyForm workspaceId={ctx.workspace.id} tools={tools ?? []} policy={policy} canEdit={ctx.role === "owner"} /></section>
  </div>;
}
