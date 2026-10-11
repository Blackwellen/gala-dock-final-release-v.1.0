import "server-only";
import { untyped } from "@/lib/workspace/db";

// Read model for one marketplace booking line (§33–37, §44–45). Uses the caller's RLS-scoped client only.

export type LcItem = {
  id: string; event_id: string; listing_id: string | null; request_id: string | null; title: string; category: string; status: string; role: string;
  amount: number | null; deposit: number | null; response_deadline: string | null; sent_at: string | null; responded_at: string | null;
  response_status: "pending" | "responded" | "expired" | null; hold_expires_at: string | null; terms_snapshot: Record<string, unknown> | null;
};
export type LcHold = { id: string; status: string; requested_hours: number; expires_at: string | null; created_at: string; conditions: string; provider_note: string; dependency_state: string; depends_on_item_id: string | null; source: string };
export type LcStandby = { id: string; status: string; primary_item_id: string | null; window_start: string; window_end: string; standby_fee: number | null; activation_price: number | null; cancellation_terms: string; organizer_note: string; expires_at: string | null; fee_status: string; activated_at: string | null };
export type LcCancellation = { id: string; party: string; kind: string; reason: string; status: string; requires_review: boolean; calculation: { refund_amount: number | null; provider_retains: number | null; paid: number; refund_pct: number | null; notes: string[] }; requested_by: string | null; created_at: string; decision_note: string | null };
export type LcDispute = { id: string; reference: string; status: string; reason: string; opened_by_party: string; created_at: string; response_due_at: string };
export type Lifecycle = {
  item: LcItem; event: { id: string; name: string; starts_at: string | null; workspace_id: string | null }; listing: { name: string; workspace_id: string } | null;
  holds: LcHold[]; standby: LcStandby[]; cancellations: LcCancellation[]; disputes: LcDispute[]; siblings: { id: string; title: string; status: string; category: string }[];
};

export async function loadLifecycle(client: unknown, itemId: string): Promise<Lifecycle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const db = untyped(client as never);
  const { data: item } = await db.from("build_items").select("id,event_id,listing_id,request_id,title,category,status,role,amount,deposit,response_deadline,sent_at,responded_at,response_status,hold_expires_at,terms_snapshot").eq("id", itemId).maybeSingle();
  if (!item) return null;
  const [ev, listing, holds, standby, cancellations, disputes, siblings] = await Promise.all([
    db.from("events").select("id,name,starts_at,workspace_id").eq("id", item.event_id).maybeSingle(),
    item.listing_id ? db.from("listings").select("name,workspace_id").eq("id", item.listing_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("conditional_holds").select("id,status,requested_hours,expires_at,created_at,conditions,provider_note,dependency_state,depends_on_item_id,source").eq("build_item_id", itemId).order("created_at", { ascending: false }).limit(5),
    db.from("standby_commitments").select("id,status,primary_item_id,window_start,window_end,standby_fee,activation_price,cancellation_terms,organizer_note,expires_at,fee_status,activated_at").eq("build_item_id", itemId).order("created_at", { ascending: false }).limit(5),
    db.from("booking_cancellations").select("id,party,kind,reason,status,requires_review,calculation,requested_by,created_at,decision_note").eq("build_item_id", itemId).order("created_at", { ascending: false }).limit(5),
    db.from("booking_disputes").select("id,reference,status,reason,opened_by_party,created_at,response_due_at").eq("build_item_id", itemId).order("created_at", { ascending: false }).limit(5),
    db.from("build_items").select("id,title,status,category").eq("event_id", item.event_id).neq("id", itemId).not("status", "in", "(suggested,draft,cancelled)").order("sort").limit(40),
  ]);
  if (!ev.data) return null;
  return {
    item: item as LcItem, event: ev.data, listing: listing.data, holds: (holds.data ?? []) as LcHold[], standby: (standby.data ?? []) as LcStandby[],
    cancellations: (cancellations.data ?? []) as LcCancellation[], disputes: (disputes.data ?? []) as LcDispute[], siblings: siblings.data ?? [],
  };
}

/** Labels shared by every portal. Declined, Unavailable and Expired/No response stay distinct (§33). */
export const STATUS_LABEL: Record<string, [string, "green" | "blue" | "orange" | "red" | "grey" | "purple"]> = {
  sent: ["Awaiting response", "orange"], awaiting: ["Awaiting response", "orange"], awaiting_provider: ["Awaiting response", "orange"],
  available: ["Available", "green"], quoted: ["Quote received", "green"], quote_received: ["Quote received", "green"], quote_revised: ["Quote revised", "green"],
  clarification: ["Clarification requested", "blue"], clarification_requested: ["Clarification requested", "blue"], customer_reviewing: ["Reviewing", "blue"],
  conditional_hold_requested: ["Hold requested", "purple"], held: ["On hold", "purple"], conditionally_held: ["On hold", "purple"],
  standby: ["Standby", "purple"], standby_offered: ["Standby offered", "purple"], standby_accepted: ["On standby", "purple"],
  awaiting_payment: ["Awaiting payment", "orange"], awaiting_confirmation: ["Awaiting confirmation", "orange"], confirmed: ["Confirmed", "green"],
  active: ["In progress", "blue"], fulfilled: ["Delivered", "green"], completion_pending: ["Completing", "blue"], completed: ["Completed", "green"],
  cancellation_requested: ["Cancellation requested", "orange"], cancelled_by_customer: ["Cancelled by customer", "grey"], cancelled_by_provider: ["Cancelled by provider", "red"],
  replacement_required: ["Replacement needed", "red"], disputed: ["In dispute", "red"], refunded: ["Refunded", "grey"], partially_refunded: ["Partly refunded", "grey"],
  declined: ["Declined", "red"], unavailable: ["Unavailable", "red"], expired: ["No response", "grey"], expired_no_response: ["No response", "grey"], cancelled: ["Removed", "grey"],
};
export const DISPUTE_REASONS: [string, string][] = [
  ["service_not_delivered", "Service not delivered"], ["materially_different", "Materially different service"], ["provider_cancellation", "Provider cancellation"],
  ["cancellation_disagreement", "Cancellation disagreement"], ["damage", "Damage"], ["late_arrival", "Late arrival"], ["partial_service", "Partial service"],
  ["venue_issue", "Venue issue"], ["other", "Something else"],
];
export const DISPUTE_STATUS: Record<string, string> = {
  opened: "Opened", evidence_collection: "Collecting evidence", provider_response: "Awaiting response", review: "Gala Dock review",
  resolution_proposed: "Resolution proposed", resolved: "Resolved", escalated: "Escalated",
};
