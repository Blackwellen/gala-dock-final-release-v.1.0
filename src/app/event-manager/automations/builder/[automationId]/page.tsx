import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { requireWorkspace } from "@/lib/workspace";
import { getAutomation } from "@/lib/automations/data";
import { createClient } from "@/lib/supabase/server";
import { BuilderClient } from "./BuilderClient";

export const dynamic = "force-dynamic";

export default async function AutomationBuilderPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;
  const { workspaceId } = await requireWorkspace();

  if (automationId === "new") {
    return (
      <div className="animate-fade-in flex flex-col h-[calc(100vh-4rem)]">
        <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} className="shrink-0" />
        <BuilderClient automationId={null} initialName="Untitled automation" initialStatus="draft" initialVersion={1} initialDefinition={{ nodes: [], edges: [] }} />
      </div>
    );
  }

  const automation = await getAutomation(workspaceId, automationId);
  if (!automation) notFound();

  const supabase = await createClient();
  const { data: full } = await supabase
    .from("smart_rules")
    .select("definition_json, draft_definition_json")
    .eq("id", automationId)
    .single();

  const definition = (full?.draft_definition_json ?? full?.definition_json ?? { nodes: [], edges: [] }) as {
    nodes: unknown[];
    edges: unknown[];
  };

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} className="shrink-0" />
      <BuilderClient
        automationId={automation.id}
        initialName={automation.name}
        initialStatus={automation.status}
        initialVersion={automation.version}
        initialDefinition={definition.nodes ? (definition as { nodes: never[]; edges: never[] }) : { nodes: [], edges: [] }}
      />
    </div>
  );
}
