"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { stripe, stripeKey } from "@/lib/stripe";
import { stripeCustomer, ownCard } from "@/lib/payments";
import { passwordChecks } from "@/lib/password";
import type { ActionResult } from "./shell";

const bump = () => { revalidatePath("/account/settings"); revalidatePath("/", "layout"); };
const Profile = z.object({ full_name: z.string().trim().min(2).max(120), phone: z.string().trim().max(20), country: z.string().regex(/^[A-Z]{2}$/), language: z.string().max(5), bio: z.string().max(250), date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")) });

export async function saveProfile(input: unknown): Promise<ActionResult> {
  const p = Profile.safeParse(input); if (!p.success) return { ok: false, error: "Check your details and try again." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("update_my_profile", { p: p.data });
  if (error) return { ok: false, error: error.message.includes("invalid_phone") ? "Enter a valid phone number." : error.message.includes("invalid_dob") ? "Enter a valid date of birth (13+)." : error.message.includes("invalid_name") ? "Enter your full name." : "Could not save your profile." };
  bump(); return { ok: true, message: "Profile updated." };
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
  const { error: reauth } = await ctx.supabase.auth.signInWithPassword({ email: ctx.user.email ?? "", password: current });
  if (reauth) return { ok: false, error: "Your current password is incorrect." };
  const { error } = await ctx.supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: error.message.includes("weak") ? "That password is too weak." : "Could not change your password." };
  return { ok: true, message: "Password changed. Other devices will need to sign in again." };
}

export async function accountDeletion(cancel: boolean, confirmText: string): Promise<ActionResult> {
  if (!cancel && confirmText.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("request_account_deletion", { p_cancel: cancel });
  if (error) return { ok: false, error: "Could not update your request." };
  bump(); return { ok: true, message: cancel ? "Deletion cancelled — your account stays active." : "Your account is scheduled for deletion in 30 days. You can cancel any time before then." };
}

export async function calendarFeed(): Promise<ActionResult<{ url: string }>> {
  const ctx = await getCustomer();
  const { data, error } = await ctx.supabase.rpc("rotate_calendar_token");
  if (error || !data) return { ok: false, error: "Could not create your calendar link." };
  return { ok: true, data: { url: `/api/calendar/${data}` } };
}

/** SetupIntent for adding a card with Stripe's Payment Element (card details never touch our servers). */
export async function startAddCard(): Promise<ActionResult<{ clientSecret: string; publishableKey: string }>> {
  const pk = process.env.NODE_ENV === "production" ? process.env.STRIPE_PUBLIC_KEY : (process.env.STRIPE_PUBLIC_KEY_SANDBOX ?? process.env.STRIPE_PUBLIC_KEY);
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
