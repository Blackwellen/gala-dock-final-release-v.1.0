// Gala Dock — Copilot planner (V1-2 Phase 4). Converts a natural-language goal into an ordered
// plan of REAL slash commands drawn from the registry, which the user can then run. The brain
// layer over the "assembly language". Server-only (uses NIM). Validates every proposed command
// against the registry so it can never invent a command.

import { chatComplete, estimateCostPence, type ChatUsage } from "@/lib/ai/provider";
import { SLASH_COMMANDS, SLASH_BY_ID } from "./commands";

export interface PlannedCommand {
  id: string;
  args: Record<string, string>;
}

export interface CopilotPlan {
  commands: PlannedCommand[];
  note: string;
  usage: ChatUsage;
  costPence: number;
}

const CATALOG = SLASH_COMMANDS.map(
  (c) => `/${c.id} — ${c.description}${c.args.length ? ` (args: ${c.args.map((a) => a.name).join(", ")})` : ""}`
).join("\n");

export async function proposePlan(goal: string, grounding?: string): Promise<CopilotPlan> {
  const system = [
    "You are Gala Dock Copilot's planner. Convert the user's goal into an ordered plan using ONLY these commands:",
    CATALOG,
    'Return ONLY JSON: {"note":"<one short sentence>","commands":[{"id":"<command id, no slash>","args":{"key":"value"}}]}.',
    "Use 1-4 commands. Use only listed ids. If nothing fits, return an empty commands array.",
  ].join("\n");

  const user = grounding ? `${goal}\n\nWorkspace context: ${grounding}` : goal;

  const res = await chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { tier: "fast", maxTokens: 400, temperature: 0.2 }
  );

  let parsed: { note?: unknown; commands?: unknown } = {};
  try {
    const match = res.content.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }

  const rawList = Array.isArray(parsed.commands) ? parsed.commands : [];
  const commands: PlannedCommand[] = rawList
    .map((c): PlannedCommand | null => {
      if (!c || typeof c !== "object") return null;
      const obj = c as { id?: unknown; args?: unknown };
      const id = typeof obj.id === "string" ? obj.id.replace(/^\//, "") : "";
      if (!SLASH_BY_ID[id]) return null;
      const args = obj.args && typeof obj.args === "object" ? (obj.args as Record<string, string>) : {};
      return { id, args };
    })
    .filter((c): c is PlannedCommand => c !== null)
    .slice(0, 4);

  return {
    commands,
    note: typeof parsed.note === "string" ? parsed.note : "Here's a plan you can run.",
    usage: res.usage,
    costPence: estimateCostPence(res.usage),
  };
}
