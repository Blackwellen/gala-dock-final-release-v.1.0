import { notFound } from "next/navigation";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { EmergencyRespond } from "@/components/marketplace/emergency-client";
import { categoryLabel, SEVERITY, CANDIDATE_STATUS } from "@/lib/marketplace/emergency";
import { money, dateShort, time } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Emergency request" };

/** A matched emergency request. Opening it marks the invitation as seen; the provider quotes, shows interest or declines. */
export default async function ProviderEmergencyRequestPage({ params }: PageProps<"/provider/emergency/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getProvider();
  const { data: c } = await ctx.db.from("emergency_candidates").select("id,status,quote_amount,eta_minutes,note,opened_at,distance_km,build_item_id").eq("request_id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  const { data: r } = c ? await ctx.db.from("emergency_requests").select("reference,category,severity,required_arrival,location,scope,budget_max,status,events(name)").eq("id", id).maybeSingle() : { data: null };
  if (!c || !r) notFound();
  const [label, tone] = CANDIDATE_STATUS[c.status] ?? [c.status, "grey"];
  const open = ["open", "matching"].includes(r.status);
  return <>
    <PageHeader title={`${categoryLabel(r.category)} needed — ${r.reference}`} subtitle={`On site by ${dateShort(r.required_arrival)}, ${time(r.required_arrival)}${r.location ? ` · ${r.location}` : ""}`} back={{ href: "/provider/emergency", label: "Emergency Supply" }} />
    <div className="mk-page"><div className="mk-grid">
      <Panel title="Request">
        <div className="mk-row"><span className={`mk-tag ${SEVERITY[r.severity]?.[1]}`}>{SEVERITY[r.severity]?.[0]}</span><span className={`mk-tag ${tone}`}>{label}</span>
          {c.distance_km != null && <span className="mk-tag grey">{c.distance_km} km away</span>}{r.budget_max != null && <span className="mk-tag grey">Budget up to {money(r.budget_max)}</span>}</div>
        <p className="mk-note" style={{ marginTop: 10 }}>{r.scope || "No scope given."}</p>
        {!open && <p className="mk-note">This request is {r.status === "filled" ? (c.status === "accepted" ? "filled — your quote was accepted." : "filled by another provider.") : r.status}.</p>}
      </Panel>
      <Panel title={open ? "Respond" : "Your response"}>
        {open ? <EmergencyRespond candidateId={c.id} status={c.status} seen={!!c.opened_at} /> :
          <p className="mk-note">{c.quote_amount != null ? `You quoted ${money(c.quote_amount)}${c.eta_minutes != null ? `, arriving in ~${c.eta_minutes} min` : ""}.` : "No quote sent."}</p>}
      </Panel>
    </div></div>
  </>;
}
