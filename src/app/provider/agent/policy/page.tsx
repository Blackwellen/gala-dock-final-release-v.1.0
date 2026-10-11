import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { PolicyForm } from "@/components/agent/policy-form";
import "@/styles/marketplace.css";

export const metadata = { title: "Agent policy" };

/** Provider → Settings → Agent (§11). */
export default async function ProviderAgentPolicyPage() {
  const ctx = await getProvider();
  const [{ data: tools }, { data: policy }] = await Promise.all([ctx.db.from("agent_tools").select("id,title,risk,description").in("surface", ["provider", "both"]).lt("risk", 5).order("risk").order("title"), ctx.db.from("agent_policies").select("*").eq("workspace_id", ctx.workspace.id).maybeSingle()]);
  return <>
    <PageHeader title="Agent policy" subtitle="Decide what Gala Agent may do by itself. Your role permissions always apply." back={{ href: "/provider/agent", label: "Gala Agent" }} />
    <Panel><PolicyForm workspaceId={ctx.workspace.id} tools={tools ?? []} policy={policy} canEdit={ctx.role === "owner"} /></Panel>
  </>;
}
