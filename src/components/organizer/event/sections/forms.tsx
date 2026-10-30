import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { can } from "@/lib/domain/permissions";
import type { SectionProps } from "./types";
import { FormsClient, type FormRow, type ResponseRow, type WaiverRow, type SignatureRow, type WaiverStatus } from "./forms-client";

/**
 * Plan › Forms & waivers (Q40 domains 251–252). Versioned event forms (draft → publish; published versions are immutable),
 * typed fields, responses with accept/reject; waiver templates (one published version per family, body hash), attached per
 * event or ticket type, signature counts for the team and the signature list for owners/managers only (RLS).
 */
export async function FormsSection({ e, d, role }: SectionProps) {
  const sb = untyped(await createClient());
  const [{ data: forms }, { data: resp }, { data: waivers }, { data: attached }, { data: status }, { data: sigs }] = await Promise.all([
    sb.from("event_forms").select("id,family_id,version,audience,kind,title,fields,status,published_at,created_at").eq("event_id", e.id).order("version", { ascending: false }),
    sb.from("form_responses").select("id,form_id,form_version,respondent_kind,answers,status,created_at,decided_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(200),
    sb.from("waiver_templates").select("id,family_id,version,title,body,body_sha256,minors_allowed,adult_age,status,published_at,created_at").eq("workspace_id", e.workspace_id as string).order("version", { ascending: false }),
    sb.from("event_waivers").select("waiver_template_id,tier_ids,status").eq("event_id", e.id),
    sb.rpc("waiver_status", { p_event: e.id }),
    sb.from("waiver_signatures").select("id,waiver_template_id,template_version,signer_name,is_minor,guardian_name,guardian_relationship,signed_at,status,ticket_id").eq("event_id", e.id).order("signed_at", { ascending: false }).limit(200),
  ]);
  const owner = ["owner", "manager"].includes(role);
  return <FormsClient eventId={e.id} forms={(forms ?? []) as FormRow[]} responses={(resp ?? []) as ResponseRow[]} waivers={(waivers ?? []) as WaiverRow[]}
    attached={(attached ?? []) as { waiver_template_id: string; tier_ids: string[] | null; status: string }[]} status={(status ?? []) as WaiverStatus[]}
    signatures={owner ? (sigs ?? []) as SignatureRow[] : null} tiers={d.tiers.map(t => ({ id: t.id, name: t.name }))}
    canWrite={can("organizer", role, "events.write")} canWaivers={owner} />;
}
