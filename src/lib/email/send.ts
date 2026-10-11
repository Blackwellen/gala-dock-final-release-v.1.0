import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

/**
 * Transactional email delivery (release spec §76–77) via Resend's REST API. Configuration contract: RESEND_API_KEY and EMAIL_FROM
 * (a verified sender, e.g. "Gala Dock <no-reply@mail.galadock.com>"); optional EMAIL_REPLY_TO. Without them the worker leaves mail
 * queued and the health check reports BLOCKED_EXTERNAL_CONFIGURATION.
 */
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function render(o: { subject: string; body: string; link?: string | null; category: string }) {
  const url = o.link ? (o.link.startsWith("http") ? o.link : `${site()}${o.link}`) : null;
  const prefs = `${site()}/account?tab=notifications`;
  const footer = ["security", "payments"].includes(o.category) ? "You’re receiving this because it concerns your account’s security or payments." : `You can change which emails you get in your notification settings: ${prefs}`;
  const text = `${o.subject}\n\n${o.body}${url ? `\n\nOpen in Gala Dock: ${url}` : ""}\n\n—\nGala Dock · Blackwellen Ltd\n${footer}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fd;font-family:Inter,Arial,sans-serif;color:#090a52">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#0038fd">GALA DOCK</p>
<h1 style="margin:0 0 12px;font-size:20px">${esc(o.subject)}</h1>
<p style="margin:0 0 18px;line-height:1.6;color:#2b3080;white-space:pre-line">${esc(o.body)}</p>
${url ? `<a href="${esc(url)}" style="display:inline-block;background:#0038fd;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:9px">Open in Gala Dock</a>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#7a80b8;line-height:1.5">Gala Dock · Blackwellen Ltd<br>${esc(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
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
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${r.id}` },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [r.to_email], subject: r.subject, text, html, ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
          headers: ["security", "payments"].includes(r.category) ? undefined : { "List-Unsubscribe": `<${site()}/account?tab=notifications>` } }),
      });
      const j = await res.json().catch(() => ({})) as { id?: string; message?: string };
      if (res.ok) { sent++; await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: j.id ?? null, last_error: null, lease_until: null }).eq("id", r.id); }
      else {
        failed++;
        // 4xx other than rate limits won't succeed on retry (bad address, unverified domain): suppress after recording why.
        const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
        await db.from("email_outbox").update({ status: permanent ? "suppressed" : "failed", last_error: `${res.status} ${String(j.message ?? "").slice(0, 200)}`, lease_until: null }).eq("id", r.id);
      }
    } catch (e) { failed++; await db.from("email_outbox").update({ status: "failed", last_error: (e as Error).message.slice(0, 200), lease_until: null }).eq("id", r.id); }
  }
  return { configured: true, sent, failed };
}
