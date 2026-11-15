"use server";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipHash, turnstileOk } from "@/lib/comms/public";
import { EMAIL_RE } from "@/lib/email/rules";
import { rateLimit } from "@/lib/security";
import { isReportSubject, reportReasons, REPORT_ERRORS } from "@/lib/safety/content-reports";

type R = { ok: true } | { ok: false; error: string; login?: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Q74 (D8): report a listing, event, review or business profile. The database checks visibility, ownership and rate limits. */
export async function reportContent(subject: string, id: string, reason: string, note: string): Promise<R> {
  if (!isReportSubject(subject) || !UUID.test(id) || !reportReasons(subject).some(r => r.code === reason)) return { ok: false, error: "Choose a reason." };
  if (reason === "other_policy" && note.trim().length < 5) return { ok: false, error: "Tell us what’s wrong (a few words is enough)." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to report this. Or email support@galadock.com with a link to it.", login: true };
  if (!(await rateLimit(`content-report:${user.id}`, 30, 3600))) return { ok: false, error: "You’ve sent a lot of reports — try again later." };
  const { error } = await sb.rpc("report_content" as never, { p_subject_type: subject, p_subject_id: id, p_reason_code: reason, p_note: note.slice(0, 1000) } as never);
  if (error) return { ok: false, error: REPORT_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? "Couldn’t send the report — try again." };
  return { ok: true };
}

/**
 * Q75: report without an account (Online Safety Act s.20 — reporting must be easy for any user of the service). Turnstile (same
 * switch as the contact form), a hashed-IP rate limit, then the service-role-only report_content_public: public content only, one
 * report per subject per network, optional contact email for the Trust & Safety team (never shown to the reported party).
 */
export async function reportContentPublic(subject: string, id: string, reason: string, note: string, email: string, turnstile: string): Promise<R> {
  if (!isReportSubject(subject) || !UUID.test(id) || !reportReasons(subject).some(r => r.code === reason)) return { ok: false, error: "Choose a reason." };
  if (reason === "other_policy" && note.trim().length < 5) return { ok: false, error: "Tell us what’s wrong (a few words is enough)." };
  const em = email.trim().slice(0, 254);
  if (em && !EMAIL_RE.test(em)) return { ok: false, error: "Check the email address, or leave it empty." };
  const req = new Request("https://report.invalid/", { headers: await headers() });
  if (!(await turnstileOk(turnstile, req))) return { ok: false, error: "Please complete the security check." };
  const ip = ipHash(req);
  if (!(await rateLimit(`content-report-public:${ip}`, 10, 3600))) return { ok: false, error: "You’ve sent a lot of reports — try again later." };
  const { error } = await createAdminClient().rpc("report_content_public" as never, { p_subject_type: subject, p_subject_id: id, p_reason_code: reason, p_note: note.slice(0, 1000),
    p_email: em || null, p_ip_hash: ip } as never);
  if (error) return { ok: false, error: /note_required/.test(error.message) ? "Tell us what’s wrong (a few words is enough)." : /invalid_email/.test(error.message) ? "Check the email address, or leave it empty."
    : REPORT_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? "Couldn’t send the report — try again." };
  return { ok: true };
}
