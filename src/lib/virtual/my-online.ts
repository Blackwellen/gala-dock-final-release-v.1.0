import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attendee view of an event's online sessions and replays (Q29). Sessions come from virtual_my_sessions (entitlement-aware, no
 * links); replay ids, status, access windows and audience come from virtual_my_replays as the signed-in user (no URLs or file
 * paths; only events the caller holds a ticket, registration or session role for). No service client.
 * Opening a replay still goes through /virtual/replay/[id], where virtual_replay_access decides as the signed-in user.
 */
export type ReplayState = { state: "available"; id: string; until: string | null } | { state: "opens"; at: string } | { state: "closed" } | { state: "processing" } | { state: "not_entitled" } | { state: "none" };
export type MySession = {
  id: string; title: string; kind: string; track: string | null; startsAt: string; endsAt: string; opensAt: string; closesAt: string; status: string;
  role: string | null; captions: string | null; signLanguage: boolean; transcript: boolean; audioDescription: boolean; replay: ReplayState;
  join: "open" | "soon" | "ended" | "not_entitled" | "cancelled";
};

type Raw = { id: string; title: string; kind: string; track: string | null; starts_at: string; ends_at: string; opens_at: string; closes_at: string; status: string; role: string | null;
  captions: string | null; sign_language: boolean | null; transcript: boolean | null; audio_description: boolean | null; replays: number };

export async function myOnlineSessions(sb: SupabaseClient, eventId: string, now = Date.now()): Promise<MySession[]> {
  const { data, error } = await sb.rpc("virtual_my_sessions", { p_event: eventId });
  if (error || !Array.isArray(data) || !data.length) return [];
  const rows = data as Raw[];
  const recs = new Map<string, { id: string; status: string; access_from: string | null; access_until: string | null; audience: string; created_at: string }[]>();
  try {
    const { data: r } = await sb.rpc("virtual_my_replays", { p_event: eventId });   // newest first, withdrawn excluded
    const ids = new Set(rows.map(x => x.id));
    for (const x of (r ?? []) as unknown as { id: string; session_id: string; status: string; access_from: string | null; access_until: string | null; audience: string; created_at: string }[])
      if (ids.has(x.session_id)) recs.set(x.session_id, [...(recs.get(x.session_id) ?? []), x]);
  } catch { /* replay metadata unavailable → sessions still render; replays show as none */ }
  return rows.map(s => {
    const list = recs.get(s.id) ?? [];
    const pick = list.find(r => r.status === "available" && (!r.access_from || Date.parse(r.access_from) <= now) && (!r.access_until || Date.parse(r.access_until) > now))
      ?? list.find(r => r.status === "available" && r.access_from && Date.parse(r.access_from) > now) ?? list[0];
    const replay: ReplayState = !pick ? { state: "none" }
      : !s.role || pick.audience === "team" ? { state: "not_entitled" }
      : pick.status !== "available" ? { state: "processing" }
      : pick.access_from && Date.parse(pick.access_from) > now ? { state: "opens", at: pick.access_from }
      : pick.access_until && Date.parse(pick.access_until) <= now ? { state: "closed" }
      : { state: "available", id: pick.id, until: pick.access_until };
    const join: MySession["join"] = s.status === "cancelled" ? "cancelled" : !s.role ? "not_entitled"
      : Date.parse(s.closes_at) < now || ["ended", "archived"].includes(s.status) ? "ended" : Date.parse(s.opens_at) <= now ? "open" : "soon";
    return { id: s.id, title: s.title, kind: s.kind, track: s.track, startsAt: s.starts_at, endsAt: s.ends_at, opensAt: s.opens_at, closesAt: s.closes_at, status: s.status,
      role: s.role, captions: s.captions, signLanguage: !!s.sign_language, transcript: !!s.transcript, audioDescription: !!s.audio_description, replay, join };
  });
}
