import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, sameOrigin } from "@/lib/security";
import { CONTACT_TOPICS, EMAIL_RE, normaliseEmail } from "@/lib/email/rules";
import { ipHash, turnstileOk } from "@/lib/comms/public";
import { untyped } from "@/lib/workspace/db";

const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store" } });

/**
 * Q05 / W01: public contact form that works signed out. Rate-limited per hashed IP (5/hour, also DB-enforced) and per email;
 * Turnstile-ready (off while captcha is disabled for QA). Stores a contact_submissions row and notifies support admins in-app.
 * Honeypot field `website` must stay empty.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ error: "Send the form as JSON." }, 400);
  if (typeof b.website === "string" && b.website.trim()) return json({ ok: true, reference: null });   // honeypot: silently accept
  const name = String(b.name ?? "").trim(), email = normaliseEmail(b.email), message = String(b.message ?? "").trim();
  const topic = (CONTACT_TOPICS as readonly string[]).includes(String(b.topic)) ? String(b.topic) : "general";
  if (name.length < 1 || name.length > 120 || !EMAIL_RE.test(email) || message.length < 10 || message.length > 5000) return json({ error: "Add your name, a valid email and a message of at least 10 characters." }, 400);
  const ip = ipHash(request);
  if (!(await rateLimit(`contact:${ip}`, 5, 3600)) || !(await rateLimit(`contact-email:${email}`, 5, 3600))) return json({ error: "You’ve sent several messages recently. Please try again later." }, 429);
  if (!(await turnstileOk(b.turnstile, request))) return json({ error: "Please complete the security check." }, 400);
  const { data: { user } } = await (await createClient()).auth.getUser();
  const { data, error } = await untyped(createAdminClient() as never).rpc("contact_submit", { p_name: name, p_email: email, p_topic: topic, p_message: message, p_ip_hash: ip, p_user: user?.id ?? null });
  if (error) { const limited = /rate_limited/.test(error.message); return json({ error: limited ? "You’ve sent several messages recently. Please try again later." : "Couldn’t send your message. Please email support@galadock.com." }, limited ? 429 : 500); }
  return json({ ok: true, reference: data });
}
