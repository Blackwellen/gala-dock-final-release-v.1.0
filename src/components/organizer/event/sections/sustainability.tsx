import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { can } from "@/lib/domain/permissions";
import type { SectionProps } from "./types";
import { SustainabilityClient, type Factor, type EntryRow, type SusReport } from "./sustainability-client";

/**
 * Operations › Sustainability (Q40 domain 256). Measurements against versioned emission factors, an attendee travel estimate
 * from issued tickets, and the event report with factor provenance. Factors are indicative (owner to confirm the DEFRA set):
 * figures are for internal planning only and are never shown publicly or used for claims.
 */
export async function SustainabilitySection({ e, d, role }: SectionProps) {
  const sb = untyped(await createClient());
  const [{ data: factors }, { data: entries }, { data: report }] = await Promise.all([
    sb.from("sustainability_factors").select("key,version,kind,unit,kg_co2e_per_unit,source,active").eq("active", true).order("kind").order("key"),
    sb.from("sustainability_entries").select("id,kind,factor_key,factor_version,quantity,unit,method,supplier_listing_id,note,created_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(200),
    sb.rpc("event_sustainability_report", { p_event: e.id }),
  ]);
  const suppliers = [...new Map(d.items.filter(i => i.listing_id).map(i => [i.listing_id as string, { id: i.listing_id as string, name: i.title }])).values()];
  return <SustainabilityClient eventId={e.id} factors={(factors ?? []) as Factor[]} entries={(entries ?? []) as EntryRow[]} report={report as SusReport | null} suppliers={suppliers} canWrite={can("organizer", role, "events.write")} />;
}
