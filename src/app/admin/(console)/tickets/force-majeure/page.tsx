import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/admin-a-base.css";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { reviewForceMajeure } from "../../_a/actions";

export const metadata: Metadata = { title: "Force majeure reviews" };
type Claim = { event_id: string; reason: string; fm_detail: string | null; fm_status: string; created_at: string; review_note: string | null; reviewed_at: string | null; orders_refunded: number };

/**
 * Organisers who cancel because an event can't lawfully or safely go ahead ask for their platform fees to be waived (Organizer Terms 2.4(c)–(e)).
 * Fees stay on hold (never collected) until decided here. Aim to decide within 5 working days.
 */
export default async function ForceMajeurePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAdminPermission("tickets");
  if (!ctx.allowed) return <Restricted area="Tickets" />;
  const showAll = (await props.searchParams).all === "1";
  let q = ctx.db.from("event_cancellations").select("event_id,reason,fm_detail,fm_status,created_at,review_note,reviewed_at,orders_refunded").eq("cause", "force_majeure").order("created_at", { ascending: true }).limit(100);
  if (!showAll) q = q.eq("fm_status", "pending");
  const claims = ((await q).data ?? []) as Claim[];
  const ids = claims.map(c => c.event_id);
  const [{ data: evs }, { data: charges }] = ids.length ? await Promise.all([
    ctx.db.from("events").select("id,name,starts_at,workspace_id").in("id", ids),
    ctx.db.from("platform_charges").select("event_id,amount,status").in("event_id", ids).eq("kind", "cancellation_fees"),
  ]) : [{ data: [] }, { data: [] }];
  const ev = new Map(((evs ?? []) as { id: string; name: string; starts_at: string | null }[]).map(e => [e.id, e]));
  const fee = new Map(((charges ?? []) as { event_id: string; amount: number; status: string }[]).map(c => [c.event_id, c]));
  const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n));
  const d = (s: string | null) => s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return <div className="aa">
    <header className="ws-page-head">
      <div><h1>Force majeure reviews</h1><p>Organisers who say an event couldn’t lawfully or safely go ahead. Buyers are already refunded in full; this decides only whether the organiser’s platform fees are waived.</p></div>
      <div className="aa-head-actions"><Link className="ws-btn outline" href={showAll ? "/admin/tickets/force-majeure" : "/admin/tickets/force-majeure?all=1"}>{showAll ? "Pending only" : "Show decided"}</Link></div>
    </header>
    <section className="ws-panel" style={{ padding: 16 }}>
      <p style={{ marginTop: 0 }}><b>Accept</b> when the event couldn’t lawfully or safely go ahead for a reason outside the organiser’s control, such as a government or licensing authority order, the venue being closed by fire, flood or structural failure, a Met Office red or amber warning affecting the site, or a declared emergency. <b>Don’t accept</b> low ticket sales, cost increases, an artist pulling out, problems the organiser could reasonably have avoided or insured against, or events that could have been postponed or moved without real difficulty. Ask for evidence if it’s missing.</p>
      {!claims.length ? <p>No {showAll ? "" : "pending "}claims.</p> : <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>{claims.map(c => {
        const e = ev.get(c.event_id), f = fee.get(c.event_id);
        return <li key={c.event_id} className="ws-panel" style={{ padding: 14, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <b>{e?.name ?? "Event"}</b>
            <span>Event date {d(e?.starts_at ?? null)} · cancelled {d(c.created_at)} · {c.orders_refunded} orders refunded · fees {f ? `${gbp(f.amount)} (${f.status.replace("_", " ")})` : "none"}</span>
          </div>
          <div><small>Message to attendees</small><p style={{ margin: "2px 0" }}>{c.reason}</p></div>
          <div><small>Organiser’s force majeure explanation</small><p style={{ margin: "2px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.fm_detail}</p></div>
          {c.fm_status === "pending" ? <div style={{ display: "flex", gap: 8 }}>
            <ActionButton action={reviewForceMajeure} args={[c.event_id, true]} variant="primary" reason confirm={{ title: "Accept force majeure?", body: "The organiser’s platform fees for this event are waived. Record what evidence you relied on.", cta: "Accept and waive fees" }}>Accept</ActionButton>
            <ActionButton action={reviewForceMajeure} args={[c.event_id, false]} variant="danger" reason confirm={{ title: "Reject force majeure?", body: "The platform fees become payable. Your reason is sent to the organiser, so write it for them.", cta: "Reject" }}>Reject</ActionButton>
          </div> : <p style={{ margin: 0 }}><b>{c.fm_status === "approved" ? "Accepted" : "Rejected"}</b> {d(c.reviewed_at)}: {c.review_note}</p>}
        </li>;
      })}</ol>}
    </section>
  </div>;
}
