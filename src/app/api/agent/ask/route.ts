import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { agentConfigured } from "@/lib/agent/llm";
import { ask } from "@/lib/agent/runtime";
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
  const context = await buildContext(supabase, user.id, scope, eventId, workspaceId);   // Q53: only the workspace that pays
  if (eventId && !context) return NextResponse.json({ error: "That event isn't available to you." }, { status: 404 });
  // Q72 + 2026-11-16: the shared Ask path (runtime.ask) grounds the answer in Gala Dock's identity and this workspace's live plan,
  // capabilities, credits, plan limits and Agent policy (read as this person), picks read tools when data would help (with the
  // page's event id), and answers from the page's records plus the tool results. Kill switches and credit limits are checked first.
  const { data: ev } = eventId ? await supabase.from("events").select("name,starts_at").eq("id", eventId).maybeSingle() : { data: null };
  const page = [ev ? `the event "${ev.name}" (id ${eventId}${ev.starts_at ? `, ${String(ev.starts_at).slice(0, 10)}` : ""})` : null, focus ? `this record: ${focus.slice(0, 400)}` : null].filter(Boolean).join("; ") || "their organiser workspace overview";
  const r = await ask(user.id, workspaceId, scope, question, { client: supabase, page, context: `${focus ? `CURRENTLY VIEWING (the record on screen): ${focus}\n\n` : ""}${eventId ? "EVENT RECORDS (this event only):" : "WORKSPACE OVERVIEW (all events, approvals, leads and conflicts in this workspace; NOT filtered to the record on screen):"}\n${context ?? "No records."}`, eventId: eventId ?? null, purpose: "ask_organizer" });
  if (r.ok) return NextResponse.json({ answer: r.answer || "I couldn't find enough information to answer that.", sources: r.sources });
  if (r.code === "credits") return NextResponse.json({ error: r.error, code: "credits" }, { status: 402 });
  if (r.code === "refused") return NextResponse.json({ error: r.error, code: "refused" }, { status: 422 });
  if (r.code === "unconfigured") return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ error: "Gala Agent couldn't respond right now. Please try again." }, { status: 502 });
}
