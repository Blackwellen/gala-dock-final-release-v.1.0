import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { ChargebackEvidenceForm } from "./chargeback-evidence";

type Release = { id: string; part: string; event_id: string | null; sale_kind: string; status: string; due_at: string | null; hold_limit_at: string; amount_minor: number | null; reserve_minor: number | null; reserve_until: string | null; blocked_reason: string | null };
type Dispute = { stripe_dispute_id: string; amount_minor: number; currency: string; reason: string | null; status: string; evidence_due_by: string | null; evidence_submitted_at: string | null };
const STATUS: Record<string, string> = { held: "Held until the event is complete", due: "Being paid out", blocked: "On hold", paid_out: "Paid out", cancelled: "Refunded" };
const BLOCK: Record<string, string> = { booking_dispute_open: "a booking dispute is open", card_dispute_open: "a card chargeback is open", cancellation_pending: "a cancellation is pending", payout_failed: "the last payout to your bank failed" };
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * DEC-107 seller view (organiser and provider Money): when each payment is released from your own Stripe balance, any reserve,
 * and card chargebacks on your sales with an evidence form. RLS limits both lists to this workspace's account.
 */
export async function SellerPayouts({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const sb = await createClient();
  const [{ data: rel }, { data: ca }] = await Promise.all([
    sb.from("payout_releases" as never).select("id,part,event_id,sale_kind,status,due_at,hold_limit_at,amount_minor,reserve_minor,reserve_until,blocked_reason").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(30),
    sb.from("connect_accounts" as never).select("stripe_account_id").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  const account = (ca as { stripe_account_id: string | null } | null)?.stripe_account_id ?? null;
  const { data: dis } = account ? await sb.from("stripe_disputes" as never).select("stripe_dispute_id,amount_minor,currency,reason,status,evidence_due_by,evidence_submitted_at").eq("stripe_account_id", account).order("created_at", { ascending: false }).limit(20) : { data: [] };
  const releases = (rel ?? []) as Release[], disputes = (dis ?? []) as Dispute[];
  if (!releases.length && !disputes.length) return null;
  return <div className="pc-releases" style={{ marginTop: 12, display: "grid", gap: 12 }}>
    {releases.length > 0 && <section aria-labelledby="sp-rel"><h3 id="sp-rel" style={{ fontSize: 15, margin: "0 0 6px" }}>Releases from your Stripe balance</h3>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>Payments stay in your own Stripe balance and are paid out 24 hours after the event (or when the customer confirms), grouped by event.</p>
      <table className="k-table" style={{ width: "100%", fontSize: 13 }}><thead><tr><th>Sale</th><th>Status</th><th>Release date</th><th className="r">Paid out</th><th className="r">Reserve</th></tr></thead>
        <tbody>{releases.map(r => <tr key={r.id}><td>{r.part === "reserve" ? "Reserve" : r.sale_kind.replace(/_/g, " ")}</td>
          <td>{STATUS[r.status] ?? r.status}{r.status === "blocked" && r.blocked_reason ? ` — ${BLOCK[r.blocked_reason] ?? r.blocked_reason.replace(/_/g, " ")}` : ""}</td>
          <td>{day(r.part === "reserve" ? r.reserve_until : r.due_at ?? r.hold_limit_at)}</td>
          <td className="r">{r.amount_minor != null ? money(r.amount_minor / 100) : "—"}</td>
          <td className="r">{r.part === "main" && r.reserve_minor ? `${money(r.reserve_minor / 100)} until ${day(r.reserve_until)}` : "—"}</td></tr>)}</tbody></table></section>}
    {disputes.length > 0 && <section aria-labelledby="sp-cb"><h3 id="sp-cb" style={{ fontSize: 15, margin: "0 0 6px" }}>Card chargebacks on your sales</h3>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>You are the seller, so the card issuer decides with your evidence. The disputed amount and Stripe’s fee come out of your Stripe balance until it’s decided.</p>
      {disputes.map(d => <div key={d.stripe_dispute_id} className="k-card" style={{ padding: 12, marginBottom: 8 }}>
        <b>{money(d.amount_minor / 100)}</b> · {String(d.reason ?? "general").replace(/_/g, " ")} · {d.status.replace(/_/g, " ")}{d.evidence_due_by ? ` · evidence due ${day(d.evidence_due_by)}` : ""}
        {d.evidence_submitted_at ? <p className="muted" style={{ margin: "4px 0 0" }}>Evidence submitted {day(d.evidence_submitted_at)}.</p>
          : canManage && ["needs_response", "warning_needs_response"].includes(d.status) ? <ChargebackEvidenceForm disputeId={d.stripe_dispute_id} /> : null}
      </div>)}</section>}
  </div>;
}
