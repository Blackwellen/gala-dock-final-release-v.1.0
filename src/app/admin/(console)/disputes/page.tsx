import Link from "next/link";
import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { getAdmin } from "@/lib/admin/context";
import { money, dateShort, time } from "@/lib/format";
import { DISPUTE_REASONS, DISPUTE_STATUS } from "@/lib/marketplace/lifecycle";
import { Head, TabBar, Pill } from "../_b/kit";
import { DisputeDecision, CancellationDecision } from "./decide";
import "@/styles/admin-b.css";
import "@/styles/admin-disputes.css";

export const metadata: Metadata = { title: "Booking disputes" };

type Dispute = { id: string; reference: string; status: string; reason: string; summary: string; opened_by_party: string; amount_claimed: number | null; created_at: string; response_due_at: string;
  build_item_id: string; event_id: string; workspace_id: string; payment_snapshot: Record<string, unknown>; terms_snapshot: Record<string, unknown>; resolution: Record<string, unknown> | null;
  customer_accepted_at: string | null; provider_accepted_at: string | null };
type Entry = { id: string; party: string; kind: string; body: string; files: { path: string; name: string }[]; created_at: string; internal: boolean };
type Cancel = { id: string; party: string; kind: string; reason: string; status: string; calculation: { paid: number; refund_amount: number | null; notes: string[]; days_before_event: number | null }; created_at: string; build_item_id: string };
type Charge = { stripe_dispute_id: string; amount_minor: number; currency: string; reason: string | null; status: string; evidence_due_by: string | null; order_ref: string | null; livemode: boolean; outcome: string | null };
const stamp = (iso: string | null) => iso ? `${dateShort(iso)} ${time(iso)}` : "—";
const PARTY: Record<string, string> = { customer: "Organiser", provider: "Provider", admin: "Gala Dock", system: "System" };

