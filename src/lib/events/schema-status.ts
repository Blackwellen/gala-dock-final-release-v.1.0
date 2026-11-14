// Q47: schema.org eventStatus for the public event JSON-LD (it was always EventScheduled, even for a cancelled or postponed event).
// Pure module.
export function schemaEventStatus(status: string | null | undefined, settings?: Record<string, unknown> | null): { eventStatus: string; previousStartDate?: string } {
  const base = "https://schema.org/";
  if (status === "cancelled") return { eventStatus: `${base}EventCancelled` };
  if (status === "postponed") return { eventStatus: `${base}EventPostponed` };
  const prev = settings?.previous_starts_at ?? settings?.rescheduled_from;
  if (settings?.rescheduled === true || (typeof prev === "string" && prev)) return { eventStatus: `${base}EventRescheduled`, ...(typeof prev === "string" && prev ? { previousStartDate: prev } : {}) };
  return { eventStatus: `${base}EventScheduled` };
}
