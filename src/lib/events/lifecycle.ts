import "server-only";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

/** A precondition the event does not meet yet for the requested state (computed server-side by event_lifecycle_blockers). */
export type EventBlocker = { key: string; label: string; fix?: string };
type TransitionResult = { ok: boolean; changed?: boolean; conflict?: boolean; current?: string; error?: string; blockers?: EventBlocker[] };

const label = (s: string) => s.replace("_", " ");

/**
 * Row-guard refusals (W11 `trg_event_lifecycle_row_guard`): `lifecycle_preconditions: …` with the blockers as JSON in the error
 * detail. Returns the blocker list and a readable message, or null when the error is something else.
 */
export function lifecycleError(error: { message?: string; details?: string | null } | null | undefined, to?: string): { message: string; blockers: EventBlocker[] } | null {
  if (!error?.message || !/lifecycle_preconditions/.test(error.message)) return null;
  let blockers: EventBlocker[] = [];
  try { const b = JSON.parse(error.details ?? "[]") as unknown; if (Array.isArray(b)) blockers = b.filter((x): x is EventBlocker => !!x && typeof (x as EventBlocker).label === "string"); } catch { /* detail missing → fall back to the message text */ }
  if (!blockers.length) blockers = [{ key: "unknown", label: error.message.replace(/^.*lifecycle_preconditions:\s*/, "") }];
  return { blockers, message: `Before ${to ? `moving to ${label(to)}` : "this can go live"}: ${blockers.map(b => b.label.replace(/\.$/, "")).join("; ")}.` };
}

/**
 * Moves an event through its guarded lifecycle (`event_transition`): permission check, optimistic concurrency on the
 * expected state, event-type preconditions, then transition_state (row lock, state guard, event.state_changed outbox) and audit.
 */
export async function transitionEvent(client: Parameters<typeof untyped>[0], eventId: string, to: string, expected?: string, reason?: string): Promise<ActionResult<{ blockers?: EventBlocker[] }>> {
  const { data, error } = await untyped(client).rpc("event_transition", { p_event: eventId, p_to: to, p_expected: expected ?? null, p_reason: reason ?? null });
  if (error) {
    const m = error.message;
    const lc = lifecycleError(error, to); if (lc) return { ok: false, error: lc.message, data: { blockers: lc.blockers } };
    if (/illegal event transition/.test(m)) { const [, from] = /transition (\S+) ->/.exec(m) ?? []; return { ok: false, error: `An event can't move from ${label(from ?? expected ?? "its current state")} to ${label(to)}.` }; }
    if (/event_restricted/.test(m)) return { ok: false, error: "Gala Dock has restricted this event. Contact support to appeal." };
    if (/owners and managers/.test(m)) return { ok: false, error: "Only owners and managers can cancel, postpone, suspend or archive an event." };
    if (/not_authorized/.test(m)) return { ok: false, error: "You don't have permission to change this event." };
    if (/use_cancel_with_refunds/.test(m)) return { ok: false, error: "Paid tickets exist. Cancellation must run through the refund workflow so ticket holders are refunded first." };
    return { ok: false, error: "Could not update the event status." };
  }
  const r = (data ?? {}) as TransitionResult;
  if (r.conflict) return { ok: false, error: `This event was changed elsewhere and is now ${label(r.current ?? "different")}. Refresh and try again.` };
  if (!r.ok && r.blockers?.length) return { ok: false, error: `Before moving to ${label(to)}: ${r.blockers.map(b => b.label.replace(/\.$/, "")).join("; ")}.`, data: { blockers: r.blockers } };
  if (!r.ok) return { ok: false, error: "Could not update the event status." };
  return { ok: true };
}
