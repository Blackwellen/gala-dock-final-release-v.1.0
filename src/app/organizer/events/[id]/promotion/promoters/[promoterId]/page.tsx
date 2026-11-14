import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { EventSubHeader } from "@/components/organizer/event/header";
import { money } from "@/lib/format";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { ApproveSales, CreatePayoutRun, InvitePromoter, PayoutActions } from "@/components/organizer/promoter-admin-client";

export const metadata = { title: "Promoter" };
const TZ = "Europe/London";
const UUID = /^[0-9a-f-]{36}$/i;
const SALE: Record<string, [string, string]> = { pending: ["Awaiting approval", "amber"], approved: ["Approved", "green"], held: ["In payout run", "blue"], payable: ["Approved for payment", "blue"], paid: ["Paid", "green"], reversed: ["Reversed", "red"] };
const RUN: Record<string, [string, string]> = { held: ["Needs approval", "amber"], payable: ["Approved — pay the promoter", "blue"], paid: ["Paid", "green"], failed: ["Failed", "red"], scheduled: ["Scheduled (legacy)", "gray"], processing: ["Processing (legacy)", "gray"], on_hold: ["On hold (legacy)", "gray"] };
const METHOD: Record<string, string> = { bank_transfer: "Bank transfer", paypal: "PayPal", cash: "Cash", other: "Other", stripe: "Stripe (not available)", stripe_direct: "Stripe" };

type Sale = { id: string; tier_name: string; quantity: number; amount: number; commission: number; status: string; sold_at: string; order_ref: string | null; clawback_pending: boolean };
type Run = { id: string; amount: number; gross_commission: number | null; clawback_deducted: number; status: string; created_at: string; paid_at: string | null; reference: string | null; settlement_method: string | null; failure_reason: string | null; locked_at: string | null };
type Invite = { email: string; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null };

/**
 * Q68 organiser promoter screen: login invitation, sales approval and payout runs (promoter_approve_sales / promoter_create_payout /
 * promoter_payout_transition). Owner / manager / finance act; other members see read-only figures. Commission is settled by the
 * organiser off-platform — Gala Dock records it (memo ledger), it doesn't pay it.
 */
