import Link from "next/link";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { PageHead } from "@/components/kit";
import { EmergencyRequestForm } from "@/components/marketplace/emergency-client";
import { categoryLabel, SEVERITY } from "@/lib/marketplace/emergency";
import { requestTime } from "@/lib/workspace/format";
import { dateShort, time } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Emergency Supply" };
type Req = { id: string; reference: string; category: string; severity: string; status: string; required_arrival: string; pool_size: number; created_at: string; event_id: string };
const STATUS: Record<string, [string, string]> = { open: ["No matches yet", "grey"], matching: ["Matching", "orange"], filled: ["Filled", "green"], cancelled: ["Cancelled", "grey"], expired: ["Expired", "grey"] };

/** Emergency Supply (§37): raise an urgent request to a controlled pool of opted-in providers and track responses. */
export default async function EmergencySupplyPage({ searchParams }: PageProps<"/organizer/marketplace/emergency">) {
  const sp = await searchParams;
  const ctx = await getOrganizer("/organizer/marketplace/emergency");
  const db = untyped(ctx.supabase as never);
  const since = new Date(requestTime() - 14 * 864e5).toISOString();
  const { data: events } = await db.from("events").select("id,name,starts_at").eq("workspace_id", ctx.workspace.id).or(`starts_at.gte.${since},starts_at.is.null`).neq("status", "cancelled").order("starts_at", { ascending: true }).limit(60);
  const evIds = (events ?? []).map((e: { id: string }) => e.id);
  const { data: reqs } = evIds.length ? await db.from("emergency_requests").select("id,reference,category,severity,status,required_arrival,pool_size,created_at,event_id").in("event_id", evIds).order("created_at", { ascending: false }).limit(30) : { data: [] };
  const evName = new Map((events ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
  return <div className="k-col" style={{ gap: 16 }}>
    <PageHead crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: "/organizer/marketplace" }, { label: "Emergency Supply" }]}
      title="Emergency Supply" sub="Something fell through? Reach available, vetted providers nearby in minutes." />
    <div className="mk-page"><div className="mk-grid">
      <section className="mk-card" aria-labelledby="em-new"><h2 id="em-new">New emergency request</h2>
        <EmergencyRequestForm events={(events ?? []).map((e: { id: string; name: string; starts_at: string | null }) => ({ id: e.id, name: e.name, when: e.starts_at ? dateShort(e.starts_at) : "Date TBC" }))}
          defaults={{ event: one(sp.event), category: one(sp.category), original: one(sp.original) }} /></section>
      <section className="mk-card" aria-labelledby="em-list"><h2 id="em-list">Recent requests</h2>
        {!(reqs ?? []).length ? <p className="mk-empty">No emergency requests in the last two weeks.</p> :
        <ul className="mk-list">{(reqs as Req[]).map(r => <li key={r.id}>
          <div className="mk-main"><b><Link className="mk-link" href={`/organizer/marketplace/emergency/${r.id}`}>{categoryLabel(r.category)} · {r.reference}</Link></b>
            <small>{evName.get(r.event_id)} · needed {dateShort(r.required_arrival)} {time(r.required_arrival)} · {r.pool_size} contacted</small></div>
          <span className="mk-row"><span className={`mk-tag ${SEVERITY[r.severity]?.[1]}`}>{SEVERITY[r.severity]?.[0]}</span><span className={`mk-tag ${STATUS[r.status]?.[1]}`}>{STATUS[r.status]?.[0]}</span></span>
        </li>)}</ul>}
      </section>
    </div></div>
  </div>;
}
