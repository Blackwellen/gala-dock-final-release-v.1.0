"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { createInviteToken } from "@/lib/security";

const t = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const on = (fd: FormData, k: string) => fd.get(k) === "on";

async function save(p: Record<string, unknown>, message: string): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { error } = await db.rpc("provider_save_settings", { p_ws: workspace.id, p });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider", "layout");
  return { ok: true, message };
}

export async function saveProfile(fd: FormData): Promise<ActionResult> {
  return save({ name: t(fd, "trading_name", 80), section: "profile", value: { legal_name: t(fd, "legal_name", 120), address: t(fd, "address", 200), phone: t(fd, "phone", 40), email: t(fd, "email", 120),
    website: t(fd, "website", 120).replace(/^https?:\/\//, ""), language: t(fd, "language", 20) || "English (UK)", timezone: "Europe/London", tagline: t(fd, "tagline", 160) } }, "Workspace profile saved");
}

export async function setCapability(kind: "venue" | "service", enabled: boolean): Promise<ActionResult> {
  const { workspace } = await getProvider();
  const caps = new Set(workspace.capabilities);
  if (enabled) caps.add(kind); else caps.delete(kind);
  return save({ capabilities: [...caps] }, enabled ? `${kind === "venue" ? "Venue operations" : "Supplier services"} switched on` : `${kind === "venue" ? "Venue operations" : "Supplier services"} switched off`);
}

export async function saveBooking(fd: FormData): Promise<ActionResult> {
  return save({ section: "booking", value: { response_hours: Number(t(fd, "response_hours", 3)) || 4, cancellation: t(fd, "cancellation", 40), holds: on(fd, "holds"), standby: on(fd, "standby"), emergency: on(fd, "emergency"), auto_response: on(fd, "auto_response") } }, "Booking rules saved — accepted bookings keep their agreed terms");
}
export async function saveComms(fd: FormData): Promise<ActionResult> {
  return save({ section: "communications", value: { from_name: t(fd, "from_name", 80), email: t(fd, "email", 120), reply_to: t(fd, "reply_to", 120), customer_notifications: on(fd, "customer_notifications") } }, "Communication settings saved");
}
export async function saveNotifications(fd: FormData): Promise<ActionResult> {
  const v = Object.fromEntries(["enquiries", "bookings", "agent", "mentions"].map(k => [k, { email: on(fd, `${k}_email`), in_app: on(fd, `${k}_app`), sms: on(fd, `${k}_sms`) }]));
  return save({ section: "notifications", value: v }, "Notification preferences saved");
}
export async function saveAgent(fd: FormData): Promise<ActionResult> {
  return save({ section: "agent", value: { response_automation: on(fd, "response_automation"), quote_generation: on(fd, "quote_generation"), availability_management: on(fd, "availability_management"), pre_event_confirmations: on(fd, "pre_event_confirmations"), approval: "required" } }, "Gala Agent settings saved — actions still need your approval");
}
export async function saveTax(fd: FormData): Promise<ActionResult> {
  const registered = on(fd, "vat_registered"), number = t(fd, "vat_number", 20).toUpperCase().replace(/\s+/g, " ");
  if (registered && !/^GB ?\d{3} ?\d{4} ?\d{2}$|^GB ?\d{9}$|^IE\w{8,9}$/.test(number)) return { ok: false, error: "Enter a valid VAT number (e.g. GB 123 4567 89)." };
  return save({ section: "tax", value: { vat_registered: registered, number: registered ? number : "", rate_bps: registered ? 2000 : 0, jurisdiction: "GB" } }, "Tax settings saved");
}

/** Owner invites a teammate (uses the same hashed, expiring invite tokens as onboarding). Returns the link to share. */
export async function inviteMember(fd: FormData): Promise<ActionResult> {
  const { db, workspace, role, userId } = await getProvider();
  if (role !== "owner") return { ok: false, error: "Only the workspace owner can invite members." };
  const email = t(fd, "email", 120).toLowerCase(), r = t(fd, "role", 20);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !["manager", "member", "finance"].includes(r)) return { ok: false, error: "Enter a valid email and role." };
  const { token, hash } = createInviteToken();
  const { error } = await db.from("workspace_invites").insert({ workspace_id: workspace.id, email, role: r, token_hash: hash, invited_by: userId });
  if (error?.code === "23505") return { ok: false, error: "This person already has a pending invitation." };
  if (error) return { ok: false, error: "Couldn’t create the invitation." };
  revalidatePath("/provider/settings");
  return { ok: true, message: `Invitation created — share this link with ${email}: /invite/${token}` };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const { db, workspace, role } = await getProvider();
  if (role !== "owner") return { ok: false, error: "Only the workspace owner can manage invitations." };
  const { error } = await db.from("workspace_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspace.id).is("accepted_at", null);
  if (error) return { ok: false, error: "Couldn’t revoke the invitation." };
  revalidatePath("/provider/settings");
  return { ok: true, message: "Invitation revoked" };
}
