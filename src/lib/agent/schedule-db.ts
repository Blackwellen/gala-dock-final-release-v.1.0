import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSchedule, nextRunAt, type Occurrence } from "./schedule";
import { workspaceLocale } from "@/lib/i18n/workspace";

type RoutineRow = { id: string; workspace_id: string; schedule: string | null; trigger: { type?: string; cron?: string; event?: string } | null; last_run_at?: string | null };

/** Q76: routines run in the workspace's zone (settings.timezone), London when unset or invalid. */
export async function workspaceTimezone(db: SupabaseClient, workspaceId: string): Promise<string> {
  const { data } = await db.from("workspaces").select("settings").eq("id", workspaceId).maybeSingle();
  return workspaceLocale((data as { settings?: unknown } | null)?.settings).timezone;
}

/** Upcoming bookings (provider) or events (organiser) an event-relative routine runs against — next 90 days, live ones only. */
async function occurrences(db: SupabaseClient, workspaceId: string): Promise<Occurrence[]> {
  const since = new Date(Date.now() - 3 * 864e5).toISOString(), until = new Date(Date.now() + 90 * 864e5).toISOString();
  const { data: ws } = await db.from("workspaces").select("kind").eq("id", workspaceId).maybeSingle();
  if (ws?.kind === "provider") {
    const { data } = await db.from("provider_jobs").select("id,starts_at,ends_at").eq("workspace_id", workspaceId).in("status", ["held", "confirmed", "active"]).gte("starts_at", since).lte("starts_at", until).limit(500);
    return (data ?? []) as Occurrence[];
  }
  const { data } = await db.from("events").select("id,starts_at,ends_at").eq("workspace_id", workspaceId).not("starts_at", "is", null).not("status", "in", "(cancelled,archived)").gte("starts_at", since).lte("starts_at", until).limit(500);
  return (data ?? []) as Occurrence[];
}

/**
 * Next due time for a stored routine (Q41/Q43 fix: previously every routine without a compiled cron fell back to +24h).
 * Returns null when the schedule can't be parsed — callers keep the routine parked rather than guessing a time.
 */
export async function routineNextRun(db: SupabaseClient, r: RoutineRow, after: Date, lastRun?: Date | null): Promise<Date | null> {
  const spec = parseSchedule(r.schedule, r.trigger);
  if (!spec) return null;
  const occ = spec.kind === "relative" ? await occurrences(db, r.workspace_id) : undefined;
  const tz = await workspaceTimezone(db, r.workspace_id);
  return nextRunAt(spec, after, { lastRun: lastRun ?? (r.last_run_at ? new Date(r.last_run_at) : null), occurrences: occ, tz })?.at ?? null;
}
