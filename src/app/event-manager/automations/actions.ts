"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceManager, requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { RECIPES_BY_ID } from "@/lib/automations/recipes";

const BASE = "/event-manager/automations";

/** Instantiate a recipe as a new review-first draft automation. */
export async function applyRecipe(recipeId: string): Promise<{ ok: boolean; error?: string; automationId?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const recipe = RECIPES_BY_ID[recipeId];
  if (!recipe) return { ok: false, error: "Unknown recipe" };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("smart_rules")
    .insert({
      workspace_id: workspaceId,
      name: recipe.name,
      description: recipe.description,
      trigger_kind: recipe.liveTrigger,
      action_kind: recipe.liveAction,
      conditions: [],
      created_by: user.id,
      owner_user_id: user.id,
      enabled: false,
      dry_run: true,
      status: "draft",
      module: recipe.group.toLowerCase(),
      complexity: recipe.complexity,
      recipe_id: recipe.id,
      tags: [recipe.group],
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await supabase.from("automation_recipe_usage").insert({
    workspace_id: workspaceId,
    recipe_id: recipe.id,
    automation_id: data.id,
    actor_id: user.id,
  });

  revalidatePath(BASE);
  revalidatePath(`${BASE}/recipes`);
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true, automationId: data.id };
}

export async function toggleFavouriteRecipe(recipeId: string, favourited: boolean): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  if (favourited) {
    const { error } = await supabase.from("automation_recipe_favourites").insert({ workspace_id: workspaceId, user_id: user.id, recipe_id: recipeId });
    if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("automation_recipe_favourites")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("recipe_id", recipeId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(`${BASE}/recipes`);
  return { ok: true };
}

/** Create a blank draft automation for the Canvas Builder. */
export async function createDraftAutomation(name: string): Promise<{ ok: boolean; error?: string; automationId?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("smart_rules")
    .insert({
      workspace_id: workspaceId,
      name: name.trim() || "Untitled automation",
      trigger_kind: "nightly_cron",
      action_kind: "notify_user",
      conditions: [],
      created_by: user.id,
      owner_user_id: user.id,
      enabled: false,
      dry_run: true,
      status: "draft",
      module: "operations",
      definition_json: { nodes: [], edges: [] },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true, automationId: data.id };
}

/** Save the canvas definition as the automation's draft. */
export async function saveAutomationDraft(automationId: string, definition: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("smart_rules")
    .update({ draft_definition_json: definition as never, status: "draft" })
    .eq("id", automationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/builder/${automationId}`);
  return { ok: true };
}

/** Publish the draft definition, creating a new immutable version and requesting review. */
export async function publishAutomationForReview(automationId: string, definition: unknown, changeSummary: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("automation_versions").select("version_number").eq("automation_id", automationId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (existing?.version_number ?? 0) + 1;

  const { error: vErr } = await supabase.from("automation_versions").insert({
    workspace_id: workspaceId,
    automation_id: automationId,
    version_number: nextVersion,
    definition_json: definition as never,
    change_summary: changeSummary || null,
    status: "review_requested",
    created_by: user.id,
  });
  if (vErr) return { ok: false, error: vErr.message };

  const { error } = await supabase.from("smart_rules").update({ status: "review_requested", definition_json: definition as never, version: nextVersion }).eq("id", automationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`${BASE}/builder/${automationId}`);
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true };
}

export async function pauseAutomation(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rules").update({ status: "paused", enabled: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true };
}

export async function activateAutomation(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rules").update({ status: "active", enabled: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true };
}

export async function archiveAutomation(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rules").update({ status: "archived", enabled: false, archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true };
}

export async function duplicateAutomation(id: string): Promise<{ ok: boolean; error?: string; automationId?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();
  const { data: src } = await supabase.from("smart_rules").select("*").eq("id", id).single();
  if (!src) return { ok: false, error: "Automation not found" };
  const { data, error } = await supabase
    .from("smart_rules")
    .insert({
      workspace_id: workspaceId,
      name: `${src.name} (copy)`,
      description: src.description,
      trigger_kind: src.trigger_kind,
      action_kind: src.action_kind,
      trigger_params: src.trigger_params,
      action_params: src.action_params,
      conditions: src.conditions,
      created_by: user.id,
      owner_user_id: user.id,
      enabled: false,
      dry_run: true,
      status: "draft",
      module: src.module,
      environment: src.environment,
      tags: src.tags,
      complexity: src.complexity,
      definition_json: src.definition_json,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/my-automations`);
  return { ok: true, automationId: data.id };
}

// ─── Runs ───────────────────────────────────────────────────────────────

export async function retryRun(runId: string): Promise<{ ok: boolean; error?: string; newRunId?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();
  const { data: original } = await supabase.from("smart_rule_runs").select("*").eq("id", runId).single();
  if (!original) return { ok: false, error: "Run not found" };
  const { data, error } = await supabase
    .from("smart_rule_runs")
    .insert({
      rule_id: original.rule_id,
      workspace_id: workspaceId,
      mode: "manual_test",
      status: "queued",
      matched_count: 0,
      fired_count: 0,
      skipped_dedupe_count: 0,
      trigger_source: "manual",
      environment: original.environment,
      initiated_by: user.id,
      payload: original.payload,
      retry_of_run_id: runId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/runs`);
  return { ok: true, newRunId: data.id };
}

export async function replayRun(runId: string): Promise<{ ok: boolean; error?: string; newRunId?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();
  const { data: original } = await supabase.from("smart_rule_runs").select("*").eq("id", runId).single();
  if (!original) return { ok: false, error: "Run not found" };
  const { data, error } = await supabase
    .from("smart_rule_runs")
    .insert({
      rule_id: original.rule_id,
      workspace_id: workspaceId,
      mode: "manual_test",
      status: "queued",
      matched_count: 0,
      fired_count: 0,
      skipped_dedupe_count: 0,
      trigger_source: "manual",
      environment: original.environment,
      initiated_by: user.id,
      payload: original.payload,
      replay_of_run_id: runId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/runs`);
  return { ok: true, newRunId: data.id };
}

export async function cancelRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rule_runs").update({ status: "cancelled" }).eq("id", runId).in("status", ["queued", "running", "waiting_approval"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/runs`);
  return { ok: true };
}

// ─── Approvals ────────────────────────────────────────────────────────────

export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected" | "changes_requested"
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("approval_requests")
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/approvals`);
  return { ok: true };
}

export async function assignApprovalReviewer(approvalId: string, reviewerId: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("approval_requests").update({ reviewer_id: reviewerId }).eq("id", approvalId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/approvals`);
  return { ok: true };
}

export async function addApprovalComment(approvalId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, user } = await requireWorkspace();
  if (!body.trim()) return { ok: false, error: "Comment cannot be empty" };
  const supabase = await createClient();
  const { error } = await supabase.from("approval_comments").insert({ workspace_id: workspaceId, approval_id: approvalId, author_id: user.id, body: body.trim() });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/approvals`);
  return { ok: true };
}

// ─── Errors ───────────────────────────────────────────────────────────────

export async function resolveErrorIncident(incidentId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("automation_error_incidents")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq("id", incidentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/errors`);
  return { ok: true };
}

export async function assignErrorIncident(incidentId: string, ownerId: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("automation_error_incidents").update({ owner_id: ownerId, status: "investigating" }).eq("id", incidentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/errors`);
  return { ok: true };
}

// ─── Integrations ─────────────────────────────────────────────────────────

export async function disconnectIntegration(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("integration_connections").update({ status: "disconnected", connected_at: null }).eq("id", connectionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${BASE}/integrations`);
  return { ok: true };
}
