// Gala Dock — Calendar hub data loader (V1-1).
// Reads the cross-section `calendar_range` RPC, which already aggregates events, tasks,
// run-sheet items, supplier bookings, invoice due dates, compliance, etc. Workspace-scoped
// by the RPC + RLS. Deep links are normalised to the /event-manager namespace.

import { createClient } from "@/lib/supabase/server";

export interface CalendarItem {
  id: string;
  title: string;
  kind: string;
  status: string;
  priority: string;
  tone: string;
  startsAt: string;
  endsAt: string | null;
  eventId: string | null;
  supplierId: string | null;
  venueName: string | null;
  href: string;
}

const APP_SEGMENTS = new Set([
  "home", "events", "finance", "forms", "inbox", "leads", "library", "proposals",
  "reports", "rfqs", "settings", "suppliers", "tasks", "team", "venues", "venue-management",
]);

/** Normalise an RPC-provided deep link to the /event-manager namespace post route-move. */
export function normaliseHref(link: string | null, eventId: string | null): string {
  if (link && link.startsWith("/")) {
    const seg = link.split("/")[1];
    if (seg === "event-manager") return link;
    if (APP_SEGMENTS.has(seg)) return `/event-manager${link}`;
    return link;
  }
  if (eventId) return `/event-manager/events/${eventId}`;
  return "/event-manager/calendar";
}

export async function getCalendarRange(
  workspaceId: string,
  fromISO: string,
  toISO: string,
  layers?: string[]
): Promise<CalendarItem[]> {
  const supabase = await createClient();
  const args: { _workspace_id: string; _from: string; _to: string; _layers?: string[] } = {
    _workspace_id: workspaceId,
    _from: fromISO,
    _to: toISO,
  };
  if (layers && layers.length) args._layers = layers;

  const { data, error } = await supabase.rpc("calendar_range", args);
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    priority: r.priority,
    tone: r.tone,
    startsAt: r.starts_at,
    endsAt: r.ends_at ?? null,
    eventId: r.event_id ?? null,
    supplierId: r.supplier_id ?? null,
    venueName: r.venue_name ?? null,
    href: normaliseHref(r.deep_link ?? null, r.event_id ?? null),
  }));
}
