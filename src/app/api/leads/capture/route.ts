import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security";
import { ipHash } from "@/lib/comms/public";
import { untyped } from "@/lib/workspace/db";

const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store" } });

/**
 * Q16 lead capture (domain 53.1–53.2): an organiser's public enquiry form posts here. The workspace must enable capture and
 * share its capture key (settings.lead_capture = { enabled: true, key }). capture_lead() is service-only; this route rate-limits
 * per hashed IP and per email, drops honeypot submissions, and dedupes the same person within 24 hours onto one lead.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ error: "Send the form as JSON." }, 400);
  if (typeof b.website === "string" && b.website.trim()) return json({ ok: true });   // honeypot
  const ws = String(b.workspace ?? ""), key = String(b.key ?? "");
  const email = String(b.email ?? "").trim().toLowerCase(), name = String(b.name ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(ws) || !/^[A-Za-z0-9_-]{16,80}$/.test(key) || name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Add your name and a valid email." }, 400);
  const ip = ipHash(request);
  if (!(await rateLimit(`lead-capture:${ip}`, 10, 3600)) || !(await rateLimit(`lead-capture-email:${email}`, 5, 3600))) return json({ error: "Too many enquiries. Please try again later." }, 429);
  const s = (k: string, n: number) => String(b[k] ?? "").slice(0, n);
  const { data, error } = await untyped(createAdminClient() as never).rpc("capture_lead", { p_ws: ws, p_key: key, p: { name, email, phone: s("phone", 40), company: s("company", 120), event_name: s("event_name", 120), event_type: s("event_type", 40), date: s("date", 10), location: s("location", 160), guests: s("guests", 60), budget: s("budget", 60), message: s("message", 2000), source: s("source", 60) } });
  if (error) return json({ error: error.message.includes("capture_disabled") ? "This form isn't accepting enquiries." : "Couldn't send your enquiry." }, error.message.includes("capture_disabled") ? 403 : 400);
  return json({ ok: true, reference: (data as { reference?: string })?.reference ?? null });
}
