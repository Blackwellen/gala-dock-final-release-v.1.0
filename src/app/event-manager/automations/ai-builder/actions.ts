"use server";

// Gala Dock — AI Builder server actions.
//
// generateAutomationDraft() tries the real NVIDIA NIM provider (src/lib/ai/provider.ts —
// the same provider Copilot uses) first, and only falls back to a deterministic keyword
// matcher when the provider isn't configured, errors, or returns something we can't map
// to one of the 7 live triggers / 5 live actions. The returned `source` field tells the
// client honestly which path produced the result — the UI must never claim "AI-generated"
// for a keyword-matched result.
//
// saveGeneratedAutomation() writes a real draft `smart_rules` row (disabled, dry_run) using
// the exact insert shape `createDraftAutomation` uses in ../actions.ts. Only the first action
// is wired to the live `action_kind` column (that's the only column the runner currently
// executes) — any additional steps the user adds in the builder are stored in
// `definition_json.extraActions` as an outline for the Canvas Builder to complete.

import { revalidatePath } from "next/cache";
import { requireWorkspace, requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { chatComplete, aiConfigured } from "@/lib/ai/provider";
import { SMART_RULE_TRIGGERS, SMART_RULE_ACTIONS, TRIGGER_LABEL, ACTION_LABEL } from "@/lib/automations/smart-rules";
import type { Database } from "@/lib/supabase/types";

const BASE = "/event-manager/automations";

type LiveTrigger = Database["public"]["Enums"]["smart_rule_trigger"];
type LiveAction = Database["public"]["Enums"]["smart_rule_action"];

const VALID_TRIGGERS = new Set<string>(SMART_RULE_TRIGGERS.map((t) => t.value));
const VALID_ACTIONS = new Set<string>(SMART_RULE_ACTIONS.map((a) => a.value));

export interface GeneratedWorkflow {
  trigger: LiveTrigger;
  triggerLabel: string;
  action: LiveAction;
  actionLabel: string;
  conditionSummary: string | null;
  /** Which mechanism actually produced this result — the UI must reflect this honestly. */
  source: "ai" | "keyword_match";
  rationale: string;
  /** 0-100. 100 only when the AI model returned a directly-usable mapping; 60 for the
   * deterministic keyword fallback (it always resolves to *something*, but that something
   * may just be the default trigger/action). */
  readiness: number;
}

export interface GenerateResult {
  ok: boolean;
  error?: string;
  workflow?: GeneratedWorkflow;
}

// ─── Deterministic keyword matcher (the honest fallback) ──────────────────

function keywordMatch(prompt: string): { trigger: LiveTrigger; action: LiveAction; conditionSummary: string | null } {
  const p = prompt.toLowerCase();
  let trigger: LiveTrigger = "nightly_cron";
  let action: LiveAction = "notify_user";

  if (p.includes("overdue") && (p.includes("invoice") || p.includes("payment") || p.includes("bill"))) {
    trigger = "invoice_overdue";
  } else if (p.includes("quote") && (p.includes("unread") || p.includes("no response") || p.includes("silent") || p.includes("waiting"))) {
    trigger = "quote_unread_after";
  } else if (p.includes("task") && (p.includes("due") || p.includes("deadline") || p.includes("overdue"))) {
    trigger = "task_due_in";
  } else if (p.includes("event") && (p.includes("stage") || p.includes("status") || p.includes("confirm") || p.includes("cancel") || p.includes("book"))) {
    trigger = "event_stage_changed";
  } else if (p.includes("supplier") && (p.includes("reply") || p.includes("respond") || p.includes("silent") || p.includes("quiet"))) {
    trigger = "supplier_no_reply";
  } else if (p.includes("file") || p.includes("upload") || p.includes("document") || p.includes("evidence") || p.includes("expir")) {
    trigger = "file_uploaded";
  } else if (p.includes("daily") || p.includes("nightly") || p.includes("every day") || p.includes("every morning") || p.includes("digest")) {
    trigger = "nightly_cron";
  }

  if (p.includes("email") || p.includes("remind") || p.includes("chase") || p.includes("draft a") || p.includes("message")) {
    action = "send_email";
  } else if (p.includes("task") || p.includes("checklist") || p.includes("assign") || p.includes("follow-up") || p.includes("follow up")) {
    action = "create_task";
  } else if (p.includes("notify") || p.includes("alert") || p.includes("flag") || p.includes("tell")) {
    action = "notify_user";
  } else if (p.includes("tag") || p.includes("label")) {
    action = "set_tag";
  } else if (p.includes("webhook") || p.includes("integration") || p.includes("sync")) {
    action = "webhook_internal_only";
  }

  return { trigger, action, conditionSummary: null };
}

interface ModelJson {
  trigger?: string;
  action?: string;
  conditionSummary?: string | null;
  rationale?: string;
}

function parseModelJson(content: string): ModelJson | null {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as ModelJson;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ModelJson;
    } catch {
      return null;
    }
  }
}

