import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { untyped } from "@/lib/workspace/db";
import { DISPUTE_REASONS, DISPUTE_STATUS } from "@/lib/marketplace/lifecycle";
import { money, dateShort, time } from "@/lib/format";
import { ActButton } from "./lifecycle-client";
import { DisputeEntryForm } from "./dispute-client";
import "@/styles/marketplace.css";

type Dispute = { id: string; reference: string; build_item_id: string; event_id: string; status: string; reason: string; summary: string; opened_by_party: string; amount_claimed: number | null;
  created_at: string; response_due_at: string; resolution: Record<string, unknown> | null; customer_accepted_at: string | null; provider_accepted_at: string | null;
  terms_snapshot: Record<string, unknown>; payment_snapshot: Record<string, unknown> };
type Entry = { id: string; party: string; kind: string; body: string; files: { path: string; name: string }[]; created_at: string };
const PARTY: Record<string, string> = { customer: "Organiser", provider: "Provider", admin: "Gala Dock", system: "System" };

/** One dispute thread (§44), rendered for whichever party is viewing. RLS limits who can load it; internal admin notes never reach parties. */
export async function DisputeView({ client, id, viewer, bookingHref }: { client: unknown; id: string; viewer: "customer" | "provider"; bookingHref: (itemId: string, eventId: string) => string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = untyped(client as never);
  const { data } = await db.from("booking_disputes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as Dispute;
  const [{ data: entries }, { data: item }] = await Promise.all([
    db.from("booking_dispute_entries").select("id,party,kind,body,files,created_at").eq("dispute_id", id).eq("internal", false).order("created_at"),
    db.from("build_items").select("title").eq("id", d.build_item_id).maybeSingle(),
  ]);
  const closed = d.status === "resolved" || d.status === "escalated";
  const mine = viewer === "customer" ? d.customer_accepted_at : d.provider_accepted_at;
  const when = (iso: string) => `${dateShort(iso)}, ${time(iso)}`;
  return <div className="mk-page">
    <div className="mk-page-head"><div>
      <h1>Dispute {d.reference}</h1>
      <p>{DISPUTE_REASONS.find(([k]) => k === d.reason)?.[1]} · <Link className="mk-link" href={bookingHref(d.build_item_id, d.event_id)}>{item?.title ?? "Booking"}</Link> · opened {when(d.created_at)} by {PARTY[d.opened_by_party]?.toLowerCase()}</p>
    </div><span className={`mk-tag ${d.status === "resolved" ? "green" : d.status === "resolution_proposed" ? "purple" : "red"}`}>{DISPUTE_STATUS[d.status] ?? d.status}</span></div>
    <div className="mk-grid">
      <section className="mk-card" aria-labelledby="dp-thread"><h2 id="dp-thread">Timeline</h2>
        <ol className="mk-thread">{((entries ?? []) as Entry[]).map(e => <li key={e.id} className={e.party === "admin" ? "admin" : ""}>
          <header><b>{PARTY[e.party]}{e.kind === "evidence" ? " · evidence" : e.kind === "proposal" ? " · proposed resolution" : e.kind === "decision" ? " · decision" : ""}</b><time dateTime={e.created_at}>{when(e.created_at)}</time></header>
          {e.body && <p>{e.body}</p>}
          {e.files?.length > 0 && <div className="mk-row">{e.files.map(f => <a key={f.path} className="mk-link mk-row" style={{ gap: 4 }} href={`/api/disputes/${d.id}/files?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener noreferrer"><FileText size={13} aria-hidden="true" />{f.name}</a>)}</div>}
        </li>)}</ol>
        {!closed && <DisputeEntryForm disputeId={d.id} />}
      </section>
      <aside className="k-col" style={{ display: "grid", gap: 16 }}>
        {d.status === "resolution_proposed" && d.resolution && <section className="mk-card" aria-labelledby="dp-res"><h2 id="dp-res">Proposed resolution</h2>
          <dl className="mk-dl">{Object.entries(d.resolution).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{typeof v === "number" && /refund|amount|credit/.test(k) ? money(v) : String(v)}</dd></div>)}</dl>
          {mine ? <p className="mk-note">You accepted this. Waiting for the other side.</p> : <ActButton label="Accept resolution" action="acceptDisputeResolution" args={d.id} tone="primary" confirm="Once both sides accept, the dispute is resolved on these terms." />}
        </section>}
        <section className="mk-card" aria-labelledby="dp-facts"><h2 id="dp-facts">Booking record</h2>
          <dl className="mk-dl">
            <div><dt>Amount in question</dt><dd>{d.amount_claimed != null ? money(d.amount_claimed) : "—"}</dd></div>
            <div><dt>Booking value</dt><dd>{d.payment_snapshot.amount != null ? money(Number(d.payment_snapshot.amount)) : "—"}</dd></div>
            <div><dt>Paid</dt><dd>{d.payment_snapshot.paid_amount != null ? money(Number(d.payment_snapshot.paid_amount)) : "—"}</dd></div>
            <div><dt>Response due</dt><dd>{dateShort(d.response_due_at)}</dd></div>
          </dl>
          <p className="mk-note">The booking terms and payment state were captured when the dispute opened. If the parties don’t agree, Gala Dock reviews and proposes a resolution. Card chargebacks are decided by the card issuer, not by Gala Dock.</p>
        </section>
      </aside>
    </div>
  </div>;
}
