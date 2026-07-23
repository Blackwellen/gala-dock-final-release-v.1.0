// Gala Dock — Automations platform data layer.
// All queries are workspace-scoped server-side reads against the live
// smart_rules engine + the automation_* tables added in
// supabase/migrations/20260714_automations_platform.sql. No mock data —
// every function returns what's actually in Supabase for the caller's
// workspace, backed by RLS via public.is_workspace_member().
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TRIGGER_LABEL, ACTION_LABEL } from "@/lib/automations/smart-rules";

export type AutomationStatus =
  | "draft" | "review_requested" | "approved" | "published"
  | "active" | "paused" | "archived" | "disabled" | "invalid";

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  module: string;
  environment: string;
  tags: string[];
  complexity: string;
  recipeId: string | null;
  triggerKind: string;
  actionKind: string;
  triggerLabel: string;
  actionLabel: string;
  enabled: boolean;
  fireCount: number;
  lastFiredAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string | null;
}

function mapAutomation(r: Record<string, unknown>): AutomationRow {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    status: (r.status as AutomationStatus) ?? "draft",
    module: (r.module as string) ?? "operations",
    environment: (r.environment as string) ?? "production",
    tags: (r.tags as string[]) ?? [],
    complexity: (r.complexity as string) ?? "easy",
    recipeId: (r.recipe_id as string) ?? null,
    triggerKind: r.trigger_kind as string,
    actionKind: r.action_kind as string,
    triggerLabel: TRIGGER_LABEL[r.trigger_kind as string] ?? (r.trigger_kind as string),
    actionLabel: ACTION_LABEL[r.action_kind as string] ?? (r.action_kind as string),
    enabled: Boolean(r.enabled),
    fireCount: (r.fire_count as number) ?? 0,
    lastFiredAt: (r.last_fired_at as string) ?? null,
    version: (r.version as number) ?? 1,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    ownerUserId: (r.owner_user_id as string) ?? null,
  };
}

const AUTOMATION_COLUMNS =
  "id, name, description, status, module, environment, tags, complexity, recipe_id, trigger_kind, action_kind, enabled, dry_run, fire_count, last_fired_at, version, created_at, updated_at, owner_user_id, definition_json";

export async function listAutomations(workspaceId: string, opts?: { status?: string; module?: string; search?: string }) {
  const supabase = await createClient();
  let q = supabase
    .from("smart_rules")
    .select(AUTOMATION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts?.module && opts.module !== "all") q = q.eq("module", opts.module);
  if (opts?.search) q = q.ilike("name", `%${opts.search}%`);
  const { data } = await q;
  return (data ?? []).map(mapAutomation);
}

export async function getAutomation(workspaceId: string, automationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("smart_rules")
    .select(AUTOMATION_COLUMNS + ", definition_json, draft_definition_json")
    .eq("workspace_id", workspaceId)
    .eq("id", automationId)
    .maybeSingle();
  return data ? mapAutomation(data as unknown as Record<string, unknown>) : null;
}

export interface OverviewMetrics {
  total: number;
  active: number;
  drafts: number;
  successRate: number;
  runsToday: number;
  pendingApprovals: number;
}

