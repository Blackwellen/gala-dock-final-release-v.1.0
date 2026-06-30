// Gala Dock — Copilot chat (server). Thin reasoning entry point over the NIM provider.
// Phase-2 will layer the planner/executor, context graph and tool execution on top of this
// (see docs/specs/COPILOT_ARCHITECTURE.md). For now: grounded conversational replies + cost.

import { chatComplete, estimateCostPence, type ChatMessage, type ChatUsage } from "@/lib/ai/provider";
import { SLASH_COMMANDS } from "./commands";

const SYSTEM_PROMPT = [
  "You are Gala Dock Copilot — an AI delivery partner for professional event organisers,",
  "agencies and venues. You help run events end to end: suppliers, tasks, run sheets, finance,",
  "tickets and clients. Be concise, practical and UK-English.",
  "When the user asks you to DO something, suggest the matching slash command in the form",
  "`/command arg:value` and ask for confirmation before any action that creates, sends or changes records.",
  "Never invent figures — say when you need data. Available commands: " +
    SLASH_COMMANDS.map((c) => `/${c.id}`).join(", ") + ".",
].join(" ");

export interface CopilotContext {
  workspaceName?: string;
  /** Optional grounding the caller has already resolved (route, current record, counts). */
  groundingNote?: string;
}

export interface CopilotReply {
  content: string;
  usage: ChatUsage;
  costPence: number;
  model: string;
}

export async function copilotRespond(
  history: ChatMessage[],
  context: CopilotContext = {}
): Promise<CopilotReply> {
  const grounding = [
    context.workspaceName ? `Workspace: ${context.workspaceName}.` : "",
    context.groundingNote ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const messages: ChatMessage[] = [
    { role: "system", content: grounding ? `${SYSTEM_PROMPT}\nContext: ${grounding}` : SYSTEM_PROMPT },
    ...history.slice(-12), // keep the last turns within budget
  ];

  const result = await chatComplete(messages, { tier: "fast", maxTokens: 600, temperature: 0.3 });
  return {
    content: result.content,
    usage: result.usage,
    costPence: estimateCostPence(result.usage),
    model: result.model,
  };
}
