import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { EventsPipelineClient, type PipelineEvent } from "@/components/events/EventsPipelineClient";
import { toUiStatus, clientLabel, venueLabel, formatEventDate } from "./_lib";

export const dynamic = "force-dynamic";

const VALID_VIEWS = new Set(["list", "cards", "board", "map"]);

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const sp = await searchParams;
  const initialView = VALID_VIEWS.has(sp.view ?? "") ? (sp.view as "list" | "cards" | "board" | "map") : "list";

  /* ── Fetch all active events ─────────────────────────────────────────────── */
  const { data: raw } = await supabase
    .from("events")
    .select(
      `id, name, status, event_type,
       start_at, end_at,
       venue_name_snapshot, location,
       guest_count_day, guest_count_evening,
       budget_cents,
       client_name, client_company,
       owner_user_id, risk_level,
       cover_image_url, flagged,
       created_at, updated_at`
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true, nullsFirst: false });

  const eventRows = raw ?? [];
  const eventIds = eventRows.map((e) => e.id);

  /* ── Task progress per event (single query) ──────────────────────────────── */
  const taskCounts = new Map<string, { done: number; total: number }>();
  if (eventIds.length > 0) {
    const { data: tasks } = await supabase
      .from("event_tasks")
      .select("event_id, status")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .in("event_id", eventIds);

    for (const t of tasks ?? []) {
      const e = taskCounts.get(t.event_id) ?? { done: 0, total: 0 };
      e.total += 1;
      if (t.status === "completed") e.done += 1;
      taskCounts.set(t.event_id, e);
    }
  }

  /* ── Owner display names ─────────────────────────────────────────────────── */
  const ownerIds = [
    ...new Set(eventRows.map((e) => e.owner_user_id).filter(Boolean)),
  ] as string[];
  const ownerNames = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);
    for (const p of profiles ?? []) {
      if (p.user_id && p.display_name) ownerNames.set(p.user_id, p.display_name);
    }
  }

  /* ── Serialise to PipelineEvent[] ───────────────────────────────────────── */
  const events: PipelineEvent[] = eventRows.map((e) => {
    const tc = taskCounts.get(e.id) ?? { done: 0, total: 0 };
    const r = e as Record<string, unknown>;

    // Readiness: task-based computation
    const taskReadiness = tc.total > 0 ? Math.round((tc.done / tc.total) * 100) : 0;
    const readinessScore = taskReadiness;

    const coverImageUrl = (r.cover_image_url as string) ?? null;

    const ownerName = e.owner_user_id
      ? (ownerNames.get(e.owner_user_id) ?? "Unassigned")
      : "Unassigned";

    return {
      id:             e.id,
      name:           e.name,
      status:         toUiStatus(e.status),
      eventType:      (r.event_type as string) ?? null,
      startAt:        (r.start_at as string) ?? null,
      endAt:          (r.end_at as string) ?? null,
      dateLabel:      formatEventDate(r.start_at as string),
      venue:          venueLabel({
        venue_name_snapshot: r.venue_name_snapshot as string,
        location: r.location as string,
      }),
      guestCount:
        (r.guest_count_day as number) ??
        (r.guest_count_evening as number) ??
        0,
      budgetCents:    (r.budget_cents as number) ?? 0,
      quoteCents:     (r.budget_cents as number) ?? 0,
      client:         clientLabel({
        client_name: r.client_name as string,
        client_company: r.client_company as string,
      }),
      ownerName,
      ownerInitials:  ownerName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      riskLevel:      (r.risk_level as string) ?? null,
      readinessScore,
      nextAction:     (r.next_action as string) ?? null,
      nextActionDue:  (r.next_action_due as string) ?? null,
      coverImageUrl,
      isVip:          (r.is_vip as boolean) ?? (r.flagged as boolean) ?? false,
      tasksDone:      tc.done,
      tasksTotal:     tc.total,
    };
  });

  return <EventsPipelineClient initialEvents={events} initialView={initialView} />;
}
