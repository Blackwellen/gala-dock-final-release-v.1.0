import { NextResponse } from "next/server";
import { getProvider } from "@/lib/provider/context";
import { rateLimit, sameOrigin } from "@/lib/security";
import { providerSnapshot, askProviderAgent } from "@/lib/provider/agent";
import { AgentBudgetError } from "@/lib/agent/llm";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Provider Gala Agent chat. Answers from the workspace's own (RLS-visible) data and queues any proposed changes
 * as approvals — nothing is executed until a manager approves it on the Approvals tab.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const { db, workspace, userId, can } = await getProvider();
  if (!(await rateLimit(`provider-agent:${userId}`, 20, 300))) return json({ error: "That’s a lot of questions — please wait a few minutes." }, 429);
  const body = await request.json().catch(() => null) as { message?: string; history?: { role: "user" | "assistant"; content: string }[] } | null;
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  if (message.length < 2) return json({ error: "Ask Gala Agent something." }, 400);
  const history = (body?.history ?? []).filter(h => (h.role === "user" || h.role === "assistant") && typeof h.content === "string").map(h => ({ role: h.role, content: h.content.slice(0, 2000) })).slice(-8);
  let budget: string | null = null;
  const out = await askProviderAgent(await providerSnapshot(db, workspace.id), message, history, { workspaceId: workspace.id, userId, purpose: "provider_chat" })
    .catch(e => { if (e instanceof AgentBudgetError) budget = e.message; return undefined; });
  if (budget) return json({ error: budget, budget: true }, 402);
  if (out === null) return json({ unavailable: true, reply: "Gala Agent’s model isn’t configured for this workspace yet, so I can’t answer right now. Your routines and approvals still work." });
  if (out === undefined) return json({ error: "Gala Agent couldn’t answer just now. Please try again." }, 502);
  const queued: string[] = [];
  if (can.manage) for (const p of out.proposals) {
    const { data, error } = await db.rpc("agent_propose_action", { p_ws: workspace.id, p_run: null, p_title: p.title, p_detail: p.detail, p_action: p.action, p_payload: p.payload, p_impact: p.impact, p_amount: null });
    if (!error && data) queued.push(p.title);
  }
  return json({ reply: out.reply, queued });
}
