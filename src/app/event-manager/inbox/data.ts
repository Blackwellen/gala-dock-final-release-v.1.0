import { createClient } from "@/lib/supabase/server";
import type { CommType, CommDirection } from "@/lib/supabase/types";
import type { MessageRow } from "./inbox-utils";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Coerce the jsonb attachments column into the UI shape, ignoring junk. */
function normaliseAttachments(raw: unknown): { name: string; size: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (a && typeof a === "object" && "name" in a) {
        const obj = a as Record<string, unknown>;
        return {
          name: String(obj.name ?? "attachment"),
          size: typeof obj.size === "number" ? obj.size : 0,
        };
      }
      return null;
    })
    .filter((a): a is { name: string; size: number } => a !== null);
}

/**
 * Load communications for the active workspace (optionally a single thread),
 * resolving linked event names and author display names. Always filters by
 * workspace_id in addition to RLS.
 */
export async function loadMessages(
  supabase: SupabaseServerClient,
  workspaceId: string,
  opts: { threadId?: string } = {}
): Promise<MessageRow[]> {
  let query = supabase
    .from("communications")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (opts.threadId) {
    query = query.eq("thread_id", opts.threadId);
  }

  const { data } = await query;
  const rows = data ?? [];

  // Resolve linked event names.
  const eventIds = Array.from(
    new Set(rows.map((r) => r.event_id).filter(Boolean))
  ) as string[];
  const eventNameById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", eventIds);
    for (const ev of events ?? []) eventNameById.set(ev.id, ev.name);
  }

  // Resolve author display names.
  const authorIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter(Boolean))
  ) as string[];
  const nameByUser = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", authorIds);
    for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name ?? "Team member");
  }

  return rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id ?? r.id,
    subject: r.subject,
    body: r.body,
    commType: r.comm_type as CommType,
    direction: r.direction as CommDirection,
    participantName: r.participant_name,
    participantEmail: r.participant_email,
    participantPhone: r.participant_phone,
    eventId: r.event_id,
    eventName: r.event_id ? eventNameById.get(r.event_id) ?? null : null,
    leadId: r.lead_id,
    isRead: r.is_read,
    attachments: normaliseAttachments(r.attachments),
    createdAt: r.created_at,
    createdByName: r.created_by ? nameByUser.get(r.created_by) ?? null : null,
  }));
}
