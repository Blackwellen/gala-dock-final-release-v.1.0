import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";
import { PricingTabs, type PricingPlan } from "./pricing-tabs";

/** Public pricing (owner 2026-10-30: "update public pricing"). Reads the same plan_prices / plan_entitlements / credit_packs rows Stripe
 *  billing uses (anon-readable), so the page can never drift from what checkout charges. Business prices are shown + VAT (the Stripe
 *  prices are tax-exclusive, LEGAL "business fees plus VAT"). Nothing here is hard-coded except plan copy order. */
const ORDER = ["starter", "pro", "business", "enterprise"] as const;
const NAME: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };

type Price = { kind: string; plan: string; billing_interval: string; price_minor: number; currency: string; self_serve: boolean; active: boolean };
type Ent = { kind: string; plan: string; capability: string; value: unknown };
type Pack = { name: string; price_minor: number; currency: string; credits: number | string; active: boolean };   // credits is numeric(…) → arrives as a string

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const lim = (v: unknown, unit: string) => { const x = n(v); return x === null ? `Unlimited ${unit}` : `${x.toLocaleString("en-GB")} ${unit}`; };

function features(kind: string, e: Record<string, unknown>): string[] {
  const out = kind === "organizer"
    ? [lim(e["events.active.max"], "active events"), lim(e["team.max"], "team members"), `${(n(e["storage.gb"]) ?? 0).toLocaleString("en-GB")} GB storage`]
    : [lim(e["listings.max"], "listings"), lim(e["team.max"], "team members"), `${(n(e["storage.gb"]) ?? 0).toLocaleString("en-GB")} GB storage`,
       `${((n(e["commission.rate_bps"]) ?? 0) / 100).toLocaleString("en-GB")}% platform fee on bookings`];
  if (n(e["ai.credits.monthly"])) out.push(`${n(e["ai.credits.monthly"])!.toLocaleString("en-GB")} Gala Agent credits a month`);
  if (e["agent.actions"] === true) out.push(e["agent.deep"] === true ? "Gala Agent missions and deep analysis" : "Gala Agent missions");
  if (kind === "organizer" && e["reporting.advanced"] === true) out.push("Advanced reporting");
  if (e["api.access"] === true) out.push("API, webhooks and MCP access");
  return out;
}

export async function Pricing() {
  const supabase = await createClient();
  const [{ data: prices }, { data: ents }, { data: packs }] = await Promise.all([
    supabase.from("plan_prices").select("kind,plan,billing_interval,price_minor,currency,self_serve,active").eq("active", true),
    supabase.from("plan_entitlements").select("kind,plan,capability,value"),
    supabase.from("credit_packs").select("name,price_minor,currency,credits,active").eq("active", true).order("price_minor"),
  ]);
  const P = (prices ?? []) as Price[], E = (ents ?? []) as Ent[];
  const plans: PricingPlan[] = (["organizer", "provider"] as const).flatMap(kind => ORDER.map(plan => {
    const ent = Object.fromEntries(E.filter(x => x.kind === kind && x.plan === plan).map(x => [x.capability, x.value]));
    const month = P.find(x => x.kind === kind && x.plan === plan && x.billing_interval === "month");
    const year = P.find(x => x.kind === kind && x.plan === plan && x.billing_interval === "year");
    return { kind, plan, name: NAME[plan], month: month?.price_minor ?? (plan === "starter" ? 0 : null), year: year?.price_minor ?? null,
      contact: plan === "enterprise" || (month ? !month.self_serve : false), features: features(kind, ent) };
  }).filter(p => p.month !== null || p.contact));

  return <section className="lp-sec lp-pricing" id="pricing" aria-labelledby="pricing-title">
    <div className="lp-container lp-pricing-wrap">
      <div className="lp-head is-center"><p className="lp-eyebrow is-center">Pricing</p>
        <h2 id="pricing-title">Start free. Scale when you’re ready.</h2>
        <p className="lp-lead">Planning a personal event and discovering events are free. Organizer and provider workspaces start on the free Starter plan; upgrade when your team or volume grows.</p></div>
      <PricingTabs plans={plans} />
      <div className="lp-price-extra">
        <div className="lp-price-fees"><h3>Transaction fees</h3>
          <dl>
            <div><dt>Ticket buyers</dt><dd>{LEGAL.fees.ticketBuyer}</dd></div>
            <div><dt>Ticket sellers</dt><dd>{LEGAL.fees.ticketSeller}</dd></div>
            <div><dt>Suppliers</dt><dd>{LEGAL.fees.supplier}</dd></div>
            <div><dt>Booking payments</dt><dd>{LEGAL.fees.bookingAdmin}</dd></div>
          </dl>
          <p className="lp-price-note">Payments are processed by Stripe; sellers are paid out to their own Stripe account. Gala Dock fees carry UK VAT at {LEGAL.vatRate}. See the <Link href="/terms">Terms of Service</Link>.</p></div>
        {(packs ?? []).length > 0 && <div className="lp-price-fees"><h3>Gala Agent credit top-ups</h3>
          <dl>{(packs as Pack[]).map(k => <div key={k.name}><dt>{Number(k.credits).toLocaleString("en-GB")} credits</dt><dd>£{(k.price_minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })} + VAT</dd></div>)}</dl>
          <p className="lp-price-note">For organizer and provider workspaces, on top of the monthly credits in each plan.</p></div>}
      </div>
    </div>
  </section>;
}
