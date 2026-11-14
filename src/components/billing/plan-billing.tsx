import Link from "next/link";
import { ActionButton } from "@/components/workspace/actions";
import { cancelPlanAction, choosePlanAction, undoPlanChangeAction } from "@/lib/actions/billing";
import type { Db } from "@/lib/workspace/db";
import { untyped } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";

type Price = { plan: string; billing_interval: string; price_minor: number; currency: string; self_serve: boolean; stripe_price_test: string | null; stripe_price_live: string | null };
type Sub = { plan: string; billing_interval: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; pending_plan: string | null; pending_effective_at: string | null; dunning_since: string | null };
type Inv = { stripe_invoice_id: string; status: string; amount_due: number; amount_paid: number; currency: string; period_end: string | null; hosted_invoice_url: string | null };
const gbp = (m: number, c = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(m / 100);
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const label = (p: string) => p[0]!.toUpperCase() + p.slice(1);
const INVOICE: Record<string, string> = { paid: "Paid", open: "Due", draft: "Draft", void: "Void", uncollectible: "Uncollectible" };
const STATUS: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment failed — retrying", unpaid: "Unpaid", canceled: "Cancelled", incomplete: "Awaiting first payment", incomplete_expired: "Checkout expired", paused: "Paused" };

/**
 * Plan & billing panel (Q28). Reads the catalogue and the workspace's Stripe mirror through RLS; every change goes through a
 * server action that re-checks ownership, and the plan itself only changes when Stripe's signed webhook confirms it.
 */
export async function PlanBilling({ db, workspaceId, kind, plan, isOwner }: { db: Db; workspaceId: string; kind: "organizer" | "provider"; plan: string; isOwner: boolean }) {
  const u = untyped(db as never);
  const [{ data: prices }, { data: sub }, { data: invoices }] = await Promise.all([
    u.from("plan_prices").select("plan,billing_interval,price_minor,currency,self_serve,stripe_price_test,stripe_price_live").eq("kind", kind).eq("active", true).order("price_minor"),
    u.from("workspace_subscriptions").select("plan,billing_interval,status,current_period_end,cancel_at_period_end,pending_plan,pending_effective_at,dunning_since").eq("workspace_id", workspaceId).maybeSingle(),
    u.from("subscription_invoices").select("stripe_invoice_id,status,amount_due,amount_paid,currency,period_end,hosted_invoice_url").eq("workspace_id", workspaceId).order("period_end", { ascending: false }).limit(6),
  ]);
  const P = (prices ?? []) as Price[], S = sub as Sub | null, I = (invoices ?? []) as Inv[];
  const live = S && ["active", "trialing", "past_due"].includes(S.status);
  // Go-live (A2): a plan is offered only when it has a price mapped for the platform's Stripe mode.
  const liveMode = stripeLive(), mapped = (p?: Price) => !!(liveMode ? p?.stripe_price_live : p?.stripe_price_test);
  const plans = [...new Set(P.map(p => p.plan))];
  const dueInvoice = I.find(i => i.status === "open");
  // Q60: while a downgrade is scheduled the only change offered is undoing it (any other change would bill the period twice).
  const scheduled = !!(live && S?.pending_plan);
  return <section className="k-card st-c st-narrow" aria-labelledby="plan-billing-h">
    <h2 id="plan-billing-h">Plan &amp; billing</h2>
    <p className="k-small">Current plan: <b>{label(plan)}</b>{S ? <> · {STATUS[S.status] ?? S.status}{S.current_period_end && live && !S.cancel_at_period_end ? <> · renews {day(S.current_period_end)}</> : null}</> : null}</p>
    {S?.pending_plan && <p className="k-small">Changes to <b>{label(S.pending_plan)}</b> on {day(S.pending_effective_at)}. You keep your current features until then.</p>}
    {S?.cancel_at_period_end && <p className="k-small">Your plan ends on {day(S.current_period_end)} and the workspace moves to Starter.</p>}
    {S?.status === "past_due" && <p className="ws-form-error" role="alert">Your last payment failed. Stripe will retry; your plan stays active for 14 days from {day(S.dunning_since)}.
      {/* Q60: the only way to fix a failed payment without a customer portal is to pay the open invoice with another card. */}
      {dueInvoice?.hosted_invoice_url && <> <a href={dueInvoice.hosted_invoice_url} target="_blank" rel="noreferrer">Pay the open invoice or use another card</a>.</>}</p>}
    <p className="k-small k-muted">Prices exclude VAT.{liveMode ? " Payments are taken securely by Stripe." : " Billing runs in Stripe test mode — no real card is charged."}</p>
    <div className="k-row" style={{ gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
      {plans.map(pl => {
        const month = P.find(p => p.plan === pl && p.billing_interval === "month"), year = P.find(p => p.plan === pl && p.billing_interval === "year");
        const current = pl === plan;
        // Q60: the current plan can still switch billing interval (monthly ↔ yearly); before, it had no buttons at all.
        const showMonth = mapped(month) && !scheduled && (!current || (live && S?.billing_interval !== "month"));
        const showYear = mapped(year) && !scheduled && (!current || (live && S?.billing_interval !== "year"));
        return <div key={pl} className="k-card" style={{ padding: 14, minWidth: 200, flex: "1 1 200px" }}>
          <b>{label(pl)}</b>{current && <span className="st-pill ok" style={{ marginLeft: 8 }}>Current</span>}
          <p className="k-small">{month ? `${gbp(month.price_minor, month.currency)} / month` : ""}{year ? ` · ${gbp(year.price_minor, year.currency)} / year` : ""}</p>
          {!month?.self_serve ? <Link className="k-btn outline sm" href="/help?topic=billing">Contact sales</Link>
            : isOwner && (showMonth || showYear) ? <div className="k-row" style={{ gap: 6, flexWrap: "wrap" }}>
              {showMonth && <ActionButton action={choosePlanAction} args={[workspaceId, kind, pl, "month"]} variant="primary">{live ? (current ? "Switch to monthly" : "Switch monthly") : "Choose monthly"}</ActionButton>}
              {showYear && <ActionButton action={choosePlanAction} args={[workspaceId, kind, pl, "year"]}>{live ? (current ? "Switch to yearly" : "Switch yearly") : "Choose yearly"}</ActionButton>}
            </div> : null}
        </div>;
      })}
    </div>
    {isOwner && live && <div className="k-row" style={{ gap: 8, marginTop: 12 }}>
      {scheduled && <ActionButton action={undoPlanChangeAction} args={[workspaceId, kind]} variant="primary">Keep my current plan</ActionButton>}
      {S!.cancel_at_period_end
        ? <ActionButton action={cancelPlanAction} args={[workspaceId, kind, false]}>Keep my plan</ActionButton>
        : <ActionButton action={cancelPlanAction} args={[workspaceId, kind, true]} variant="danger" confirm={{ title: "Cancel plan?", body: "Your plan stays active until the end of this billing period, then the workspace moves to Starter.", cta: "Cancel at period end" }}>Cancel plan</ActionButton>}
    </div>}
    {!isOwner && <p className="k-small k-muted">Only the workspace owner can change the plan.</p>}
    {I.length > 0 && <table className="k-table" style={{ marginTop: 12 }}><thead><tr><th>Invoice</th><th>Status</th><th>Period end</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
      <tbody>{I.map(i => <tr key={i.stripe_invoice_id}><td>{i.hosted_invoice_url ? <a href={i.hosted_invoice_url} target="_blank" rel="noreferrer">{i.stripe_invoice_id.slice(-8)}</a> : i.stripe_invoice_id.slice(-8)}</td>
        <td>{INVOICE[i.status] ?? i.status}</td><td>{day(i.period_end)}</td><td style={{ textAlign: "right" }}>{gbp(i.status === "paid" ? i.amount_paid : i.amount_due, i.currency)}</td></tr>)}</tbody></table>}
  </section>;
}
