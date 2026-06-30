import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SmartRulesClient, type SmartRuleRow } from "./SmartRulesClient";

export const metadata = { title: "Smart Rules" };
export const dynamic = "force-dynamic";

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function SmartRulesPage() {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data } = await supabase
    .from("smart_rules")
    .select("id, name, trigger_kind, action_kind, enabled, dry_run, last_fired_at, fire_count")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rules: SmartRuleRow[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    trigger: r.trigger_kind,
    action: r.action_kind,
    enabled: r.enabled,
    dryRun: r.dry_run,
    lastFired: fmt(r.last_fired_at),
    fireCount: r.fire_count,
  }));

  return (
    <SettingsShell
      title="Smart Rules"
      description="Automate actions based on triggers in your workspace."
    >
      <SmartRulesClient initialRules={rules} />
    </SettingsShell>
  );
}
