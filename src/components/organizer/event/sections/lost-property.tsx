import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { can } from "@/lib/domain/permissions";
import { requestTime } from "@/lib/workspace/format";
import type { SectionProps } from "./types";
import { LostPropertyClient, type FoundRow, type LostRow, type ClaimRow, type MatchSet } from "./lost-property-client";

/**
 * Operations › Lost property (Q40 domain 255). Found-items log, lost reports, explainable lp-v1 matches (same event + category,
 * found inside the loss window + 24 h; colour, brand, shared words and location scored) and claim decisions. Reporters only
 * ever see a derived status on their side; evidence and other items stay with the event team.
 */
export async function LostPropertySection({ e, role }: SectionProps) {
  const sb = untyped(await createClient());
  const [{ data: found }, { data: lost }] = await Promise.all([
    sb.from("found_items").select("id,category,description,colour,brand,location,storage_location,found_at,dispose_after,status,disposed_at,disposal_method").eq("event_id", e.id).order("found_at", { ascending: false }).limit(200),
    sb.from("lost_reports").select("id,category,description,colour,brand,location,lost_from,lost_to,status,contact_email,reporter_id,created_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const reports = (lost ?? []) as (LostRow & { reporter_id: string | null })[];
  const ids = reports.map(r => r.id);
  const [{ data: claims }, matches] = await Promise.all([
    ids.length ? sb.from("lost_claims").select("id,report_id,item_id,status,score,features,evidence,decided_at,created_at").in("report_id", ids) : Promise.resolve({ data: [] }),
    Promise.all(reports.filter(r => ["submitted", "matched"].includes(r.status)).slice(0, 20).map(async r => [r.id, (await sb.rpc("lost_property_matches", { p_report: r.id, p_limit: 5 })).data as MatchSet | null] as const)),
  ]);
  return <LostPropertyClient eventId={e.id} now={requestTime()} found={(found ?? []) as FoundRow[]} lost={reports.map(({ reporter_id, ...r }) => ({ ...r, self_reported: !!reporter_id }))} claims={(claims ?? []) as ClaimRow[]}
    matches={Object.fromEntries(matches.filter(([, m]) => m))  as Record<string, MatchSet>} canWrite={can("organizer", role, "events.write")} />;
}
