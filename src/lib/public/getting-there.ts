/**
 * Public "Getting there" (migration 202610294081): organiser notes marked public, public parking areas and public shuttles.
 * Read through public_event_getting_there only (anon-safe fields); the keys below are the whole public contract and nothing
 * else from the payload is rendered.
 */
type Rpc = { rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export const NOTE_KEYS = ["parking", "transit", "shuttle", "dropoff", "accessible", "cycle", "rideshare"] as const;
export type NoteKey = typeof NOTE_KEYS[number];
export type GettingThere = {
  notes: Partial<Record<NoteKey, string>>;
  parking: { name: string; kind: string; accessible_spaces: number; opens_at: string | null; closes_at: string | null }[];
  shuttles: { from: string; to: string; pickup: string | null; departs_at: string; arrives_at: string }[];
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Normalises the RPC payload to the public keys only (defence in depth for a signed-in member preview). */
export function cleanGettingThere(raw: unknown): GettingThere | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { notes?: Record<string, unknown>; parking?: unknown[]; shuttles?: unknown[] };
  const notes: GettingThere["notes"] = {};
  for (const k of NOTE_KEYS) { const v = str(r.notes?.[k]); if (v) notes[k] = v.slice(0, 500); }
  const parking = (Array.isArray(r.parking) ? r.parking : []).map(p => p as Record<string, unknown>).filter(p => str(p.name))
    .map(p => ({ name: str(p.name), kind: str(p.kind), accessible_spaces: Number(p.accessible_spaces) || 0, opens_at: str(p.opens_at) || null, closes_at: str(p.closes_at) || null }));
  const shuttles = (Array.isArray(r.shuttles) ? r.shuttles : []).map(s => s as Record<string, unknown>).filter(s => str(s.departs_at))
    .map(s => ({ from: str(s.from), to: str(s.to), pickup: str(s.pickup) || null, departs_at: str(s.departs_at), arrives_at: str(s.arrives_at) }));
  const out = { notes, parking, shuttles };
  return hasGettingThere(out) ? out : null;
}

export const hasGettingThere = (g: GettingThere | null): g is GettingThere => !!g && (Object.keys(g.notes).length > 0 || g.parking.length > 0 || g.shuttles.length > 0);

export async function loadGettingThere(client: unknown, eventId: string): Promise<GettingThere | null> {
  try {
    const { data, error } = await (client as Rpc).rpc("public_event_getting_there", { p_event: eventId });
    return error ? null : cleanGettingThere(data);
  } catch { return null; }
}
