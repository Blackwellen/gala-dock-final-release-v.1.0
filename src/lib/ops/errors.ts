/**
 * Friendly text for the machine-readable errors raised by the event operations commands
 * (Q24 partners, Q25 logistics, Q26 compliance / accessibility / weather). Shared by the server actions;
 * never exposes raw Postgres text to the UI.
 */
type PgError = { message?: string; details?: string | null; code?: string } | null | undefined;

const detailJson = (d?: string | null): Record<string, unknown> => { try { return d ? JSON.parse(d) as Record<string, unknown> : {}; } catch { return {}; } };

const MAP: [RegExp, (e: NonNullable<PgError>) => string][] = [
  [/not_authorized/, () => "Only the event's owners and managers can do that."],
  [/organizer_events_only/, () => "This works on organiser events only."],
  [/illegal \w+ transition (\S+) -> (\S+)/, e => { const m = /transition (\S+) -> (\S+)/.exec(e.message ?? ""); return m ? `Can't move from ${m[1]!.replace(/_/g, " ")} to ${m[2]!.replace(/_/g, " ")}.` : "That status change isn't allowed."; }],
  // Q24 partners
  [/package_sold_out/, e => `This package is sold out${e.details ? ` (${e.details})` : ""}. Raise the quantity or choose another package.`],
  [/package_not_available/, () => "That package isn't available for this kind of partner (it may be retired or for a different kind)."],
  [/package_locked/, () => "The package can't change once the partner is confirmed — the deal is snapshotted."],
  [/quantity_below_allocated/, () => "Quantity can't go below the number of partners already confirmed on this package."],
  [/too_many_benefits/, () => "A package can have at most 50 benefits."],
  [/client_not_in_workspace/, () => "That client isn't in this workspace."],
  [/talent_not_in_workspace/, () => "That talent profile isn't in this workspace."],
  [/user_not_found/, () => "No Gala Dock account uses that email yet. Ask them to sign up first, then link again."],
  [/deliverable_closed/, () => "This deliverable is already approved or waived."],
  [/evidence_required/, () => "Add evidence (a link or note) before submitting."],
  [/note_required/, () => "Add a short note explaining the decision."],
  [/invalid_storage_path/, () => "That file isn't in your own upload folder."],
  [/media_not_in_event/, () => "That media asset doesn't belong to this event."],
  [/booth_map_conflict/, () => "Another booth already uses this code or map element."],
  [/map_element_not_found/, () => "That map element wasn't found on the selected map. Check the element reference in the map editor."],
  [/map_not_in_event/, () => "That map isn't this event's map."],
  [/zone_not_in_event/, () => "That access zone isn't part of this event."],
  [/party_not_eligible/, () => "Only active sponsors and exhibitors can be given a booth."],
  [/booth_taken/, () => "That booth is already allocated to another partner."],
  [/booth_unavailable/, () => "That booth is blocked or retired."],
  [/party_not_confirmed/, () => "Confirm the partner before issuing passes."],
  [/request_closed/, () => "This pass request is already fully issued or cancelled."],
  [/passes_unavailable/, () => "Access passes aren't available on this environment."],
  [/holders_required/, () => "Add at least one pass holder."],
  [/holder_name_required/, () => "Every pass holder needs a name."],
  [/pass_quantity_exceeded/, e => `Too many holders — ${e.details ?? "the request is nearly fully issued"}.`],
  [/item_not_in_event/, () => "That programme item isn't part of this event."],
  [/party_closed/, () => "This partner is closed (completed, cancelled or withdrawn)."],
  [/talent_double_booked/, e => `Double booked: ${e.details ?? "this talent already has a confirmed overlapping slot"}.`],
  [/talent_unavailable/, () => "This talent has marked themselves unavailable at that time."],
  [/riders_for_talent_only/, () => "Riders are for artists, speakers, performers and hosts."],
  [/invalid_items/, () => "Add between 1 and 200 rider items."],
  [/rider_not_pending/, () => "This rider has already been decided."],
  [/rider_not_accepted/, () => "Accept the rider before recording fulfilment."],
  [/rider_immutable/, () => "Submitted riders can't be edited — submit a new version."],
  [/contract_exists/, () => "This partner already has an active contract."],
  [/contract_not_in_event/, () => "That contract isn't in this workspace or event."],
  [/one_reference_required/, () => "Choose exactly one invoice or payment."],
  [/invoice_not_in_event/, () => "That invoice isn't in this workspace or event."],
  [/payment_not_in_event/, () => "That payment isn't on this event."],
  [/money_already_linked/, () => "That invoice or payment is already linked to a partner."],
  // Q25 logistics
  [/vehicle_capacity_exceeded/, e => `Vehicle capacity exceeded (${e.details ?? "too many passengers"}).`],
  [/equipment_conflict|equipment_unavailable|over_capacity/, e => `That vehicle is unavailable or already booked for an overlapping time (30 min buffer each side)${e.details ? ` — ${e.details}` : ""}.`],
  [/movement_closed/, () => "This movement is completed or cancelled."],
  [/invalid_window/, () => "The end must be after the start."],
  [/party_not_in_event/, () => "That partner isn't part of this event."],
  [/crew_not_in_workspace/, () => "That person isn't in this workspace."],
  [/booking_not_in_event/, () => "That booking isn't part of this event."],
  [/guest_not_in_event/, () => "That guest isn't on this event."],
  [/equipment_not_in_workspace/, () => "That vehicle isn't in this workspace's inventory."],
  [/accessible_parking_full/, e => { const d = detailJson(e.details); return `Accessible parking is full${d.area ? ` in ${d.area}` : ""} (${d.used ?? "all"} of ${d.accessible_spaces ?? "?"} accessible spaces issued for that time).`; }],
  [/parking_full/, e => { const d = detailJson(e.details); return `Parking is full${d.area ? ` in ${d.area}` : ""} (${d.used ?? "all"} of ${d.capacity ?? "?"} standard spaces issued for that time).`; }],
  [/parking_closed/, () => "This parking area is closed."],
  [/outside_opening_hours/, () => "The permit window is outside the area's opening hours."],
  [/duplicate_permit/, () => "This vehicle already has a permit for an overlapping time."],
  [/capacity_below_issued/, e => `Capacity can't go below the permits already issued (${e.details ?? ""}).`],
  [/rooms_below_allocated/, e => `Rooms can't go below what's allocated (${e.details ?? ""}).`],
  [/block_closed/, () => "This room block is released or cancelled."],
  [/block_past_cutoff/, e => `The block is past its cut-off date${e.details ? ` (${e.details})` : ""}. Ask the hotel to extend it.`],
  [/outside_block_dates/, () => "Those nights are outside the block's check-in / check-out dates."],
  [/duplicate_room_allocation/, () => "This person already has a room for overlapping nights."],
  [/rooms_full/, e => { const d = detailJson(e.details); return `No rooms left${d.night ? ` on the night of ${d.night}` : ""} (${d.rooms_total ?? "all"} rooms in the block).`; }],
  [/bay_not_at_venue/, () => "That loading bay isn't at this event's venue or is closed."],
  [/loading_slot_taken/, () => "That bay is already booked (including turnaround) for an overlapping time. Pick another time or bay."],
  [/listing_or_event_required/, () => "Choose the event for this loading bay."],
  // Q26 compliance
  [/reason_required/, () => "Explain why this licence isn't needed (at least 10 characters)."],
  [/reference_required/, () => "Add the licence reference before marking it granted."],
  [/valid_to_required/, () => "This licence type expires — add the valid-to date."],
  [/plan_empty/, () => "Add at least one section or a document before submitting."],
  [/plan_not_submitted/, () => "This plan version isn't waiting for a decision."],
  [/self_approval_not_allowed/, () => "A different manager must approve this plan (you wrote it). The workspace owner may approve their own."],
  [/plan_immutable/, () => "Submitted plans can't be edited — save a new draft version."],
  [/invalid_decision/, () => "Choose approve or request changes."],
  [/summary_required/, () => "Write the public accessibility summary before approving it."],
  [/decision_owner_required/, () => "Name the decision owner before approving the contingency plan."],
  [/not_found/, () => "That record no longer exists — refresh the page."],
  [/violates check constraint|invalid input syntax|out of range/, () => "Check the values entered — one of them isn't valid."],
];

export function opsError(e: PgError, fallback = "Couldn't save that change. Please try again."): string {
  if (!e?.message) return fallback;
  for (const [re, fn] of MAP) if (re.test(e.message)) return fn(e);
  return fallback;
}
