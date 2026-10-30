"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { payBooking } from "@/lib/marketplace/actions";
import type { ActionResult } from "./shell";

/**
 * Q15 customer build engine commands (migration 202610291029). Thin wrappers: the database commands authorise the caller,
 * enforce venue-first dependencies and lifecycle rules, and write audit/outbox. No AI (owner decision 2026-10-28).
 */
const Id = z.string().uuid();
const bump = (id: string) => { for (const p of ["", "/build", "/money", "/plan", "/book"]) revalidatePath(`/account/events/${id}${p}`); revalidatePath("/account/events"); };
const ERR: [RegExp, string][] = [
  [/not_authorized/, "You can't change this event."], [/event_closed/, "This event can no longer be changed."],
  [/date_required/, "Add your event date first — providers need it to check availability."],
  [/venue_required/, "Choose and hold a venue first — suppliers depend on the venue and date."],
  [/package_guest_range:(\d+)-(\d+)/, "This package doesn't fit your guest count."], [/package_unavailable|listing_unavailable/, "That option isn't available any more."],
  [/already_in_build/, "That provider is already in your build."], [/backup_same_provider/, "Choose a different provider as the backup."],
  [/not_holdable|invalid_hold_window/, "Holds are available once the provider has quoted or confirmed availability."],
  [/not_payable/, "One of the selected lines has no price to pay yet."], [/items_required/, "Choose what you'd like to book."],
];
const msg = (m: string, fallback: string) => ERR.find(([re]) => re.test(m))?.[1] ?? fallback;

async function rpc<T>(fn: string, args: Record<string, unknown>) {
  const ctx = await getCustomer();
  const { data, error } = await untyped(ctx.supabase).rpc(fn, args);
  return { ctx, data: data as T, error: error?.message ?? null };
}

/** Add a provider package to the build (terms snapshotted; estimate only, nothing booked). */
export async function addPackageToBuild(eventId: string, packageId: string, role: "primary" | "backup" = "primary"): Promise<ActionResult<string>> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(packageId).success) return { ok: false, error: "Package not found." };
  const r = await rpc<string>("build_add_package", { p_event: eventId, p_package: packageId, p_role: role });
  if (r.error) return { ok: false, error: msg(r.error, "Could not add the package.") };
  bump(eventId); return { ok: true, data: r.data, message: "Package added. Request a quote when you're ready — nothing is booked yet." };
}

/** Conditional hold, venue first: a supplier hold waits on the venue until the venue is confirmed. */
export async function requestBuildHold(eventId: string, itemId: string, hours: number): Promise<ActionResult<string>> {
  if (!Id.safeParse(itemId).success || !Number.isInteger(hours) || hours < 2 || hours > 336) return { ok: false, error: "Choose a hold length." };
  const r = await rpc<string>("build_request_hold", { p_item: itemId, p_hours: hours, p_conditions: "" });
  if (r.error) return { ok: false, error: msg(r.error, "Could not request a hold.") };
  bump(eventId); return { ok: true, data: r.data, message: "Hold requested. Nothing is charged until you confirm." };
}

/** Keep another provider as a backup for a line (same category). */
export async function addBuildBackup(eventId: string, primaryItemId: string, listingId: string): Promise<ActionResult<string>> {
  if (!Id.safeParse(primaryItemId).success || !Id.safeParse(listingId).success) return { ok: false, error: "Option not found." };
  const r = await rpc<string>("build_add_backup", { p_primary: primaryItemId, p_listing: listingId });
  if (r.error) return { ok: false, error: msg(r.error, "Could not add the backup.") };
  bump(eventId); return { ok: true, data: r.data, message: "Backup added." };
}

export async function giveSuggestionFeedback(eventId: string, listingId: string, action: "dismissed" | "not_relevant" | "too_expensive" | "unavailable" | "saved" | "clear"): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success || !Id.safeParse(listingId).success) return { ok: false, error: "Suggestion not found." };
  const r = await rpc("build_suggestion_feedback_set", { p_event: eventId, p_listing: listingId, p_action: action });
  if (r.error) return { ok: false, error: msg(r.error, "Could not save that.") };
  revalidatePath(`/account/events/${eventId}/build`); return { ok: true };
}

export async function saveBuildVersion(eventId: string, label: string): Promise<ActionResult<number>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const r = await rpc<number>("build_snapshot", { p_event: eventId, p_label: label.slice(0, 120) });
  if (r.error) return { ok: false, error: msg(r.error, "Could not save a version.") };
  return { ok: true, data: r.data, message: `Saved as version ${r.data}.` };
}

/**
 * Marketplace checkout: one order group over the chosen lines and one payment per child seller (direct charge on that
 * seller's account — never one pooled charge). Starts Stripe Checkout for the first child that is due; the others stay
 * payable from Money, so a partial payment is always recoverable.
 */
export async function checkoutBuild(eventId: string, itemIds: string[]): Promise<ActionResult<string>> {
  const ids = z.array(Id).min(1).max(30).safeParse(itemIds);
  if (!Id.safeParse(eventId).success || !ids.success) return { ok: false, error: "Choose what you'd like to book." };
  const r = await rpc<{ order_group_id: string; charges: { build_item_id: string; state: string; reason?: string }[] }>("build_checkout", { p_event: eventId, p_items: ids.data });
  if (r.error) return { ok: false, error: msg(r.error, "Couldn't start checkout. You haven't been charged.") };
  bump(eventId);
  const next = r.data.charges.find(c => c.state === "payment_due");
  if (!next) return { ok: true, message: r.data.charges.some(c => c.state === "blocked") ? "Some bookings can't be paid yet — check their status." : "Everything selected is already confirmed." };
  const pay = await payBooking("deposit", { itemId: next.build_item_id }, `/account/events/${eventId}/money`);
  if (!pay.ok || !pay.data) return { ok: false, error: ("error" in pay && pay.error) || "Couldn't start the payment. You haven't been charged." };
  return { ok: true, data: pay.data, message: "Taking you to secure payment…" };   // caller navigates to data (Stripe URL), as acceptQuote
}

/** Professional upgrade that also creates the Organizer workspace when the customer has none. Same event id; nothing is lost. */
export async function upgradeEventToOrganizer(eventId: string, workspaceName: string): Promise<ActionResult<string>> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const r = await rpc<string>("customer_upgrade_to_organizer", { p_event: eventId, p_workspace: null, p_name: workspaceName.trim().slice(0, 80) || null });
  if (r.error) return { ok: false, error: msg(r.error, "Could not move the event to an Organizer workspace.") };
  await untyped(r.ctx.supabase).rpc("remember_workspace", { p_workspace: r.data });
  revalidatePath("/account/events");
  return { ok: true, data: r.data, message: "Event moved to your Organizer workspace. Bookings, payments, guests and messages came with it.", redirect: `/organizer/events/${eventId}` };
}
