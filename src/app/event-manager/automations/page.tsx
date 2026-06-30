import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";
import { RECIPES } from "@/lib/automations/recipes";
import { AUTOMATION_NODES } from "@/lib/automations/nodes";
import { AutomationsClient } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const { workspaceId, flags } = await getPersonaContext();

  if (!flags.automationsBuilder) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Automations" description="Trigger-condition-action workflows for your operation" />
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-surface-200 bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Automations</h2>
          <p className="text-sm text-surface-500 mb-5">{upgradeMessage("business")}</p>
          <Link href="/event-manager/settings/billing" className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            View plans
          </Link>
        </div>
      </div>
    );
  }

  let myRules: { id: string; name: string; enabled: boolean; trigger: string; action: string }[] = [];
  if (workspaceId) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("smart_rules")
        .select("id, name, enabled, trigger_kind, action_kind")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      myRules = (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        trigger: r.trigger_kind,
        action: r.action_kind,
      }));
    } catch {
      myRules = [];
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Automations"
        description="Start from a recipe or build your own with triggers, conditions and actions"
      />
      <AutomationsClient recipes={RECIPES} nodes={AUTOMATION_NODES} myRules={myRules} />
    </div>
  );
}
