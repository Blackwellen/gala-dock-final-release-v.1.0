import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, sameOrigin } from "@/lib/security";
import { CONSENT_VERSION, EMAIL_RE, MARKETING_TOPICS, normaliseEmail } from "@/lib/email/rules";
import { ipHash, newToken, tokenHash, turnstileOk } from "@/lib/comms/public";
import { untyped } from "@/lib/workspace/db";

const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "no-store" } });
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");

/**
 * Q05 / W01: newsletter and product-updates subscription with double opt-in (marketing consent, PECR). Works signed out.
 * POST {email, topic, consent: true} creates a pending row and queues one confirmation email in the outbox (reserved test domains
 * are suppressed there, never sent). Nothing marketing is sent until the link is confirmed. The response never reveals whether
 * an address was already known.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = normaliseEmail(b?.email), topic = String(b?.topic ?? "newsletter");
  if (!EMAIL_RE.test(email) || !(MARKETING_TOPICS as readonly string[]).includes(topic)) return json({ error: "Enter a valid email address." }, 400);
  if (b?.consent !== true) return json({ error: "Tick the box to agree to receive these emails." }, 400);
  const ip = ipHash(request);
  if (!(await rateLimit(`subscribe:${ip}`, 10, 3600)) || !(await rateLimit(`subscribe-email:${email}`, 3, 3600))) return json({ error: "Too many requests. Please try again later." }, 429);
  if (!(await turnstileOk(b?.turnstile, request))) return json({ error: "Please complete the security check." }, 400);
  const token = newToken();
  const { data: { user } } = await (await createClient()).auth.getUser();
  const db = untyped(createAdminClient() as never);
  const { data, error } = await db.rpc("marketing_subscribe", { p_email: email, p_topic: topic, p_token_hash: tokenHash(token), p_consent_version: CONSENT_VERSION, p_source: "web", p_ip_hash: ip, p_user: user?.id ?? null });
  if (error) { const limited = /rate_limited/.test(error.message); return json({ error: limited ? "Too many requests. Please try again later." : "Couldn’t subscribe right now." }, limited ? 429 : 500); }
  const r = data as { status: string; send_confirmation: boolean };
  if (r.send_confirmation) {
    const label = topic === "newsletter" ? "the Gala Dock newsletter" : "Gala Dock product updates";
    await db.from("email_outbox").insert({ user_id: user?.id ?? null, to_email: email, category: "consent_confirmation", subject: `Confirm your subscription to ${label}`,
      body: `Please confirm you want to receive ${label}. If you didn’t ask for this, ignore this email and nothing will be sent.`,
      link: `${site()}/api/subscriptions/confirm?token=${token}` });
  }
  return json({ ok: true, status: r.status === "confirmed" ? "confirmed" : "pending" });
}
