import { ActionButton } from "@/components/workspace/actions";
import { buyCreditPackAction } from "@/lib/actions/billing";
import { untyped, type Db } from "@/lib/workspace/db";
import { stripeLive } from "@/lib/stripe";
import { automaticTaxEnabled } from "@/lib/billing/core";

type Pack = { id: string; name: string; price_minor: number; currency: string; credits: number | string; expiry_days: number | null; workspace_kinds: string[]; stripe_price_test: string | null; stripe_price_live: string | null };
const money = (m: number, c = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(m / 100);

/**
 * Q60: AI credit packs could not be bought anywhere — buyCreditPackAction had no button. Lists the active packs for this workspace
 * kind that have a Stripe price mapped for the platform's mode; the owner buys through Stripe Checkout, and the credits land on the
 * ledger only when the signed webhook confirms payment (billing_credit_pack_paid).
 */
export async function CreditPacks({ db, workspaceId, kind, isOwner, justPaid }: { db: Db; workspaceId: string; kind: "organizer" | "provider"; isOwner: boolean; justPaid?: boolean }) {
  const { data } = await untyped(db as never).from("credit_packs").select("id,name,price_minor,currency,credits,expiry_days,workspace_kinds,stripe_price_test,stripe_price_live").eq("active", true).order("price_minor");
  const live = stripeLive();
  const packs = ((data ?? []) as Pack[]).filter(p => (p.workspace_kinds ?? []).includes(kind) && !!(live ? p.stripe_price_live : p.stripe_price_test));
  if (!packs.length) return null;
  return <section className="k-card st-c" style={{ display: "grid", gap: 10 }} aria-labelledby="packs-h">
    <h2 id="packs-h">Top up Gala Agent credits</h2>
    {justPaid && <p className="k-small" role="status">Payment received — your credits appear here within a minute, once Stripe confirms it.</p>}
    <p className="k-small k-muted">Purchased credits are used after the monthly allowance{packs.some(p => p.expiry_days) ? `, and expire ${packs[0]!.expiry_days} days after purchase` : ""}. {automaticTaxEnabled() ? "Prices exclude VAT, which is added at checkout." : "Prices shown are what you pay; VAT isn’t added at the moment."}{live ? "" : " Billing runs in Stripe test mode — no real card is charged."}</p>
    <div className="k-row" style={{ gap: 12, flexWrap: "wrap" }}>
      {packs.map(p => <div key={p.id} className="k-card" style={{ padding: 14, minWidth: 180, flex: "1 1 180px", display: "grid", gap: 6 }}>
        <b>{p.name}</b>
        <span className="k-small">{Number(p.credits).toLocaleString("en-GB")} credits · {money(p.price_minor, p.currency)}</span>
        {isOwner && <ActionButton action={buyCreditPackAction} args={[workspaceId, kind, p.id]}>Buy</ActionButton>}
      </div>)}
    </div>
    {!isOwner && <p className="k-small k-muted">Only the workspace owner can buy credits.</p>}
  </section>;
}
