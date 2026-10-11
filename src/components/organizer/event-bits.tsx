import type { EventStats } from "@/lib/data/organizer";
import { eventTypeLabel } from "@/lib/format";
import { Chip } from "@/components/kit";

type Tone = "blue" | "purple" | "green" | "amber" | "red" | "pink" | "cyan" | "gray";
const TYPE_TONE: Record<string, Tone> = { festival: "pink", corporate: "blue", food_drink: "green", nightlife: "pink", wedding: "pink", conference: "blue", community: "green", awards: "purple", party: "purple", comedy: "amber", birthday: "pink", private_dinner: "amber", webinar: "cyan" };
export const TypeChip = ({ type }: { type: string }) => <Chip tone={TYPE_TONE[type] ?? "gray"}>{eventTypeLabel(type)}</Chip>;

/** Display phase derived from canonical status + readiness (never a separate stored value). */
export function phaseOf(e: Pick<EventStats, "status" | "readiness" | "starts_at" | "providersConfirmed" | "providersTotal">): { label: string; tone: Tone } {
  const soon = e.starts_at ? (new Date(e.starts_at).getTime() - Date.now()) / 864e5 < 75 : false;
  if (e.status === "draft") return { label: "Draft", tone: "gray" };
  if (e.status === "live") return { label: "Live", tone: "green" };
  if (["completed", "closed"].includes(e.status)) return { label: "Completed", tone: "gray" };
  if (e.status === "cancelled") return { label: "Cancelled", tone: "red" };
  if (e.status === "postponed") return { label: "Postponed", tone: "amber" };
  if (e.status === "archived") return { label: "Archived", tone: "gray" };
  if (e.readiness < 50 && soon) return { label: "At risk", tone: "red" };
  if (e.status === "planning" && e.providersTotal > e.providersConfirmed) return { label: "Suppliers", tone: "amber" };
  if (e.status === "planning") return { label: "Planning", tone: "blue" };
  if (["ready", "published", "on_sale"].includes(e.status)) return { label: e.status === "on_sale" ? "On sale" : "Confirmed", tone: "green" };
  return { label: "Planning", tone: "blue" };
}
export const PhaseChip = ({ e }: { e: Parameters<typeof phaseOf>[0] }) => { const p = phaseOf(e); return <Chip tone={p.tone}>{p.label}</Chip>; };

/** Next best action from the failing readiness checks (server-computed), falling back to the next open task. */
export function nextAction(e: EventStats): { label: string; href: string; urgent: boolean } {
  const fail = (k: string) => e.checks.some(c => c.key === k && !c.ok);
  const base = `/organizer/events/${e.id}`;
  if (e.status === "draft") return { label: "Complete details", href: `${base}?tab=plan&section=brief`, urgent: false };
  if (fail("venue")) return { label: "Confirm venue", href: `${base}?tab=plan&section=venue`, urgent: true };
  if (fail("providers")) return { label: "Confirm supplier", href: `${base}?tab=plan&section=suppliers`, urgent: true };
  if (fail("payments")) return { label: "Settle overdue payment", href: `${base}?tab=money&section=payables`, urgent: true };
  if (fail("guests")) return { label: "Set up tickets", href: `${base}/tickets/setup?step=1`, urgent: false };
  if (e.nextTask) return { label: e.nextTask.title.length > 22 ? `${e.nextTask.title.slice(0, 20)}…` : e.nextTask.title, href: `${base}?tab=plan&section=tasks`, urgent: false };
  if (["on_sale", "published"].includes(e.status)) return { label: "Start promotion", href: `${base}/promotion`, urgent: false };
  return { label: "View checklist", href: `${base}?tab=overview`, urgent: false };
}
export const readinessTone = (r: number) => (r >= 75 ? "green" : r >= 50 ? "amber" : "red") as "green" | "amber" | "red";