export default async function PromoterAdminPage({ params }: { params: Promise<{ id: string; promoterId: string }> }) {
  const { id, promoterId } = await params;
  if (!UUID.test(id) || !UUID.test(promoterId)) notFound();
  const ctx = await getOrganizer(); const sb = untyped(ctx.supabase);
  const { data: e } = await ctx.supabase.from("events").select("id,name").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) notFound();
  const { data: pr } = await sb.from("promoters").select("id,name,code,commission_pct,status,user_id,email,payout_method,tickets_sold,revenue,clicks").eq("id", promoterId).eq("event_id", id).maybeSingle();
  const p = pr as { id: string; name: string; code: string; commission_pct: number; status: string; user_id: string | null; email: string; payout_method: string | null; tickets_sold: number; revenue: number; clicks: number } | null;
  if (!p) notFound();
  const [sales, runs, invites, totals] = await Promise.all([
    sb.from("promoter_sales").select("id,tier_name,quantity,amount,commission,status,sold_at,order_ref,clawback_pending").eq("promoter_id", p.id).order("sold_at", { ascending: false }).limit(500).then(r => (r.data ?? []) as Sale[]),
    sb.from("promoter_payouts").select("id,amount,gross_commission,clawback_deducted,status,created_at,paid_at,reference,settlement_method,failure_reason,locked_at").eq("promoter_id", p.id).order("created_at", { ascending: false }).then(r => (r.data ?? []) as Run[]),
    sb.from("portal_invites").select("email,created_at,expires_at,accepted_at,revoked_at").eq("promoter_id", p.id).order("created_at", { ascending: false }).limit(1).then(r => (r.data ?? []) as Invite[]),
    sb.rpc("promoter_statement", { p_promoter: p.id }).then(r => (r.data ?? {}) as Record<string, number>),
  ]);
  const canMoney = ctx.canMoney, canInvite = ["owner", "manager"].includes(ctx.role);
  const pending = sales.filter(s => s.status === "pending");
  const approvedUnpaid = sales.filter(s => s.status === "approved" && !s.clawback_pending).reduce((a, s) => a + Number(s.commission), 0);
  const inv = invites[0];
  const inviteState = p.user_id ? "Linked — the promoter can sign in" : inv && !inv.accepted_at && !inv.revoked_at && Date.parse(inv.expires_at) > requestTime() ? `Invitation sent to ${inv.email} (expires ${fmtD(inv.expires_at)})` : inv && !inv.accepted_at ? "Invitation expired" : "Not invited";
  const base = `/organizer/events/${id}/promotion`;
  return <div className="pr">
    <EventSubHeader id={id} name={e.name} tab="sell" page="Promoter" canMoney={ctx.canMoney} />
    <div className="pr-head"><div className="k-grow"><Link className="k-link" href={`${base}?tab=promoters`}><ArrowLeft size={13} /> All promoters</Link>
      <h1>{p.name}</h1><p className="pr-meta"><span>Code <code>{p.code}</code></span><span>{Number(p.commission_pct)}% commission</span><span>{p.tickets_sold} tickets · {money(Number(p.revenue))} revenue · {p.clicks} clicks</span></p></div></div>
    <p className="k-note pr-offplatform"><Info size={14} /> You pay this promoter’s commission yourself (bank transfer, PayPal or as you agreed), outside Gala Dock. Gala Dock tracks sales, approvals and payouts so you and the promoter see the same figures; it doesn’t hold or pay promoter commission.</p>
    <div className="pr-r2">
      <section className="k-card pr-c"><h2>Promoter login</h2>
        <p className="pr-sub">{inviteState}{p.payout_method ? ` · prefers ${METHOD[p.payout_method] ?? p.payout_method}` : ""}</p>
        {!p.user_id && (canInvite ? <InvitePromoter promoterId={p.id} email={p.email || inv?.email || ""} /> : <p className="k-small">Only the owner or a manager can invite promoters.</p>)}
      </section>
      <section className="k-card pr-c"><h2>Commission</h2>
        <table className="mn-t"><tbody>
          <tr><td>Awaiting approval</td><td>{money(Number(totals.pending ?? 0))}</td></tr>
          <tr><td>Approved, not in a payout run</td><td>{money(Number(totals.approved ?? 0))}</td></tr>
          <tr><td>In payout runs</td><td>{money(Number(totals.held ?? 0) + Number(totals.payable ?? 0))}</td></tr>
          <tr><td>Paid by you</td><td>{money(Number(totals.paid ?? 0))}</td></tr>
          <tr><td>Reversed (refunds)</td><td>{money(Number(totals.reversed ?? 0))}</td></tr>
          {Number(totals.clawback_outstanding ?? 0) > 0 && <tr><td>Clawback to deduct from the next run</td><td>{money(Number(totals.clawback_outstanding))}</td></tr>}
        </tbody></table>
        {canMoney && <CreatePayoutRun promoterId={p.id} disabled={approvedUnpaid <= 0} />}
      </section>
    </div>
    <section className="k-card pr-c"><div className="k-between"><div><h2>Sales</h2><p className="pr-sub">Approve sales once the order is final (refunded or unissued orders can’t be approved). Approved sales go into the next payout run.</p></div></div>
      {canMoney && pending.length > 0 ? <ApproveSales promoterId={p.id} sales={pending.map(s => ({ id: s.id, label: `${fmtD(s.sold_at)} · ${s.quantity} × ${s.tier_name} · ${money(Number(s.amount))}`, commission: Number(s.commission) }))} />
        : pending.length > 0 && <p className="k-small">{pending.length} sale{pending.length === 1 ? "" : "s"} awaiting approval by the owner, a manager or finance.</p>}
      <table className="mn-t"><thead><tr><th>Sold</th><th>Tickets</th><th>Amount</th><th>Commission</th><th>Status</th></tr></thead>
        <tbody>{sales.map(s => { const [l, t] = SALE[s.status] ?? [s.status, "gray"]; return <tr key={s.id}><td>{fmtD(s.sold_at)}</td><td>{s.quantity} × {s.tier_name}</td><td>{money(Number(s.amount))}</td><td>{money(Number(s.commission))}</td><td><span className={`mn-st ${t}`}>{s.clawback_pending ? "Clawback due" : l}</span></td></tr>; })}
          {!sales.length && <tr><td colSpan={5} className="k-small">No sales through this promoter yet.</td></tr>}</tbody></table></section>
    <section className="k-card pr-c"><h2>Payout runs</h2><p className="pr-sub">1. Create a run from approved sales → 2. approve it → 3. pay the promoter yourself → 4. mark it paid with your payment reference. If your payment fails, mark the run failed and its sales return to approved.</p>
      <table className="mn-t"><thead><tr><th>Created</th><th>Amount</th><th>Status</th><th>Paid</th><th>Reference</th><th /></tr></thead>
        <tbody>{runs.map(r => { const [l, t] = RUN[r.status] ?? [r.status, "gray"]; return <tr key={r.id}><td>{fmtD(r.created_at)}</td>
          <td>{money(Number(r.amount))}{Number(r.clawback_deducted) > 0 ? <small> (after {money(Number(r.clawback_deducted))} clawback)</small> : null}</td>
          <td><span className={`mn-st ${t}`}>{l}</span>{r.failure_reason ? <small> {r.failure_reason}</small> : null}</td>
          <td>{r.paid_at ? `${fmtD(r.paid_at)}${r.settlement_method ? ` · ${METHOD[r.settlement_method] ?? r.settlement_method}` : ""}` : "—"}</td><td>{r.reference ?? "—"}</td>
          <td>{canMoney && r.locked_at && (r.status === "held" || r.status === "payable") ? <PayoutActions payoutId={r.id} promoterId={p.id} status={r.status} amount={Number(r.amount)} /> : null}</td></tr>; })}
          {!runs.length && <tr><td colSpan={6} className="k-small">No payout runs yet.</td></tr>}</tbody></table>
      {!canMoney && <p className="k-small">Only the owner, managers and finance can approve sales and run payouts.</p>}</section>
  </div>;
}
function fmtD(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "—"; }
