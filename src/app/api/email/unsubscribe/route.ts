import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { escapeHtml } from "@/lib/email/layout";
import { verifyUnsubscribeToken, type OptionalEmailCategory } from "@/lib/email/rules";
import { unsubscribeSecret } from "@/lib/email/send";

/**
 * Q75 one-click unsubscribe (RFC 8058) for optional email categories.
 * POST (mail clients send `List-Unsubscribe=One-Click`, or the confirmation form below) turns that category's email preference off.
 * GET only shows a confirmation page: link scanners and previews follow GET links, so GET never changes anything.
 * The signed token names the user and the category; security and payments mail can't be unsubscribed (the token refuses them).
 */
const LABEL: Record<OptionalEmailCategory, string> = { tickets: "ticket", quotes: "booking and quote", messages: "new message", reminders: "reminder", event_updates: "event update" };
const page = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Gala Dock</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f6f7fb;color:#0d0d2b;margin:0;padding:48px 16px}main{max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 3px #0001}button{font:inherit;background:#3524f5;color:#fff;border:0;border-radius:10px;padding:10px 18px;cursor:pointer}a{color:#3524f5}</style></head>
<body><main><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</main></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
const settings = `<p><a href="/account?tab=notifications">Manage all email settings</a></p>`;

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const v = verifyUnsubscribeToken(unsubscribeSecret(), t);
  if (!v) return page("Link not valid", `<p>This unsubscribe link is incomplete or has been changed.</p>${settings}`, 400);
  return page("Unsubscribe", `<p>Stop ${LABEL[v.category]} emails from Gala Dock? You'll still see these alerts in the app, and security and payment emails always come.</p>
<form method="post" action="/api/email/unsubscribe?t=${escapeHtml(encodeURIComponent(t))}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form>${settings}`);
}

export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const v = verifyUnsubscribeToken(unsubscribeSecret(), t);
  if (!v) return page("Link not valid", `<p>This unsubscribe link is incomplete or has been changed.</p>${settings}`, 400);
  const db = untyped(createAdminClient() as never);
  const { data: p, error } = await db.from("profiles").select("notifications").eq("id", v.userId).maybeSingle();
  if (error) return page("Please try again", "<p>We couldn't update your settings just now.</p>", 503);
  if (!p) return page("Unsubscribed", `<p>There's no Gala Dock account for this link any more.</p>`);
  const prefs = { ...((p.notifications ?? {}) as Record<string, unknown>), [v.category]: false };
  const { error: e2 } = await db.from("profiles").update({ notifications: prefs }).eq("id", v.userId);
  if (e2) return page("Please try again", "<p>We couldn't update your settings just now.</p>", 503);
  await db.from("audit_events").insert({ actor_id: v.userId, actor_type: "user", event: "notifications.email_unsubscribed", metadata: { category: v.category, via: "list_unsubscribe" } });
  // RFC 8058 clients ignore the body; a person who pressed the button sees the confirmation.
  return page("Unsubscribed", `<p>You won't get ${LABEL[v.category]} emails any more. You can turn them back on in your settings.</p>${settings}`);
}
