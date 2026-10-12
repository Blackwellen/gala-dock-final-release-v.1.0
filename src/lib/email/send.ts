import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

import { emailHtml, escapeHtml } from "./layout";

/**
 * Transactional email delivery (release spec §76–77) via Resend's REST API. Configuration: RESEND_API_KEY (or RESEND_API), optional
 * EMAIL_FROM (default "Gala Dock <no-reply@mail.galadock.com>", the sending domain must be verified in Resend) and EMAIL_REPLY_TO
 * (default support@galadock.com). Without a key the worker leaves mail queued and the health check reports it.
 */
const apiKey = () => process.env.RESEND_API_KEY || process.env.RESEND_API || "";
const fromAddress = () => process.env.EMAIL_FROM || "Gala Dock <no-reply@mail.galadock.com>";
const replyTo = () => process.env.EMAIL_REPLY_TO || "support@galadock.com";
export const emailConfigured = () => Boolean(apiKey());
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");
const EYEBROW: Record<string, string> = { security: "Account security", payments: "Payments", tickets: "Tickets", quotes: "Bookings & quotes", messages: "Messages", reminders: "Reminder", event_updates: "Event update" };
const CTA: Record<string, string> = { security: "Review your account", payments: "View payment details", tickets: "View tickets", quotes: "Open in Gala Dock", messages: "Reply in Gala Dock", reminders: "Take a look", event_updates: "View in Gala Dock" };

export function render(o: { subject: string; body: string; link?: string | null; category: string }) {
  const url = o.link ? (o.link.startsWith("http") ? o.link : `${site()}${o.link}`) : null;
  const prefs = `${site()}/account?tab=notifications`;
  const essential = ["security", "payments"].includes(o.category);
  const footer = essential ? "You’re receiving this because it concerns your account’s security or payments." : `You can change which emails you get in your notification settings: ${prefs}`;
  const text = `${o.subject}\n\n${o.body}${url ? `\n\nOpen in Gala Dock: ${url}` : ""}\n\n—\nGala Dock · Blackwellen Limited · VAT No. GB508480488\n${footer}`;
  const html = emailHtml({
    preheader: o.body.split("\n")[0]!.slice(0, 140), eyebrow: EYEBROW[o.category] ?? "Gala Dock", heading: o.subject,
    bodyHtml: `<p style="margin:0">${escapeHtml(o.body).replace(/\n{2,}/g, '</p><p style="margin:14px 0 0">').replace(/\n/g, "<br>")}</p>`,
    cta: url ? { label: CTA[o.category] ?? "Open in Gala Dock", url } : null,
    footerNote: essential ? escapeHtml(footer) : `You can change which emails you get in your <a href="${escapeHtml(prefs)}" style="color:#7a80b8;text-decoration:underline">notification settings</a>.`,
  });
  return { text, html };
}

type Row = { id: string; to_email: string; subject: string; body: string; link: string | null; category: string; attempts: number };

/** Drains the outbox. Idempotent per row (Resend Idempotency-Key = outbox id). */
export async function drainOutbox(limit = 25) {
  if (!emailConfigured()) return { configured: false, sent: 0, failed: 0 };
  const db = untyped(createAdminClient() as never);
  const { data } = await db.rpc("claim_email_batch", { p_limit: limit });
  let sent = 0, failed = 0;
  for (const r of (data ?? []) as Row[]) {
    const { text, html } = render(r);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${r.id}` },
        body: JSON.stringify({ from: fromAddress(), to: [r.to_email], subject: r.subject, text, html, reply_to: replyTo(),
          headers: ["security", "payments"].includes(r.category) ? undefined : { "List-Unsubscribe": `<${site()}/account?tab=notifications>` } }),
      });
      const j = await res.json().catch(() => ({})) as { id?: string; message?: string };
      if (res.ok) { sent++; await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: j.id ?? null, last_error: null, lease_until: null }).eq("id", r.id); }
      else {
        failed++;
        // Account-level problems (sending domain not verified, key revoked or send-restricted) aren't the recipient's fault: put the
        // whole batch back in the queue untouched and stop, so nothing is lost while the configuration is fixed.
        if (res.status === 401 || (res.status === 403 && /domain|not verified|api key/i.test(String(j.message ?? "")))) {
          await db.from("email_outbox").update({ status: "queued", attempts: Math.max(0, r.attempts - 1), last_error: `${res.status} ${String(j.message ?? "").slice(0, 200)}`, lease_until: null })
            .in("id", ((data ?? []) as Row[]).map(x => x.id)).eq("status", "sending");
          return { configured: true, sent, failed, blocked: String(j.message ?? `HTTP ${res.status}`).slice(0, 200) };
        }
        // Other 4xx (bad address, rejected content) won't succeed on retry: suppress after recording why.
        const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
        await db.from("email_outbox").update({ status: permanent ? "suppressed" : "failed", last_error: `${res.status} ${String(j.message ?? "").slice(0, 200)}`, lease_until: null }).eq("id", r.id);
      }
    } catch (e) { failed++; await db.from("email_outbox").update({ status: "failed", last_error: (e as Error).message.slice(0, 200), lease_until: null }).eq("id", r.id); }
  }
  return { configured: true, sent, failed };
}
