"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { stripe, stripeKey, stripePublishableKey } from "@/lib/stripe";
import { stripeCustomer, ownCard } from "@/lib/payments";
import { passwordChecks } from "@/lib/password";
import { customerInterests, currencies } from "@/lib/onboarding-schema";
import type { ActionResult } from "./shell";
import { untyped } from "@/lib/workspace/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { DELETION_GRACE_DAYS, passwordUpdateError, stepUpError } from "@/lib/settings/rules";

const bump = () => { revalidatePath("/account/settings"); revalidatePath("/", "layout"); };
const Profile = z.object({ full_name: z.string().trim().min(2).max(120), phone: z.string().trim().max(20), country: z.string().regex(/^[A-Z]{2}$/), language: z.string().max(5), bio: z.string().max(250), date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) });

export async function saveProfile(input: unknown): Promise<ActionResult> {
  const p = Profile.safeParse(input); if (!p.success) return { ok: false, error: "Check your details and try again." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("update_my_profile", { p: p.data });
  if (error) return { ok: false, error: error.message.includes("invalid_phone") ? "Enter a valid phone number." : error.message.includes("invalid_dob") ? "Enter a valid date of birth (13+)." : error.message.includes("invalid_name") ? "Enter your full name." : "Could not save your profile." };
  bump(); return { ok: true, message: "Profile updated." };
}

export async function saveEventPreferences(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ home_area: z.string().trim().max(150), currency: z.string().refine(v => currencies.some(c => c.value === v)), interests: z.array(z.string().refine(v => customerInterests.includes(v))).max(customerInterests.length) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your event preferences and try again." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.from("profiles").update({ ...parsed.data, interests: [...new Set(parsed.data.interests)] }).eq("id", ctx.user.id);
  if (error) return { ok: false, error: "Could not save your event preferences." };
  bump(); return { ok: true, message: "Event preferences updated." };
}

const NOTIF = ["event_updates", "tickets", "messages", "marketing", "reminders", "quotes"] as const;
export async function saveNotifications(prefs: Record<string, boolean>): Promise<ActionResult> {
  const clean = Object.fromEntries(Object.entries(prefs).filter(([k, v]) => (NOTIF as readonly string[]).includes(k) && typeof v === "boolean"));
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("update_my_profile", { p: { notifications: clean } });
  if (error) return { ok: false, error: "Could not save notification preferences." };
  bump(); return { ok: true, message: "Notification preferences saved." };
}

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  if (passwordChecks(next).some(c => !c.met)) return { ok: false, error: "Your new password doesn't meet the requirements." };
  if (current === next) return { ok: false, error: "Choose a password you haven't used here before." };
  const ctx = await getCustomer();
  // Q60: the current password used to be re-checked by signing in again on this cookie client. With captcha on that always failed
  // ("incorrect"), and for MFA users it swapped the aal2 session for a new aal1 one so updateUser failed. verify_my_password checks the
  // caller's own hash in the database (rate limited) without touching the session.
  const { data: matches, error: verr } = await untyped(ctx.supabase).rpc("verify_my_password", { p_password: current });
  if (verr) return { ok: false, error: /rate_limited/.test(verr.message) ? "Too many attempts. Wait 15 minutes and try again." : "Could not check your current password. Please try again." };
  if (matches !== true) return { ok: false, error: "Your current password is incorrect." };
  const { error } = await ctx.supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: passwordUpdateError(error) };
  // The success copy promises other devices are signed out: do it explicitly (audited as auth.sessions_revoked).
  await untyped(ctx.supabase).rpc("revoke_other_sessions");
  await writeAudit(ctx.user.id, null, "auth.password_changed", {});
  await untyped(createAdminClient() as never).from("notifications").insert({ user_id: ctx.user.id, kind: "security", title: "Your password was changed",
    body: "If this wasn't you, reset your password and contact support immediately.", link: "/account?tab=security" });
  return { ok: true, message: "Password changed. Other devices will need to sign in again." };
}

export async function accountDeletion(cancel: boolean, confirmText: string): Promise<ActionResult> {
  if (!cancel && confirmText.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const ctx = await getCustomer();
  if (!cancel) {
    // Q60: scheduling used to succeed even when the deletion worker would refuse (workspace with members, open dispute, upcoming
    // tickets), so the account sat "scheduled" while nothing happened. Ask first, and require the second factor when one is set up.
    const { error: stepUp } = await ctx.supabase.rpc("require_step_up", {});
    if (stepUp) return { ok: false, error: stepUpError(stepUp.message) ?? "Could not update your request." };
    const { data: blockers, error: berr } = await untyped(ctx.supabase).rpc("deletion_blockers");
    if (berr) return { ok: false, error: "Could not update your request." };
    const list = (blockers ?? []) as { detail: string }[];
    if (list.length) return { ok: false, error: `Before your account can be deleted: ${list.map(b => b.detail).join(" ")}` };
  }
  const { error } = await ctx.supabase.rpc("request_account_deletion", { p_cancel: cancel });
  if (error) return { ok: false, error: "Could not update your request." };
  await writeAudit(ctx.user.id, null, cancel ? "privacy.deletion_cancelled" : "privacy.deletion_requested", {});
  bump(); return { ok: true, message: cancel ? "Deletion cancelled — your account stays active." : `Your account is scheduled for deletion in ${DELETION_GRACE_DAYS} days. You can cancel any time before then.` };
}

export async function calendarFeed(): Promise<ActionResult<{ url: string }>> {
  const ctx = await getCustomer();
  const { data, error } = await ctx.supabase.rpc("rotate_calendar_token");
  if (error || !data) return { ok: false, error: "Could not create your calendar link." };
  return { ok: true, data: { url: `/api/calendar/${data}` } };
}

/** SetupIntent for adding a card with Stripe's Payment Element (card details never touch our servers). */
export async function startAddCard(): Promise<ActionResult<{ clientSecret: string; publishableKey: string }>> {
  // The publishable key must be the same mode as the platform key (a pk_live with an sk_test SetupIntent cannot confirm).
  const pk = stripePublishableKey();
  if (!stripeKey() || !pk) return { ok: false, error: "Payments aren't configured yet." };
  const ctx = await getCustomer();
  try {
    const cid = await stripeCustomer(ctx);
    const si = await stripe<{ client_secret: string }>("setup_intents", { customer: cid!, usage: "off_session", "automatic_payment_methods[enabled]": "true", "metadata[user_id]": ctx.user.id });
    return { ok: true, data: { clientSecret: si.client_secret, publishableKey: pk } };
  } catch { return { ok: false, error: "Could not start adding a card." }; }
}
export async function setDefaultCard(pm: string): Promise<ActionResult> {
  const ctx = await getCustomer(); const own = await ownCard(ctx, pm); if (!own) return { ok: false, error: "Card not found." };
  await stripe(`customers/${own.cid}`, { "invoice_settings[default_payment_method]": pm });
  bump(); return { ok: true, message: "Default card updated." };
}
export async function removeCard(pm: string): Promise<ActionResult> {
  const ctx = await getCustomer(); const own = await ownCard(ctx, pm); if (!own) return { ok: false, error: "Card not found." };
  await stripe(`payment_methods/${pm}/detach`, {});
  bump(); return { ok: true, message: "Card removed." };
}
