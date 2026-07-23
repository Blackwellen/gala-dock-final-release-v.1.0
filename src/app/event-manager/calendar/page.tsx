import Link from "next/link";
import { Lock } from "lucide-react";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";
import { getCalendarRange } from "./data";
import type { CalendarItem as RpcCalendarItem } from "./data";
import { monthGrid, weekGrid, todayISODate } from "./grid";
import { CalendarClient } from "./CalendarClient";
import type { CalendarItem, BadgeType, ViewMode } from "./types";
import type { GanttGroup } from "./GanttView";

/** Load canonical `tasks` rows with a due date, grouped by event, for the Gantt view. */
async function getGanttGroups(workspaceId: string): Promise<GanttGroup[]> {
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_at, started_at, is_milestone, event_id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .not("event_id", "is", null)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(300);

  const rows = tasks ?? [];
  if (rows.length === 0) return [];

  const eventIds = Array.from(new Set(rows.map((t) => t.event_id).filter(Boolean))) as string[];
  const { data: events } = await supabase
    .from("events")
    .select("id, name, start_at, end_at")
    .eq("workspace_id", workspaceId)
    .in("id", eventIds);

  const taskIds = rows.map((t) => t.id);
  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("task_id, depends_on_task_id")
    .in("task_id", taskIds);
  const depsByTask = new Map<string, string[]>();
  for (const d of deps ?? []) {
    const list = depsByTask.get(d.task_id) ?? [];
    list.push(d.depends_on_task_id);
    depsByTask.set(d.task_id, list);
  }

  const now = Date.now();
  const groupsByEvent = new Map<string, GanttGroup>();
  for (const ev of events ?? []) {
    groupsByEvent.set(ev.id, {
      eventId: ev.id,
      eventName: ev.name,
      eventStartAt: ev.start_at,
      eventEndAt: ev.end_at,
      tasks: [],
    });
  }
  for (const t of rows) {
    const group = t.event_id ? groupsByEvent.get(t.event_id) : undefined;
    if (!group) continue;
    group.tasks.push({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueAt: t.due_at,
      startsAt: t.started_at,
      isMilestone: t.is_milestone ?? false,
      overdue: !!t.due_at && t.status !== "done" && t.status !== "cancelled" && new Date(t.due_at).getTime() < now,
      dependsOnIds: depsByTask.get(t.id) ?? [],
    });
  }

  return Array.from(groupsByEvent.values()).filter((g) => g.tasks.length > 0);
}

export const dynamic = "force-dynamic";

/** Bridge the simplified RPC shape to the full CalendarItem used by views. */
function adaptRpcItem(r: RpcCalendarItem): CalendarItem {
  const kToBadge: Record<string, BadgeType> = {
    event: "event",
    run_sheet: "run_sheet",
    task: "task",
    supplier_booking: "booking",
    venue_booking: "booking",
    finance: "finance",
    note: "task",
    webinar: "webinar",
    theatre: "theatre",
    nightlife: "nightlife",
    festival: "festival",
    corporate: "corporate",
    wellness: "wellness",
    wedding: "wedding",
  };
  const badgeType: BadgeType = kToBadge[r.kind] ?? "event";
  const badgeLabel =
    badgeType === "run_sheet" ? "Run Sheet" :
    badgeType[0].toUpperCase() + badgeType.slice(1).replace(/_/g, " ");

  return {
    id: r.id,
    title: r.title,
    sourceType: (r.kind as CalendarItem["sourceType"]) ?? "event",
    kind: r.kind,
    status: r.status,
    priority: r.priority,
    tone: r.tone,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    allDay: false,
    multiDay: false,
    venueName: r.venueName,
    eventId: r.eventId,
    supplierId: r.supplierId,
    badgeType,
    badgeLabel,
    href: r.href,
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId, flags } = await getPersonaContext();

  if (!flags.calendarHub) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="max-w-md w-full rounded-2xl border border-surface-200 bg-white p-10 text-center shadow-card">
          <div className="mx-auto w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mb-5">
            <Lock className="w-6 h-6 text-brand-600" />
          </div>
          <h2 className="text-xl font-semibold text-surface-900 mb-2">Calendar Hub</h2>
          <p className="text-sm text-surface-500 mb-6">{upgradeMessage("pro")}</p>
          <Link
            href="/event-manager/settings/billing"
            className="inline-flex px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const sp = await searchParams;

  // Parse view param — default to month
  const rawView = typeof sp.view === "string" ? sp.view : "month";
  const view: ViewMode = (["month", "week", "day", "agenda", "gantt"] as const).includes(
    rawView as ViewMode
  )
    ? (rawView as ViewMode)
    : "month";

  // Parse date param — default to today
  const today = todayISODate();
  const rawDate = typeof sp.date === "string" ? sp.date : today;
  const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  // Compute the data window for this view
  let fromISO: string;
  let toISO: string;

  if (view === "month") {
    const monthKey = dateISO.slice(0, 7);
    const grid = monthGrid(monthKey);
    fromISO = grid.gridStartISO;
    toISO = grid.gridEndISO;
  } else if (view === "week") {
    const wg = weekGrid(dateISO);
    fromISO = wg.gridStartISO;
    toISO = wg.gridEndISO;
  } else if (view === "day") {
    fromISO = dateISO + "T00:00:00Z";
    toISO = dateISO + "T23:59:59Z";
  } else {
    // Agenda: 4 weeks centred near dateISO
    const agendaStart = new Date(dateISO + "T00:00:00Z");
    agendaStart.setUTCDate(agendaStart.getUTCDate() - 3);
    const agendaEnd = new Date(agendaStart);
    agendaEnd.setUTCDate(agendaStart.getUTCDate() + 28);
    fromISO = agendaStart.toISOString();
    toISO = agendaEnd.toISOString();
  }

  // Load live Supabase data — adapt to rich CalendarItem shape
  const rpcItems = workspaceId && view !== "gantt"
    ? await getCalendarRange(workspaceId, fromISO, toISO)
    : [];

  const liveItems: CalendarItem[] = rpcItems.map(adaptRpcItem);

  const ganttGroups = workspaceId && view === "gantt" ? await getGanttGroups(workspaceId) : [];

  return (
    <CalendarClient
      view={view}
      dateISO={dateISO}
      liveItems={liveItems}
      hasWorkspace={!!workspaceId}
      ganttGroups={ganttGroups}
    />
  );
}