/** Best-effort usage record — feeds the same `automation_usage_events` stream the
 * Usage & Limits page reads (kind: "ai_credit"). Never throws; metering must not break the builder. */
async function recordAiUsage(workspaceId: string) {
  try {
    const supabase = await createClient();
    await supabase.from("automation_usage_events").insert({
      workspace_id: workspaceId,
      kind: "ai_credit",
      module: "ai_builder",
      quantity: 1,
    });
  } catch {
    // Non-fatal — usage tracking should never block automation generation.
  }
}

export async function generateAutomationDraft(prompt: string): Promise<GenerateResult> {
  const { workspaceId } = await requireWorkspace();
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "Describe the automation you want to build." };
  if (trimmed.length > 800) return { ok: false, error: "Keep the description under 800 characters." };

  if (aiConfigured()) {
    try {
      const system = [
        "You convert a plain-English automation request into a strict JSON object for Gala Dock's",
        "event-operations automation engine. Respond with ONLY a JSON object — no prose, no markdown fences.",
        `Valid "trigger" values (pick exactly one): ${SMART_RULE_TRIGGERS.map((t) => t.value).join(", ")}.`,
        `Valid "action" values (pick exactly one): ${SMART_RULE_ACTIONS.map((a) => a.value).join(", ")}.`,
        'Shape: {"trigger": "<value>", "action": "<value>", "conditionSummary": "<short plain-English condition, or null>", "rationale": "<one sentence>"}.',
      ].join(" ");

      const result = await chatComplete(
        [
          { role: "system", content: system },
          { role: "user", content: trimmed },
        ],
        { tier: "fast", maxTokens: 220, temperature: 0.1 }
      );

      await recordAiUsage(workspaceId);

      const parsed = parseModelJson(result.content);
      if (parsed?.trigger && parsed?.action && VALID_TRIGGERS.has(parsed.trigger) && VALID_ACTIONS.has(parsed.action)) {
        const trigger = parsed.trigger as LiveTrigger;
        const action = parsed.action as LiveAction;
        return {
          ok: true,
          workflow: {
            trigger,
            triggerLabel: TRIGGER_LABEL[trigger] ?? trigger,
            action,
            actionLabel: ACTION_LABEL[action] ?? action,
            conditionSummary: parsed.conditionSummary?.trim() || null,
            source: "ai",
            rationale: parsed.rationale?.trim() || "Mapped by the AI model from your description.",
            readiness: 100,
          },
        };
      }
      // Model responded but not with a usable shape — fall through to the keyword matcher below.
    } catch {
      // Provider error (missing key, timeout, non-2xx) — fall through to the keyword matcher.
    }
  }

  const { trigger, action, conditionSummary } = keywordMatch(trimmed);
  return {
    ok: true,
    workflow: {
      trigger,
      triggerLabel: TRIGGER_LABEL[trigger] ?? trigger,
      action,
      actionLabel: ACTION_LABEL[action] ?? action,
      conditionSummary,
      source: "keyword_match",
      rationale: "Matched by keyword against your description — no AI model was called for this result.",
      readiness: 60,
    },
  };
}

export interface SaveGeneratedAutomationResult {
  ok: boolean;
  error?: string;
  automationId?: string;
}

/** Save the (possibly hand-edited) generated workflow as a disabled draft smart rule. */
export async function saveGeneratedAutomation(
  name: string,
  triggerKind: string,
  actionKind: string,
  module: string,
  conditionSummary: string | null,
  extraActionKinds: string[] = []
): Promise<SaveGeneratedAutomationResult> {
  const { workspaceId, user } = await requireWorkspaceManager();

  if (!VALID_TRIGGERS.has(triggerKind)) return { ok: false, error: "Unknown trigger." };
  if (!VALID_ACTIONS.has(actionKind)) return { ok: false, error: "Unknown action." };
  const invalidExtra = extraActionKinds.find((a) => !VALID_ACTIONS.has(a));
  if (invalidExtra) return { ok: false, error: `Unknown action: ${invalidExtra}.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("smart_rules")
    .insert({
      workspace_id: workspaceId,
      name: name.trim() || "AI-built automation",
      description: conditionSummary,
      trigger_kind: triggerKind as LiveTrigger,
      action_kind: actionKind as LiveAction,
      conditions: [],
      created_by: user.id,
      owner_user_id: user.id,
      enabled: false,
      dry_run: true,
      status: "draft",
      module: module || "operations",
      definition_json: {
        nodes: [],
        edges: [],
        generatedBy: "ai-builder",
        extraActions: extraActionKinds,
      },
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`${BASE}/my-automations`);
  revalidatePath(`${BASE}/ai-builder`);
  return { ok: true, automationId: data.id };
}
