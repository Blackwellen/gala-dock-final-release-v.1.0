import Link from "next/link";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { EmergencyProfileForm } from "@/components/marketplace/emergency-client";
import { categoryLabel, SEVERITY, CANDIDATE_STATUS } from "@/lib/marketplace/emergency";
import { money, dateShort, time } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Emergency Supply" };
type Row = { id: string; status: string; quote_amount: number | null; delivered_at: string; distance_km: number | null;
  emergency_requests: { id: string; reference: string; category: string; severity: string; required_arrival: string; status: string; location: string } };

/** Provider Emergency Supply (§37): opt-in profile and the inbox of urgent requests this workspace was matched to. */
export default async function ProviderEmergencyPage() {
  const ctx = await getProvider();
  const [{ data: profile }, { data: rows }] = await Promise.all([
    ctx.db.from("emergency_provider_profiles").select("enabled,categories,radius_km,response_minutes,surcharge_pct,rate_notes,available_now,available_until,base_lat,base_lng").eq("workspace_id", ctx.workspace.id).maybeSingle(),
    ctx.db.from("emergency_candidates").select("id,status,quote_amount,delivered_at,distance_km,emergency_requests!inner(id,reference,category,severity,required_arrival,status,location)").eq("workspace_id", ctx.workspace.id).order("delivered_at", { ascending: false }).limit(30),
  ]);
  return <>
    <PageHeader title="Emergency Supply" subtitle="Get matched to urgent, short-notice jobs near you — only when you say you’re available." />
    <div className="mk-page"><div className="mk-grid">
      <Panel title="Requests for you">
        {!(rows ?? []).length ? <p className="mk-empty">{profile?.enabled ? "No emergency requests yet. You’ll be notified the moment one matches." : "Turn on Emergency Supply to start receiving urgent requests."}</p> :
        <ul className="mk-list">{(rows as unknown as Row[]).map(c => { const r = c.emergency_requests; const [label, tone] = CANDIDATE_STATUS[c.status] ?? [c.status, "grey"]; return <li key={c.id}>
          <div className="mk-main"><b><Link className="mk-link" href={`/provider/emergency/${r.id}`}>{categoryLabel(r.category)} · {r.reference}</Link></b>
            <small>Needed {dateShort(r.required_arrival)} {time(r.required_arrival)}{r.location ? ` · ${r.location}` : ""}{c.distance_km != null ? ` · ${c.distance_km} km` : ""}</small></div>
          <span className="mk-row">{c.quote_amount != null && <b>{money(c.quote_amount)}</b>}<span className={`mk-tag ${SEVERITY[r.severity]?.[1]}`}>{SEVERITY[r.severity]?.[0]}</span><span className={`mk-tag ${tone}`}>{label}</span></span>
        </li>; })}</ul>}
      </Panel>
      <Panel title="Your Emergency Supply settings"><EmergencyProfileForm workspaceId={ctx.workspace.id} profile={profile} canManage={ctx.can.manage} /></Panel>
    </div></div>
  </>;
}