export async function getOverviewMetrics(workspaceId: string): Promise<OverviewMetrics> {
  const supabase = await createClient();
  const [rulesRes, runsTodayRes, runsAllRes, approvalsRes] = await Promise.all([
    supabase.from("smart_rules").select("status", { count: "exact" }).eq("workspace_id", workspaceId).is("deleted_at", null),
    supabase
      .from("smart_rule_runs")
      .select("status", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .gte("ts", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    supabase.from("smart_rule_runs").select("status").eq("workspace_id", workspaceId).order("ts", { ascending: false }).limit(500),
    supabase.from("approval_requests").select("id", { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "pending"),
  ]);

  const rules = rulesRes.data ?? [];
  const total = rules.length;
  const active = rules.filter((r) => r.status === "active").length;
  const drafts = rules.filter((r) => r.status === "draft").length;
  const runs = runsAllRes.data ?? [];
  const successCount = runs.filter((r) => r.status === "success").length;
  const successRate = runs.length > 0 ? (successCount / runs.length) * 100 : 100;

  return {
    total,
    active,
    drafts,
    successRate: Math.round(successRate * 10) / 10,
    runsToday: runsTodayRes.count ?? 0,
    pendingApprovals: approvalsRes.count ?? 0,
  };
}

export interface RecentActivityRow {
  id: string;
  automationName: string;
  trigger: string;
  status: string;
  ts: string;
}

export async function getRecentActivity(workspaceId: string, limit = 6): Promise<RecentActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("smart_rule_runs")
    .select("id, status, ts, rule_id, smart_rules(name, trigger_kind)")
    .eq("workspace_id", workspaceId)
    .order("ts", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const rule = r.smart_rules as unknown as { name: string; trigger_kind: string } | null;
    return {
      id: r.id,
      automationName: rule?.name ?? "Unknown automation",
      trigger: TRIGGER_LABEL[rule?.trigger_kind ?? ""] ?? rule?.trigger_kind ?? "—",
      status: r.status,
      ts: r.ts,
    };
  });
}

export interface NeedsAttention {
  failedRuns24h: number;
  pendingApprovals: number;
  disconnectedIntegrations: number;
}

export async function getNeedsAttention(workspaceId: string): Promise<NeedsAttention> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [failed, approvals, integrations] = await Promise.all([
    supabase.from("smart_rule_runs").select("id", { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "failed").gte("ts", since),
    supabase.from("approval_requests").select("id", { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "pending"),
    supabase.from("integration_connections").select("id", { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "disconnected"),
  ]);
  return {
    failedRuns24h: failed.count ?? 0,
    pendingApprovals: approvals.count ?? 0,
    disconnectedIntegrations: integrations.count ?? 0,
  };
}

export interface UsageSnapshot {
  runsUsed: number;
  runsCap: number;
  tasksExecuted: number;
  tasksCap: number;
  aiCreditsUsed: number;
  aiCreditsCap: number;
}

export async function getUsageSnapshot(workspaceId: string): Promise<UsageSnapshot> {
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [runEvents, aiEvents, plan] = await Promise.all([
    supabase.from("automation_usage_events").select("quantity").eq("workspace_id", workspaceId).eq("kind", "run").gte("created_at", monthStart),
    supabase.from("automation_usage_events").select("quantity").eq("workspace_id", workspaceId).eq("kind", "ai_credit").gte("created_at", monthStart),
    getPlanLimits(workspaceId),
  ]);
  const runsUsed = (runEvents.data ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  const aiCreditsUsed = (aiEvents.data ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
  return {
    runsUsed,
    runsCap: plan.smartRuleRunsCap,
    tasksExecuted: runsUsed, // tasks executed tracked via the same run usage stream
    tasksCap: plan.smartRuleRunsCap,
    aiCreditsUsed,
    aiCreditsCap: plan.aiCreditsCap,
  };
}

export interface CoverageSlice {
  module: string;
  count: number;
}

export async function getAutomationCoverage(workspaceId: string): Promise<CoverageSlice[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("smart_rules").select("module").eq("workspace_id", workspaceId).is("deleted_at", null);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.module, (counts.get(r.module) ?? 0) + 1);
  return Array.from(counts.entries()).map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count);
}

// ─── Runs & Logs ──────────────────────────────────────────────────────────

export interface RunRow {
  id: string;
  automationId: string;
  automationName: string;
  status: string;
  ts: string;
  durationMs: number | null;
  triggerSource: string;
  environment: string;
  errorText: string | null;
  initiatedBy: string | null;
}

export async function listRuns(
  workspaceId: string,
  opts?: { status?: string; automationId?: string; search?: string; limit?: number; offset?: number }
): Promise<{ rows: RunRow[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("smart_rule_runs")
    .select("id, status, ts, duration_ms, trigger_source, environment, error_text, initiated_by, rule_id, smart_rules(name)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("ts", { ascending: false });
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status as never);
  if (opts?.automationId && opts.automationId !== "all") q = q.eq("rule_id", opts.automationId);
  const limit = opts?.limit ?? 10;
  const offset = opts?.offset ?? 0;
  q = q.range(offset, offset + limit - 1);
  const { data, count } = await q;
  let rows = (data ?? []).map((r) => ({
    id: r.id,
    automationId: r.rule_id,
    automationName: (r.smart_rules as unknown as { name: string } | null)?.name ?? "Unknown automation",
    status: r.status,
    ts: r.ts,
    durationMs: r.duration_ms,
    triggerSource: r.trigger_source,
    environment: r.environment,
    errorText: r.error_text,
    initiatedBy: r.initiated_by,
  }));
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter((r) => r.automationName.toLowerCase().includes(s) || r.id.toLowerCase().includes(s));
  }
  return { rows, total: count ?? rows.length };
}

export interface RunDetail extends RunRow {
  matchedCount: number;
  firedCount: number;
  steps: { id: string; nodeId: string | null; nodeType: string | null; actionKind: string; success: boolean; errorText: string | null; durationMs: number | null; stepIndex: number; startedAt: string }[];
}

export async function getRunDetail(workspaceId: string, runId: string): Promise<RunDetail | null> {
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("smart_rule_runs")
    .select("id, status, ts, duration_ms, trigger_source, environment, error_text, initiated_by, rule_id, matched_count, fired_count, smart_rules(name)")
    .eq("workspace_id", workspaceId)
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;
  const { data: steps } = await supabase
    .from("smart_rule_actions_log")
    .select("id, node_id, node_type, action_kind, success, error_text, duration_ms, step_index, started_at")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  return {
    id: run.id,
    automationId: run.rule_id,
    automationName: (run.smart_rules as unknown as { name: string } | null)?.name ?? "Unknown automation",
    status: run.status,
    ts: run.ts,
    durationMs: run.duration_ms,
    triggerSource: run.trigger_source,
    environment: run.environment,
    errorText: run.error_text,
    initiatedBy: run.initiated_by,
    matchedCount: run.matched_count,
    firedCount: run.fired_count,
    steps: (steps ?? []).map((s) => ({
      id: s.id,
      nodeId: s.node_id,
      nodeType: s.node_type,
      actionKind: s.action_kind,
      success: s.success,
      errorText: s.error_text,
      durationMs: s.duration_ms,
      stepIndex: s.step_index,
      startedAt: s.started_at,
    })),
  };
}

export interface RunStatusDistribution {
  status: string;
  count: number;
}

export async function getRunStatusDistribution(workspaceId: string): Promise<RunStatusDistribution[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("smart_rule_runs").select("status").eq("workspace_id", workspaceId).limit(5000);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}

// ─── Usage & Limits ───────────────────────────────────────────────────────

export interface PlanLimits {
  planCode: string;
  smartRuleRunsCap: number;
  aiCreditsCap: number;
  webhookEventsCap: number;
  approvalTasksCap: number;
  storageGbCap: number;
  concurrencyCap: number;
  activeIntegrationsCap: number;
  activeSeatsCap: number;
}

export async function getPlanLimits(workspaceId: string): Promise<PlanLimits> {
  const supabase = await createClient();
  const { data: sub } = await supabase.from("billing_subscriptions").select("plan").eq("workspace_id", workspaceId).maybeSingle();
  const planCode = sub?.plan ?? "free";
  const { data: plan } = await supabase.from("billing_plans").select("limits_jsonb").eq("code", planCode).maybeSingle();
  const limits = (plan?.limits_jsonb as Record<string, number>) ?? {};
  return {
    planCode,
    smartRuleRunsCap: limits.smart_rule_count ?? 0,
    aiCreditsCap: limits.automation_ai_credits_per_month ?? 0,
    webhookEventsCap: limits.automation_webhook_events_per_month ?? 0,
    approvalTasksCap: limits.automation_approval_tasks_per_month ?? 0,
    storageGbCap: limits.automation_storage_gb ?? 0,
    concurrencyCap: limits.automation_execution_concurrency ?? 0,
    activeIntegrationsCap: limits.automation_active_integrations ?? 0,
    activeSeatsCap: limits.automation_active_seats ?? 0,
  };
}

export interface UsageByDay {
  date: string;
  runs: number;
  aiCredits: number;
  webhookEvents: number;
}

export async function getUsageOverTime(workspaceId: string, days = 30): Promise<UsageByDay[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from("automation_usage_events")
    .select("kind, quantity, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  const byDay = new Map<string, UsageByDay>();
  for (const e of data ?? []) {
    const day = e.created_at.slice(0, 10);
    const row = byDay.get(day) ?? { date: day, runs: 0, aiCredits: 0, webhookEvents: 0 };
    if (e.kind === "run") row.runs += e.quantity;
    if (e.kind === "ai_credit") row.aiCredits += e.quantity;
    if (e.kind === "webhook_event") row.webhookEvents += e.quantity;
    byDay.set(day, row);
  }
  return Array.from(byDay.values());
}

export async function getUsageByModule(workspaceId: string): Promise<CoverageSlice[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_usage_events").select("module, quantity").eq("workspace_id", workspaceId).eq("kind", "run");
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.module, (counts.get(r.module) ?? 0) + r.quantity);
  return Array.from(counts.entries()).map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count);
}

// ─── Approvals ────────────────────────────────────────────────────────────

export interface ApprovalRow {
  id: string;
  automationId: string | null;
  automationName: string;
  requestType: string;
  module: string;
  priority: string;
  status: string;
  reason: string | null;
  triggerContext: Record<string, unknown>;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  submittedAt: string;
  dueAt: string | null;
}

export async function listApprovals(workspaceId: string, opts?: { status?: string; module?: string; search?: string; limit?: number; offset?: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("approval_requests")
    .select("id, automation_id, request_type, module, priority, status, reason, trigger_context, before_state, after_state, submitted_at, due_at, smart_rules(name)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("submitted_at", { ascending: false });
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts?.module && opts.module !== "all") q = q.eq("module", opts.module);
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  q = q.range(offset, offset + limit - 1);
  const { data, count } = await q;
  const rows: ApprovalRow[] = (data ?? []).map((r) => ({
    id: r.id,
    automationId: r.automation_id,
    automationName: (r.smart_rules as unknown as { name: string } | null)?.name ?? "Manual approval",
    requestType: r.request_type,
    module: r.module,
    priority: r.priority,
    status: r.status,
    reason: r.reason,
    triggerContext: (r.trigger_context as Record<string, unknown>) ?? {},
    beforeState: (r.before_state as Record<string, unknown>) ?? null,
    afterState: (r.after_state as Record<string, unknown>) ?? null,
    submittedAt: r.submitted_at,
    dueAt: r.due_at,
  }));
  return { rows, total: count ?? rows.length };
}

export async function getApprovalComments(workspaceId: string, approvalId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("approval_comments")
    .select("id, author_id, body, created_at")
    .eq("workspace_id", workspaceId)
    .eq("approval_id", approvalId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

// ─── Errors ───────────────────────────────────────────────────────────────

export interface ErrorIncidentRow {
  id: string;
  automationId: string | null;
  automationName: string;
  title: string;
  message: string | null;
  severity: string;
  module: string;
  status: string;
  impact: string;
  nodeId: string | null;
  nodeType: string | null;
  stackTrace: string | null;
  payloadPreview: Record<string, unknown> | null;
  suggestedFix: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
}

export async function listErrorIncidents(workspaceId: string, opts?: { severity?: string; module?: string; status?: string; limit?: number; offset?: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("automation_error_incidents")
    .select(
      "id, automation_id, title, message, severity, module, status, impact, node_id, node_type, stack_trace, payload_preview, suggested_fix, first_seen_at, last_seen_at, occurrences, smart_rules(name)",
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId)
    .order("last_seen_at", { ascending: false });
  if (opts?.severity && opts.severity !== "all") q = q.eq("severity", opts.severity);
  if (opts?.module && opts.module !== "all") q = q.eq("module", opts.module);
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  q = q.range(offset, offset + limit - 1);
  const { data, count } = await q;
  const rows: ErrorIncidentRow[] = (data ?? []).map((r) => ({
    id: r.id,
    automationId: r.automation_id,
    automationName: (r.smart_rules as unknown as { name: string } | null)?.name ?? "Unknown automation",
    title: r.title,
    message: r.message,
    severity: r.severity,
    module: r.module,
    status: r.status,
    impact: r.impact,
    nodeId: r.node_id,
    nodeType: r.node_type,
    stackTrace: r.stack_trace,
    payloadPreview: (r.payload_preview as Record<string, unknown>) ?? null,
    suggestedFix: r.suggested_fix,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    occurrences: r.occurrences,
  }));
  return { rows, total: count ?? rows.length };
}

export async function getErrorSummary(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_error_incidents").select("severity, status").eq("workspace_id", workspaceId);
  const rows = data ?? [];
  return {
    open: rows.filter((r) => r.status === "open" || r.status === "investigating").length,
    critical: rows.filter((r) => r.severity === "critical" && r.status !== "resolved").length,
    warning: rows.filter((r) => r.severity === "warning" && r.status !== "resolved").length,
  };
}

// ─── Integrations ─────────────────────────────────────────────────────────

export interface IntegrationRow {
  id: string;
  provider: string;
  connectType: string;
  status: string;
  environment: string;
  secretLast4: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export async function listIntegrations(workspaceId: string): Promise<IntegrationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_connections")
    .select("id, provider, connect_type, status, environment, secret_last4, connected_at, last_sync_at")
    .eq("workspace_id", workspaceId)
    .order("provider", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider,
    connectType: r.connect_type,
    status: r.status,
    environment: r.environment,
    secretLast4: r.secret_last4,
    connectedAt: r.connected_at,
    lastSyncAt: r.last_sync_at,
  }));
}

export async function getIntegrationWebhooks(workspaceId: string, connectionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_webhooks")
    .select("id, direction, endpoint_url, retry_policy, subscribed_events, status")
    .eq("workspace_id", workspaceId)
    .eq("connection_id", connectionId);
  return data ?? [];
}

export async function getWebhookDeliveries(workspaceId: string, webhookId: string, limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_webhook_deliveries")
    .select("id, event_type, status, response_code, attempt, created_at")
    .eq("workspace_id", workspaceId)
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ─── Recipes (catalogue is static; favourites/usage are live) ────────────

export async function getRecipeFavourites(workspaceId: string, userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_recipe_favourites").select("recipe_id").eq("workspace_id", workspaceId).eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.recipe_id));
}

export async function getRecipeUsageCounts(workspaceId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("automation_recipe_usage").select("recipe_id").eq("workspace_id", workspaceId);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.recipe_id, (counts.get(r.recipe_id) ?? 0) + 1);
  return counts;
}
