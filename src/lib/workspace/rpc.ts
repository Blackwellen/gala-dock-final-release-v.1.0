import "server-only";
import type { Db } from "./db";

export type ActionResult = { ok: true; message?: string; redirect?: string } | { ok: false; error: string };

/** Maps database error codes raised by the domain functions to messages people can act on. */
const messages: [RegExp, string][] = [
  [/not_authorized/, "You don’t have permission to do that."],
  [/reason_required/, "Please give a reason (at least 5 characters)."],
  [/outcome_required/, "Please document the outcome before resolving."],
  [/hard_conflict/, "That clashes with an existing confirmed booking or hold, so it can’t be accepted."],
  [/crew_conflict/, "That person is already assigned during this time."],
  [/request_expired|^expired$/, "The response deadline has passed. The request is now marked Expired / No response."],
  [/not_open|not_quotable/, "This request is no longer open for a response."],
  [/items_required/, "Add at least one line item."],
  [/invalid_items/, "Every line needs a description, a quantity above zero and a price of £0 or more."],
  [/quote_not_draft/, "Only draft quotes can be edited or sent. Open a revision instead."],
  [/layout_exceeds_capacity/, "A layout capacity is larger than the room’s maximum capacity."],
  [/instant_requires_price/, "Instant booking needs a published price."],
  [/capacity_required/, "Add a capacity before publishing this space."],
  [/turnaround_conflict/, "That time falls inside this space’s turnaround buffer next to another booking."],
  [/exclusive_conflict/, "An exclusive space is already booked at that time — they can’t be used together."],
  [/invalid_space_link/, "Linked and exclusive spaces must be other spaces in the same venue."],
  [/invalid_rules/, "Turnaround can’t be negative and the minimum hire must be above zero."],
  [/invalid_capacity/, "The minimum capacity can’t be larger than the maximum."],
  [/invalid_name/, "Enter a name between 2 and 100 characters."],
  [/invalid_elements/, "The map couldn’t be read — reload and try again."],
  [/capability_disabled/, "Turn this capability on in Settings first."],
  [/price_required/, "Set a price above £0 before publishing."],
  [/protected_element_removed/, "Protected elements (like fire exits) can’t be removed from a published map."],
  [/tool_not_permitted/, "Gala Agent isn’t permitted to use that tool in this workspace."],
  [/over_capacity/, "Guest count exceeds the space’s capacity."],
  [/invalid_transition/, "That status change isn’t allowed from the current state."],
  [/restricted_by_platform/, "This listing is restricted by Gala Dock review and can’t be changed here."],
  [/commercial_snapshot_immutable/, "Accepted commercial terms are locked."],
  [/cannot_restrict_self/, "You can’t restrict your own account."],
  [/already_decided|approval_not_pending/, "This approval has already been decided."],
  [/not_found/, "That record no longer exists."],
];

export function friendly(error: { message?: string; code?: string } | null | undefined) {
  const text = error?.message ?? "";
  return messages.find(([re]) => re.test(text))?.[1] ?? "Something went wrong. Nothing was changed — please try again.";
}

export async function call(db: Db, fn: string, args: Record<string, unknown>, success: string, redirect?: string): Promise<ActionResult> {
  const { data, error } = await db.rpc(fn, args);
  if (error) return { ok: false, error: friendly(error) };
  if (data === "expired") return { ok: false, error: friendly({ message: "expired" }) };
  return { ok: true, message: success, redirect };
}
