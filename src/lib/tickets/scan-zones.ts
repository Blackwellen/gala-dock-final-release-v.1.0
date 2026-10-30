"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

export type ScanZone = { id: string; name: string; kind: string; status: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zones the signed-in scanner may check in for (Q18 zone picker). Outside door staff can't read access_zones under RLS, so the
 * names are read server-side and each zone is kept only when can_scan_event(event, zone) — evaluated as the caller — allows it.
 * `general` says whether the caller may also scan without a zone (zone-restricted door staff may not).
 */
export async function scanZones(eventId: string): Promise<{ general: boolean; zones: ScanZone[] }> {
  if (!UUID.test(eventId)) return { general: false, zones: [] };
  const db = untyped(await createClient());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { general: false, zones: [] };
  const { data: all } = await untyped(createAdminClient() as never).from("access_zones").select("id,name,kind,status").eq("event_id", eventId).order("sort").order("name");
  const zones = (all ?? []) as ScanZone[];
  const [general, ...allowed] = await Promise.all([null, ...zones.map(z => z.id)].map(async z => (await db.rpc("can_scan_event", { p_event: eventId, p_zone: z })).data === true));
  return { general: !!general, zones: zones.filter((_, i) => allowed[i]) };
}