/** Marketplace disputes (§44): booking disputes, cancellation reviews (§45) and Stripe chargebacks, for support/marketplace/commerce admins. */
export default async function DisputesPage(props: PageProps<"/admin/disputes">) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  const allowed = ["support", "marketplace", "commerce"].some(p => admin.permissions.has(p as never));
  if (!allowed) return <Restricted area="Disputes" />;
  const db = admin.db;
  const tab = sp.tab === "cancellations" || sp.tab === "chargebacks" ? sp.tab : "disputes";
  const sel = typeof sp.id === "string" && /^[0-9a-f-]{36}$|^dp_\w+$/.test(sp.id) ? sp.id : null;
  const [{ data: disputes }, { data: cancels }, { data: charges }] = await Promise.all([
    db.from("booking_disputes").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("booking_cancellations").select("id,party,kind,reason,status,calculation,created_at,build_item_id").in("status", ["manual_review", "requested"]).order("created_at").limit(100),
    db.from("stripe_disputes").select("stripe_dispute_id,amount_minor,currency,reason,status,evidence_due_by,order_ref,livemode,outcome").order("created_at", { ascending: false }).limit(100),
  ]);
  const D = (disputes ?? []) as Dispute[], C = (cancels ?? []) as Cancel[], S = (charges ?? []) as Charge[];
  const openD = D.filter(d => d.status !== "resolved").length;
  const href = (t: string, id?: string) => `/admin/disputes?tab=${t}${id ? `&id=${encodeURIComponent(id)}` : ""}`;
  const current = tab === "disputes" && sel ? D.find(d => d.id === sel) : null;
  const { data: entries } = current ? await db.from("booking_dispute_entries").select("id,party,kind,body,files,created_at,internal").eq("dispute_id", current.id).order("created_at") : { data: null };
  const { data: itemRow } = current ? await db.from("build_items").select("title").eq("id", current.build_item_id).maybeSingle() : { data: null };

  return <div className="adb add">
    <Head title="Booking disputes" subtitle="Mediate booking disputes, review cancellations and track card chargebacks." />
    <TabBar active={tab} tabs={[{ key: "disputes", label: "Booking disputes", href: href("disputes"), count: openD }, { key: "cancellations", label: "Cancellation reviews", href: href("cancellations"), count: C.filter(c => c.status === "manual_review").length },
      { key: "chargebacks", label: "Card chargebacks", href: href("chargebacks"), count: S.filter(s => !s.outcome).length }]} />
    {tab === "disputes" && <div className={`add-split ${current ? "has-detail" : ""}`}>
      <section className="adb-panel"><table className="adb-table"><thead><tr><th>Reference</th><th>Reason</th><th>Opened by</th><th className="r">Amount</th><th>Status</th><th>Response due</th></tr></thead>
        <tbody>{D.length ? D.map(d => <tr key={d.id} className={d.id === sel ? "sel" : ""}><td><Link href={href("disputes", d.id)}><b>{d.reference}</b></Link></td><td>{DISPUTE_REASONS.find(([k]) => k === d.reason)?.[1]}</td>
          <td>{PARTY[d.opened_by_party]}</td><td className="r">{d.amount_claimed != null ? money(d.amount_claimed) : "—"}</td><td><Pill status={d.status === "resolution_proposed" ? "pending" : d.status === "review" ? "in_review" : d.status} label={DISPUTE_STATUS[d.status]} /></td><td>{stamp(d.response_due_at)}</td></tr>)
          : <tr><td colSpan={6} className="add-muted">No booking disputes.</td></tr>}</tbody></table></section>
      {current && <aside className="adb-panel add-detail" aria-labelledby="add-d">
        <h2 id="add-d">{current.reference} · {itemRow?.title ?? "Booking"}</h2>
        <dl className="add-kv"><div><dt>Status</dt><dd>{DISPUTE_STATUS[current.status]}</dd></div><div><dt>Booking value</dt><dd>{current.payment_snapshot.amount != null ? money(Number(current.payment_snapshot.amount)) : "—"}</dd></div>
          <div><dt>Paid</dt><dd>{current.payment_snapshot.paid_amount != null ? money(Number(current.payment_snapshot.paid_amount)) : "—"}</dd></div><div><dt>Claimed</dt><dd>{current.amount_claimed != null ? money(current.amount_claimed) : "—"}</dd></div>
          {current.status === "resolution_proposed" && <div><dt>Accepted by</dt><dd>{[current.customer_accepted_at && "organiser", current.provider_accepted_at && "provider"].filter(Boolean).join(", ") || "nobody yet"}</dd></div>}</dl>
        {Object.keys(current.terms_snapshot ?? {}).length > 0 && <details className="add-terms"><summary>Booking terms at opening</summary><pre>{JSON.stringify(current.terms_snapshot, null, 2)}</pre></details>}
        <ol className="add-thread">{((entries ?? []) as Entry[]).map(e => <li key={e.id} className={e.party}><header><b>{PARTY[e.party]}{e.internal ? " · internal" : ""}</b><span>{stamp(e.created_at)}</span></header>
          {e.body && <p>{e.body}</p>}{e.files?.map(f => <a key={f.path} href={`/api/disputes/${current.id}/files?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener noreferrer">{f.name}</a>)}</li>)}</ol>
        <DisputeDecision id={current.id} status={current.status} />
      </aside>}
    </div>}
    {tab === "cancellations" && <section className="adb-panel"><table className="adb-table"><thead><tr><th>Requested</th><th>Party</th><th>Type</th><th>Reason</th><th className="r">Paid</th><th className="r">Policy refund</th><th>Decision</th></tr></thead>
      <tbody>{C.length ? C.map(c => <tr key={c.id}><td>{stamp(c.created_at)}</td><td>{PARTY[c.party] ?? c.party}</td><td>{c.kind.replace("_", " ")}</td><td className="add-wrap">{c.reason}{c.calculation.notes?.length ? <small>{c.calculation.notes.join(" ")}</small> : null}</td>
        <td className="r">{money(c.calculation.paid)}</td><td className="r">{c.calculation.refund_amount == null ? "Review" : money(c.calculation.refund_amount)}</td>
        <td>{c.status === "manual_review" ? <CancellationDecision id={c.id} paid={Number(c.calculation.paid ?? 0)} /> : <Pill status="waiting" label="Awaiting counterparty" />}</td></tr>)
        : <tr><td colSpan={7} className="add-muted">No cancellations waiting for review.</td></tr>}</tbody></table></section>}
    {tab === "chargebacks" && <section className="adb-panel">
      <p className="add-muted" style={{ margin: "0 0 10px" }}>Mirrored from Stripe. The card issuer decides the outcome; submit evidence in the Stripe Dashboard before the due date.</p>
      <table className="adb-table"><thead><tr><th>Dispute</th><th>Order</th><th>Reason</th><th className="r">Amount</th><th>Status</th><th>Evidence due</th><th>Mode</th></tr></thead>
        <tbody>{S.length ? S.map(s => <tr key={s.stripe_dispute_id}><td><b>{s.stripe_dispute_id}</b></td><td>{s.order_ref ?? "—"}</td><td>{s.reason ?? "—"}</td><td className="r">{money(s.amount_minor / 100, s.currency)}</td>
          <td><Pill status={s.outcome === "won" ? "resolved" : s.outcome === "lost" ? "failed" : "pending"} label={s.status.replace(/_/g, " ")} /></td><td>{stamp(s.evidence_due_by)}</td><td>{s.livemode ? "Live" : "Test"}</td></tr>)
          : <tr><td colSpan={7} className="add-muted">No card chargebacks.</td></tr>}</tbody></table></section>}
  </div>;
}
