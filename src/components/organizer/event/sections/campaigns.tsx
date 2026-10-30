import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { can } from "@/lib/domain/permissions";
import { requestTime } from "@/lib/workspace/format";
import type { SectionProps } from "./types";
import { CampaignsClient, type CampaignRow, type CampaignReport, type CalendarData, type LinkRow } from "./campaigns-client";

/**
 * Sell › Campaigns (Q23 domain 139). Lists this event's campaigns with their lifecycle, the 5-step setup wizard
 * (save_campaign_setup), channels, tracked links (/r/c/<code>) and the aggregate campaign report, plus the organiser
 * promotion calendar with blackouts. Deliveries use the fixture transport only — nothing is ever sent from here.
 */
export async function CampaignsSection({ e, role }: SectionProps) {
  const sb = untyped(await createClient());
  const ws = e.workspace_id as string;
  const now = requestTime(); const from = new Date(now - 7 * 864e5).toISOString(), to = new Date(now + 90 * 864e5).toISOString();
  const [{ data: rows }, { data: cal, error: calErr }, { data: dist }] = await Promise.all([
    sb.from("promotion_campaigns").select("id,name,goal,goal_target,status,starts_at,ends_at,timezone,budget_minor,audience,setup_step,version,utm_campaign,cancelled_reason,created_at")
      .eq("event_id", e.id).order("created_at", { ascending: false }).limit(25),
    sb.rpc("promotion_calendar", { p_workspace: ws, p_from: from, p_to: to }),
    sb.from("event_distribution").select("status,reason").eq("event_id", e.id).maybeSingle(),
  ]);
  const campaigns = (rows ?? []) as Omit<CampaignRow, "channels">[];
  const ids = campaigns.map(c => c.id);
  const [{ data: ch }, { data: links }, reports, blockers] = await Promise.all([
    ids.length ? sb.from("campaign_channels").select("campaign_id,channel,budget_minor,spent_minor,status").in("campaign_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("campaign_links").select("id,campaign_id,channel,code,destination,utm_source,utm_medium,created_at").in("campaign_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    Promise.all(campaigns.slice(0, 10).map(async c => [c.id, (await sb.rpc("campaign_report", { p_campaign: c.id })).data as CampaignReport | null] as const)),
    Promise.all(campaigns.filter(c => ["draft", "scheduled"].includes(c.status)).slice(0, 10).map(async c => [c.id, ((await sb.rpc("campaign_setup_blockers", { p_campaign: c.id })).data ?? []) as { key: string; label: string; step: number; external?: boolean }[]] as const)),
  ]);
  const chans = (ch ?? []) as { campaign_id: string; channel: string; budget_minor: number; spent_minor: number; status: string }[];
  return <CampaignsClient
    eventId={e.id} eventName={e.name} slug={e.slug ?? null} eventEnds={(e.ends_at ?? e.starts_at) as string | null}
    listed={(dist as { status?: string } | null)?.status === "listed"}
    campaigns={campaigns.map(c => ({ ...c, channels: chans.filter(x => x.campaign_id === c.id) }))}
    links={(links ?? []) as LinkRow[]}
    reports={Object.fromEntries(reports.filter(([, r]) => r))  as Record<string, CampaignReport>}
    blockers={Object.fromEntries(blockers)}
    calendar={calErr ? null : (cal as CalendarData)}
    canManage={can("organizer", role, "promotion.manage")}
    canBudget={can("organizer", role, "finance.write")} />;
}
