"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import { emailChangeError, emailChangeProblem } from "@/lib/settings/rules";
import { reauthenticate } from "@/lib/settings/reauth";
import type { ActionResult } from "./shell";

const mask = (e: string) => { const [u = "", d = ""] = e.split("@"); return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`; };
async function origin() {
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.galadock.com";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}
const Input = z.object({ email: z.string().trim().max(254), password: z.string().max(200).default("") });

/**
 * Q67 change of sign-in email (any workspace: customer, organiser, provider). Re-authentication (password or a fresh sign-in, then
 * aal2 when two-step verification is on) → Supabase Auth email change. The project has "secure email change" on, so Supabase
 * sends a confirmation link to BOTH the current and the new address and only switches once both are confirmed. We also send our
 * own security notice to the current address, write an audit row, and rate-limit requests (3 an hour). When the change completes,
 * the database hook (account_email_changed) audits it, emails the new address and queues the Stripe customer-contact sync.
 */
export async function requestEmailChange(input: unknown): Promise<ActionResult> {
  const p = Input.safeParse(input); if (!p.success) return { ok: false, error: "Enter a valid email address." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const next = p.data.email.toLowerCase();
  const problem = emailChangeProblem(user.email, next); if (problem) return { ok: false, error: problem };
  if (!(await rateLimit(`email-change:${user.id}`, 3, 3600))) return { ok: false, error: "Too many email change requests. Try again in an hour." };
  const denied = await reauthenticate(sb, user, p.data.password); if (denied) return { ok: false, error: denied };
  const back = "/account?tab=security&email=link";
  const { error } = await sb.auth.updateUser({ email: next }, { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(back)}` });
  if (error) return { ok: false, error: emailChangeError(error) };
  await writeAudit(user.id, null, "auth.email_change_requested", { new_domain: next.split("@")[1] ?? "" });
  // Notice to the CURRENT address (the auth email has not changed yet, so the outbox trigger mails the old mailbox).
  await untyped(createAdminClient() as never).from("notifications").insert({ user_id: user.id, kind: "security", title: "Email change requested",
    body: `Someone asked to change your Gala Dock sign-in email to ${mask(next)}. Nothing changes until the links sent to both addresses are confirmed. If this wasn't you, change your password and contact support now.`,
    link: "/account?tab=security" });
  revalidatePath("/account"); revalidatePath("/organizer/settings"); revalidatePath("/provider/settings");
  return { ok: true, message: `Check both inboxes: we've sent a confirmation link to ${user.email} and to ${next}. Your sign-in email changes once both are confirmed.` };
}
