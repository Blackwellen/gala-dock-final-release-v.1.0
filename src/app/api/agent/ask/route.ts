import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { chat, SAFETY, agentConfigured, dataBlock, AgentBudgetError } from "@/lib/agent/llm";
import { listWorkspaceAccess } from "@/lib/auth";
import { buildContext } from "@/lib/agent/context";

const Body = z.object({ scope: z.enum(["customer", "organizer"]), eventId: z.string().uuid().optional(), question: z.string().trim().min(2).max(1500),
  /** What the person is looking at (listing, lead, proposal) — page-supplied, treated as data, never as instructions. */
  focus: z.string().trim().max(2000).optional() });

/** Read-only Gala Agent Q&A grounded in the caller's RLS-scoped records. Gala Agent is a paid Organizer / Provider feature:
 *  every answer is preflighted against and charged to the workspace's credits. Customer accounts have no workspace, no
 *  credits and no agent tooling, so the customer scope is refused (customer screens use non-AI helpers instead). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use Gala Agent." }, { status: 401 });
  if (!(await hasRequiredAssurance(supabase))) return NextResponse.json({ error: "Complete multi-factor authentication first." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  if (parsed.data.scope === "customer") return NextResponse.json({ error: "Gala Agent is available in Organizer and Provider workspaces." }, { status: 403 });
  if (!agentConfigured()) return NextResponse.json({ error: "Gala Agent isn't configured on this environment (Azure OpenAI keys missing)." }, { status: 503 });
  if (!(await rateLimit(`agent-ask:${user.id}`, 30, 3600))) return NextResponse.json({ error: "You've reached the hourly Gala Agent limit. Please try again later." }, { status: 429 });
  const { eventId, question, focus } = parsed.data; const scope = "organizer" as const;
  // The workspace that pays: the event's workspace when asking about an event, otherwise the user's last-used organizer workspace.
  const access = (await listWorkspaceAccess(supabase)).filter(w => w.kind === "organizer" && w.member_status === "active" && w.workspace_status === "active");
  let workspaceId: string | null = null;
  if (eventId) { const { data: ev } = await supabase.from("events").select("workspace_id").eq("id", eventId).maybeSingle(); workspaceId = (ev?.workspace_id as string | null) ?? null; }
  if (!workspaceId) { const { data: prof } = await supabase.from("profiles").select("last_workspace_id").eq("id", user.id).maybeSingle(); workspaceId = access.find(w => w.id === prof?.last_workspace_id)?.id ?? access[0]?.id ?? null; }
  if (!workspaceId || !access.some(w => w.id === workspaceId)) return NextResponse.json({ error: "Gala Agent needs an Organizer workspace." }, { status: 403 });
  const context = await buildContext(supabase, user.id, scope, eventId);
  if (eventId && !context) return NextResponse.json({ error: "That event isn't available to you." }, { status: 404 });
  try {
    const { text } = await chat([
      { role: "system", content: `${SAFETY}\nAudience: a professional event organizer; be operational and precise.\nToday is ${new Date().toISOString().slice(0, 10)}.` },
      { role: "user", content: `${dataBlock(`${focus ? `Currently viewing: ${focus}\n\n` : ""}${context ?? "No records."}`)}\n\nQuestion: ${question}` },
    ], { tier: "standard", maxTokens: 700, meter: { workspaceId, userId: user.id, purpose: "ask_organizer" } });
    return NextResponse.json({ answer: text || "I couldn't find enough information to answer that." });
  } catch (e) {
    if (e instanceof AgentBudgetError) return NextResponse.json({ error: e.message, code: "credits" }, { status: 402 });
    return NextResponse.json({ error: "Gala Agent couldn't respond right now. Please try again." }, { status: 502 });
  }
}
