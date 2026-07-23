import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  EventProfileShell,
  type EventTag,
  type StageStep,
  type TabItem,
} from "@/components/events/EventProfileShell";
import { formatEventDate } from "../_lib";

export const dynamic = "force-dynamic";

/* ─── Tab registry (21 tabs) ─────────────────────────────────────────────── */

const BASE_TABS: Omit<TabItem, "badge">[] = [
  { id: "overview",         label: "Overview",            href: "overview" },
  { id: "brief",            label: "Brief",               href: "brief" },
  { id: "schedule",         label: "Schedule/Run-sheet",  href: "schedule" },
  { id: "suppliers",        label: "Suppliers",           href: "suppliers" },
  { id: "tasks",            label: "Tasks",               href: "tasks" },
  { id: "finance",          label: "Finance",             href: "finance" },
  { id: "tickets",          label: "Tickets",             href: "tickets" },
  { id: "guests",           label: "Guests",              href: "guests" },
  { id: "floor-plan",       label: "Floor-plan/Seating",  href: "floor-plan" },
  { id: "mood-board",       label: "Mood-board",          href: "mood-board" },
  { id: "staffing",         label: "Staffing",            href: "staffing" },
  { id: "logistics",        label: "Logistics",           href: "logistics" },
  { id: "extensions",       label: "Extensions",          href: "extensions" },
  { id: "documents-media",  label: "Documents/Media",     href: "documents-media" },
  { id: "comms",            label: "Comms",               href: "comms" },
  { id: "expenses",         label: "Expenses",            href: "expenses" },
  { id: "activity",         label: "Activity",            href: "activity" },
  { id: "insights",         label: "Insights",            href: "insights" },
  { id: "event-map",        label: "Event Map",           href: "event-map" },
  { id: "beo",              label: "Event Order/BEO",     href: "beo" },
  { id: "check-in",         label: "Check-in",            href: "check-in" },
  { id: "publish",          label: "Publish",             href: "publish" },
];

/* ─── Pipeline stage config ──────────────────────────────────────────────── */

const STAGE_IDS = [
  "new_enquiry",
  "briefing",
  "quoting",
  "awaiting_approval",
  "confirmed",
  "in_delivery",
  "completed",
] as const;

const STAGE_LABELS = [
  "Enquiry",
  "Briefing",
  "Quoting",
  "Approval",
  "Planning",
  "Delivery",
  "Post-Event",
];

function buildStages(dbStatus: string | null, event: {
  created_at?: string | null;
  start_at?: string | null;
  end_at?: string | null;
}): StageStep[] {
  const status = (dbStatus ?? "new_enquiry").toLowerCase();
  const activeIdx = STAGE_IDS.indexOf(status as typeof STAGE_IDS[number]);

  const stageDates: (string | undefined)[] = [
    formatEventDate(event.created_at, undefined),      // Enquiry
    undefined,                                          // Briefing — no column yet
    undefined,                                          // Quoting
    undefined,                                          // Approval
    event.start_at ? "Feb – Aug 2026" : undefined,     // Planning (derived)
    formatEventDate(event.start_at, undefined),         // Delivery
    event.end_at ? "Sep – Oct 2026" : undefined,        // Post-Event
  ];

  return STAGE_LABELS.map((label, i) => {
    let state: StageStep["state"];
    if (i < activeIdx) state = "done";
    else if (i === activeIdx) state = "active";
    else if (activeIdx === -1 && i === 0) state = "active";
    else state = i <= activeIdx + 1 ? "upcoming" : "locked";

    return { id: STAGE_IDS[i] ?? label.toLowerCase(), label, dateLabel: stageDates[i], state };
  });
}

/* ─── Tag inference ──────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferTags(event: Record<string, any>): EventTag[] {
  const tags: EventTag[] = [];

  // visibility / access
  if (event.is_public === true || event.visibility === "public") {
    tags.push({ label: "Public", color: "green" });
  } else if (event.visibility === "private" || event.is_public === false) {
    tags.push({ label: "Private", color: "gray" });
  }

  // event format (in_person / online / hybrid)
  const lm = (event.event_format ?? event.layout_mode ?? "").toLowerCase();
  if (lm === "hybrid")    tags.push({ label: "Hybrid",    color: "blue" });
  else if (lm === "online")  tags.push({ label: "Online",    color: "indigo" });
  else if (lm === "in_person" || lm === "in-person" || lm === "onsite") tags.push({ label: "In-Person", color: "indigo" });

  // ticketed
  if (event.is_ticketed || event.has_tickets) tags.push({ label: "Ticketed", color: "violet" });

  // VIP flag
  if (event.is_vip || event.vip === true) tags.push({ label: "VIP", color: "amber" });

  // also check the tags text-array column stored in Supabase
  const tagsArr: string[] = Array.isArray(event.tags)
    ? event.tags.map((t: unknown) => String(t).toLowerCase())
    : [];

  // event category / type — also check tags array
  const cat = (event.event_category ?? event.category ?? "").toLowerCase();
  if (cat.includes("corporate") || tagsArr.includes("corporate"))  tags.push({ label: "Corporate", color: "gray" });
  else if (cat.includes("festival") || tagsArr.includes("festival"))  tags.push({ label: "Festival", color: "amber" });
  else if (cat.includes("conference") || tagsArr.includes("conference")) tags.push({ label: "Conference", color: "blue" });
  else if (cat.includes("wedding") || tagsArr.includes("wedding"))   tags.push({ label: "Wedding", color: "violet" });
  else if (cat.includes("gala") || tagsArr.includes("gala"))      tags.push({ label: "Gala", color: "amber" });

  // livestream / live status — also check tags array
  if (event.is_livestream || event.has_livestream || event.is_live || tagsArr.includes("live")) {
    tags.push({ label: "Live", color: "red" });
  }

  // Fallback: if no tags inferred, use event_type
  if (tags.length === 0 && event.event_type) {
    tags.push({ label: event.event_type, color: "indigo" });
  }

  return tags;
}

/* ─── Date / capacity labels ─────────────────────────────────────────────── */

