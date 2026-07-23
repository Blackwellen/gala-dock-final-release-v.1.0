"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const BASE = "/event-manager/automations";

/**
 * Manually re-run the automation an error incident belongs to, using the same
 * insert shape as retryRun() in ../actions.ts (that file is owned by another
 * agent so this is a local, incident-scoped equivalent rather than an import
 * of a function that doesn't exist there). Looks up the incident's automation
 * and queues a fresh manual-test run for it.
 */
export async function retryFromIncident(incidentId: string): Promise<{ ok: boolean; error?: string; newRunId?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: incident } = await supabase
    .from("automation_error_incidents")
    .select("automation_id")
    .eq("id", incidentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!incident?.automation_id) return { ok: false, error: "This incident has no linked automation to retry" };

  const { data: rule } = await supabase.from("smart_rules").select("environment").eq("id", incident.automation_id).maybeSingle();
  if (!rule) return { ok: false, error: "Automation not found" };

  const { data, error } = await supabase
    .from("smart_rule_runs")
    .insert({
      rule_id: incident.automation_id,
      workspace_id: workspaceId,
      mode: "manual_test",
      status: "queued",
      matched_count: 0,
      fired_count: 0,
      skipped_dedupe_count: 0,
      trigger_source: "manual",
      environment: rule.environment,
      initiated_by: user.id,
      payload: {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`${BASE}/errors`);
  revalidatePath(`${BASE}/runs`);
  return { ok: true, newRunId: data.id };
}
