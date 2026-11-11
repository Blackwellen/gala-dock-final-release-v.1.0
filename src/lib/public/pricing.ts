import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Public pricing data (blueprint §8: "one canonical pricing configuration"). Reads the same anon-readable plan_prices /
 * plan_entitlements / credit_packs rows Stripe billing and the entitlement checks use, so the page can never show a price,
 * allowance or fee the backend does not enforce. Nothing is hard-coded except plan order and display names.
 */
export const PLAN_ORDER = ["starter", "pro", "business", "enterprise"] as const;
export const PLAN_NAME: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };
export type Kind = "organizer" | "provider";
export type Caps = { events: number | null; listings: number | null; team: number | null; storage: number; credits: number; commissionBps: number | null; agentActions: boolean; agentDeep: boolean; api: boolean; reporting: boolean };
export type PricingPlan = { kind: Kind; plan: string; name: string; month: number | null; year: number | null; contact: boolean; caps: Caps; features: string[] };
export type CreditPack = { name: string; priceMinor: number; credits: number };
export type PricingData = { plans: PricingPlan[]; packs: CreditPack[]; ok: boolean };

type Price = { kind: string; plan: string; billing_interval: string; price_minor: number; self_serve: boolean };
type Ent = { kind: string; plan: string; capability: string; value: unknown };
type Pack = { name: string; price_minor: number; credits: number | string };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const lim = (v: number | null, unit: string) => (v === null ? `Unlimited ${unit}` : `${v.toLocaleString("en-GB")} ${unit}`);

function caps(e: Record<string, unknown>): Caps {
  return { events: num(e["events.active.max"]), listings: num(e["listings.max"]), team: num(e["team.max"]), storage: num(e["storage.gb"]) ?? 0, credits: num(e["ai.credits.monthly"]) ?? 0,
    commissionBps: num(e["commission.rate_bps"]), agentActions: e["agent.actions"] === true, agentDeep: e["agent.deep"] === true, api: e["api.access"] === true, reporting: e["reporting.advanced"] === true };
}
function features(kind: Kind, c: Caps): string[] {
  const out = kind === "organizer" ? [lim(c.events, "active events"), lim(c.team, "team members"), `${c.storage.toLocaleString("en-GB")} GB storage`]
    : [lim(c.listings, "listings"), lim(c.team, "team members"), `${c.storage.toLocaleString("en-GB")} GB storage`, `${((c.commissionBps ?? 0) / 100).toLocaleString("en-GB")}% platform fee on bookings`];
  if (c.credits) out.push(`${c.credits.toLocaleString("en-GB")} Gala Agent credits a month`);
  if (c.agentActions) out.push(c.agentDeep ? "Gala Agent missions and deep analysis" : "Gala Agent missions");
  if (kind === "organizer" && c.reporting) out.push("Advanced reporting");
  if (c.api) out.push("API, webhooks and MCP access");
  return out;
}

export async function loadPricing(): Promise<PricingData> {
  try {
    const supabase = await createClient();
    const [{ data: prices, error: pe }, { data: ents, error: ee }, { data: packs }] = await Promise.all([
      supabase.from("plan_prices").select("kind,plan,billing_interval,price_minor,self_serve").eq("active", true),
      supabase.from("plan_entitlements").select("kind,plan,capability,value"),
      supabase.from("credit_packs").select("name,price_minor,credits").eq("active", true).order("price_minor"),
    ]);
    const P = (prices ?? []) as Price[], E = (ents ?? []) as Ent[];
    const plans: PricingPlan[] = (["organizer", "provider"] as const).flatMap(kind => PLAN_ORDER.map(plan => {
      const c = caps(Object.fromEntries(E.filter(x => x.kind === kind && x.plan === plan).map(x => [x.capability, x.value])));
      const month = P.find(x => x.kind === kind && x.plan === plan && x.billing_interval === "month");
      const year = P.find(x => x.kind === kind && x.plan === plan && x.billing_interval === "year");
      return { kind, plan, name: PLAN_NAME[plan]!, month: month?.price_minor ?? (plan === "starter" ? 0 : null), year: year?.price_minor ?? null,
        contact: plan === "enterprise" || (month ? !month.self_serve : false), caps: c, features: features(kind, c) };
    }).filter(p => p.month !== null || p.contact));
    return { plans, packs: ((packs ?? []) as Pack[]).map(k => ({ name: k.name, priceMinor: k.price_minor, credits: Number(k.credits) })), ok: !pe && !ee && P.length > 0 };
  } catch {
    return { plans: [], packs: [], ok: false };
  }
}
