import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { chat, SAFETY, agentConfigured } from "@/lib/agent/llm";
import { buildContext } from "@/lib/agent/context";

const Body = z.object({ scope: z.enum(["customer", "organizer"]), eventId: z.string().uuid().optional(), question: z.string().trim().min(2).max(1500) });

/** Read-only Gala Agent Q&A grounded in the caller's RLS-scoped records. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use Gala Agent." }, { status: 401 });
  if (!(await hasRequiredAssurance(supabase))) return NextResponse.json({ error: "Complete multi-factor authentication first." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  if (!agentConfigured()) return NextResponse.json({ error: "Gala Agent isn't configured on this environment (Azure OpenAI keys missing)." }, { status: 503 });
  if (!(await rateLimit(`agent-ask:${user.id}`, 30, 3600))) return NextResponse.json({ error: "You've reached the hourly Gala Agent limit. Please try again later." }, { status: 429 });
  const { scope, eventId, question } = parsed.data;
  const context = await buildContext(supabase, user.id, scope, eventId);
  if (eventId && !context) return NextResponse.json({ error: "That event isn't available to you." }, { status: 404 });
  try {
    const { text } = await chat([
      { role: "system", content: `${SAFETY}\nAudience: ${scope === "customer" ? "a consumer planning a personal event or buying tickets; keep it friendly and simple" : "a professional event organizer; be operational and precise"}.\nToday is ${new Date().toISOString().slice(0, 10)}.` },
      { role: "user", content: `<data>\n${context ?? "No records."}\n</data>\n\nQuestion: ${question}` },
    ], { model: "mini", maxTokens: 700 });
    return NextResponse.json({ answer: text || "I couldn't find enough information to answer that." });
  } catch {
    return NextResponse.json({ error: "Gala Agent couldn't respond right now. Please try again." }, { status: 502 });
  }
}