function buildDateLabel(event: { start_at?: string | null; end_at?: string | null }): string {
  const start = event.start_at ? new Date(event.start_at) : null;
  const end   = event.end_at   ? new Date(event.end_at)   : null;

  if (!start) return "Date TBC";

  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

  if (!end || end.getTime() === start.getTime()) return fmt.format(start);

  // Compare date-only (strip time) so hours in start/end don't inflate the day count
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay   = new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
  const days = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000) + 1;

  // Same month/year
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} – ${fmt.format(end)} (${days} days)`;
  }
  return `${fmt.format(start)} – ${fmt.format(end)} (${days} days)`;
}

function buildCapacityLabel(event: {
  guest_count_day?: number | null;
  guest_count_evening?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}): string | undefined {
  const onsite = event.capacity_onsite ?? event.guest_count_day ?? null;
  const online = event.capacity_online ?? event.guest_count_evening ?? null;
  // Compute total as explicit field OR sum of onsite+online so it's always accurate
  const total = event.capacity_total ?? ((onsite && online) ? onsite + online : onsite) ?? null;
  if (!total) return undefined;
  if (onsite && online) {
    return `${total.toLocaleString("en-GB")} (${onsite.toLocaleString("en-GB")} onsite / ${online.toLocaleString("en-GB")} online)`;
  }
  return total.toLocaleString("en-GB");
}

/* ─── Layout ─────────────────────────────────────────────────────────────── */

export default async function EventProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  // Owner name — prefer owner_user_id, fall back to created_by
  let ownerName: string | null = null;
  const ownerUserId = (event.owner_user_id ?? event.created_by) as string | null;
  if (ownerUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", ownerUserId)
      .maybeSingle();
    ownerName = profile?.display_name ?? null;
  }

  // Task count for badge
  const { count: taskCount } = await supabase
    .from("event_tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .neq("status", "completed")
    .is("archived_at", null);

  const tags  = inferTags(event as Record<string, unknown>);
  const stages = buildStages(event.status, event);

  const tabs: TabItem[] = BASE_TABS.map((t) => ({
    ...t,
    badge: t.id === "tasks" && taskCount ? taskCount : undefined,
  }));

  // Venue / location label
  const venueLabel =
    (event as { venue_name_snapshot?: string | null }).venue_name_snapshot ||
    event.location ||
    null;

  const capacityLabel = buildCapacityLabel(event as Record<string, unknown>);
  const dateLabel     = buildDateLabel(event);

  // Progress % — use readiness_score if available, otherwise fall back to stage position
  const stageIdx = STAGE_IDS.indexOf((event.status ?? "new_enquiry").toLowerCase() as typeof STAGE_IDS[number]);
  const stagePct = stageIdx < 0 ? 5 : Math.round(((stageIdx + 1) / STAGE_IDS.length) * 100);
  const progressPct = (event as { readiness_score?: number | null }).readiness_score ?? stagePct;

  const coverImageUrl = (event as { cover_image_url?: string | null }).cover_image_url ?? null;

  return (
    /* Outer frame — creates breathing room from sidebar & top nav on all sides */
    <div className="p-4 lg:p-5">
      {/* Card shell — ring border + shadow give premium "card within page" look.
          No overflow-hidden so sticky tab nav still works. */}
      <div className="rounded-2xl shadow-xl ring-1 ring-surface-200/80">
        <EventProfileShell
          eventId={eventId}
          name={event.name}
          tags={tags}
          dateLabel={dateLabel}
          venueLabel={venueLabel}
          capacityLabel={capacityLabel}
          ownerName={ownerName}
          clientName={(event as { client_name?: string | null }).client_name ?? (event as { client_company?: string | null }).client_company}
          clientEmail={(event as { client_email?: string | null }).client_email}
          clientPhone={(event as { client_phone?: string | null }).client_phone}
          progressPct={progressPct}
          progressLabel="On track"
          stages={stages}
          tabs={tabs}
          heroImageUrl={coverImageUrl}
          posterImageUrl={coverImageUrl}
        >
          {children}
        </EventProfileShell>
      </div>
    </div>
  );
}
