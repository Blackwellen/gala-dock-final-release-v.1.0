"use server";

import { copilotRespond } from "@/lib/copilot/chat";
import { getOptionalPersonaContext } from "@/lib/flags/context";
import { reserveAiBudget, reconcileAiBudget, refundAiBudget } from "@/lib/ai/metering";
import { buildWorkspaceContext } from "@/lib/copilot/context";
import { proposePlan } from "@/lib/copilot/plan";
import type { ChatMessage } from "@/lib/ai/provider";

const CHAT_ESTIMATE_CENTS = 1; // pre-call estimate (pence); reconciled to real cost after.

export interface CopilotTurn {
  role: "user" | "ai";
  text: string;
}

export interface CopilotActionResult {
  ok: boolean;
  text: string;
  costPence?: number;
}

/**
 * Copilot chat entry point (server action). Gated by the aiCopilot flag, grounded with the
 * workspace name, and routed to NVIDIA NIM via copilotRespond. Phase-1: conversational replies
 * that suggest slash commands; deterministic tool execution lands in Phase 2.
 */
export async function askCopilot(turns: CopilotTurn[]): Promise<CopilotActionResult> {
  const ctx = await getOptionalPersonaContext();

  if (!ctx.flags.aiCopilot) {
    return {
      ok: false,
      text: "Gala Copilot is available on the Scale plan and above. Upgrade in Settings → Billing to enable AI chat and actions.",
    };
  }

  const history: ChatMessage[] = turns
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({ role: t.role === "ai" ? "assistant" : "user", content: t.text }));

  if (history.length === 0) return { ok: false, text: "Ask me anything about your events, suppliers, tasks or finances." };

  // Reserve against the monthly AI budget (no-op if metering unavailable).
  const reservation = ctx.workspaceId
    ? await reserveAiBudget(ctx.workspaceId, "meeting_notes", CHAT_ESTIMATE_CENTS)
    : null;
  if (reservation?.blocked) {
    return { ok: false, text: "You've reached this month's AI budget. It resets next month — or raise the cap in Settings → AI." };
  }

  // Ground the reply in a live workspace snapshot (best-effort).
  let groundingNote: string | undefined;
  if (ctx.workspaceId) {
    try {
      groundingNote = await buildWorkspaceContext(ctx.workspaceId);
    } catch {
      groundingNote = undefined;
    }
  }

  try {
    const reply = await copilotRespond(history, {
      workspaceName: ctx.workspaceName ?? undefined,
      groundingNote,
    });
    if (reservation) {
      await reconcileAiBudget(reservation.ledgerId, CHAT_ESTIMATE_CENTS, Math.ceil(reply.costPence), reply.usage.promptTokens, reply.usage.completionTokens);
    }
    return { ok: true, text: reply.content, costPence: reply.costPence };
  } catch {
    if (reservation) await refundAiBudget(reservation.ledgerId, CHAT_ESTIMATE_CENTS);
    return { ok: false, text: "Sorry — I couldn't reach the AI service just now. Please try again." };
  }
}

export interface ProposedCommand {
  id: string;
  args: Record<string, string>;
  label: string;
}

export interface PlanActionResult {
  ok: boolean;
  note: string;
  commands: ProposedCommand[];
}

/** Planner action: NL goal → validated, runnable command plan (gated + metered). */
export async function planCopilot(goal: string): Promise<PlanActionResult> {
  const ctx = await getOptionalPersonaContext();
  if (!ctx.flags.aiCopilot) return { ok: false, note: "Gala Copilot is available on the Scale plan and above.", commands: [] };
  if (!goal.trim()) return { ok: false, note: "What's the goal? Try /plan organise the welcome email and prep tasks for the Carter wedding.", commands: [] };

  const reservation = ctx.workspaceId ? await reserveAiBudget(ctx.workspaceId, "brief_draft", 1) : null;
  if (reservation?.blocked) return { ok: false, note: "You've reached this month's AI budget. It resets next month — or raise the cap in Settings → AI.", commands: [] };

  let grounding: string | undefined;
  if (ctx.workspaceId) {
    try {
      grounding = await buildWorkspaceContext(ctx.workspaceId);
    } catch {
      grounding = undefined;
    }
  }

  try {
    const plan = await proposePlan(goal, grounding);
    if (reservation) {
      await reconcileAiBudget(reservation.ledgerId, 1, Math.ceil(plan.costPence), plan.usage.promptTokens, plan.usage.completionTokens);
    }
    const commands: ProposedCommand[] = plan.commands.map((c) => ({
      id: c.id,
      args: c.args,
      label: `/${c.id}${Object.entries(c.args).map(([k, v]) => ` ${k}:${v}`).join("")}`,
    }));
    return { ok: true, note: plan.note, commands };
  } catch {
    if (reservation) await refundAiBudget(reservation.ledgerId, 1);
    return { ok: false, note: "Couldn't build a plan just now.", commands: [] };
  }
}
