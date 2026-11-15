/**
 * EU VAT readiness for Gala Dock's OWN sales (plans, credit packs, promotion boosts) — owner decision D2 following Gigvora
 * (Gigvora docs/commercial/international-tax-registration-plan.md, director 2026-11-10): consumers everywhere may buy except in
 * sanctioned places; Blackwellen registers for EU VAT through the non-Union OSS in Ireland (GB508480488 as national reference).
 * Until a country is registered, Stripe Tax reports `not_collecting` and charges 0% — the tax is still owed. Each such consumer sale
 * raises a staff alert (public.record_compliance_signal) so the registration can be made (EU: apply by the 10th of the next month).
 * Pure module: tested in tests/release/q74-legal-engineering.spec.ts.
 */
import { sanctionedJurisdiction } from "@/lib/legal/sanctions";

export const EU_MEMBER_STATES = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"] as const;
/** Zero-threshold places for digital services to consumers (Gigvora plan §3; verify each with the national authority). */
export const ZERO_THRESHOLD_COUNTRIES: readonly string[] = [...EU_MEMBER_STATES, "IN", "AE", "SA", "TR", "MX", "KR", "BH", "OM", "KE", "GH", "DZ", "TN", "MA", "UA", "MW"];
export const isZeroThreshold = (c: string | null | undefined) => !!c && ZERO_THRESHOLD_COUNTRIES.includes(c.toUpperCase());

type Addr = { country?: string | null; state?: string | null } | null | undefined;
type TaxAmount = { amount?: number; taxability_reason?: string | null; tax_rate_details?: unknown } | null;
/** The slice of a Stripe Checkout Session or Invoice the check needs (platform own-sales only). */
export type TaxObject = {
  id: string; object?: string; livemode?: boolean; currency?: string | null; amount_total?: number | null; total?: number | null; created?: number;
  metadata?: Record<string, string> | null; payment_status?: string | null; status?: string | null;
  automatic_tax?: { enabled?: boolean; status?: string | null } | null;
  total_details?: { amount_tax?: number | null; breakdown?: { taxes?: TaxAmount[] } | null } | null;
  customer_details?: { address?: Addr; tax_exempt?: string | null; tax_ids?: { type: string; value: string }[] | null } | null;
  customer_address?: Addr; customer_tax_ids?: { type: string; value: string }[] | null;
  total_taxes?: TaxAmount[] | null; total_tax_amounts?: TaxAmount[] | null; tax?: number | null;
};

export type ComplianceSignal = {
  kind: "tax_not_collecting" | "sanctioned_billing_country"; source: string; source_id: string; country: string | null; amount_minor: number | null;
  tax_minor: number | null; currency: string | null; product: string | null; workspace_id: string | null; livemode: boolean; occurred_at: string; detail: Record<string, unknown>;
};

const PRODUCTS: Record<string, string> = { subscription: "plan", ai_credits: "credit_pack", platform_boost: "promotion_boost" };

/**
 * Signals for a paid platform own-sale. `not_collecting`: Stripe says so explicitly (taxability_reason), or automatic tax ran and
 * charged 0 for a buyer without a tax ID in a zero-threshold country (Stripe's not_collecting outcome). Business buyers with a tax ID
 * are reverse-charged and raise nothing. A billing country under sanctions always raises a signal.
 */
export function platformSaleSignals(o: TaxObject, purpose: string | null | undefined): ComplianceSignal[] {
  const out: ComplianceSignal[] = [];
  const addr = o.customer_details?.address ?? o.customer_address ?? null;
  const country = addr?.country ? String(addr.country).toUpperCase() : null;
  const taxIds = o.customer_details?.tax_ids ?? o.customer_tax_ids ?? [];
  const amount = Number(o.amount_total ?? o.total ?? 0) || 0;
  const taxes = [...(o.total_details?.breakdown?.taxes ?? []), ...(o.total_taxes ?? []), ...(o.total_tax_amounts ?? [])].filter(Boolean) as NonNullable<TaxAmount>[];
  const tax = Number(o.total_details?.amount_tax ?? o.tax ?? taxes.reduce((a, t) => a + Number(t.amount ?? 0), 0)) || 0;
  const base = { source: o.object === "invoice" ? "stripe_invoice" : "stripe_checkout", source_id: o.id, country, amount_minor: amount, tax_minor: tax,
    currency: o.currency ? o.currency.toUpperCase() : null, product: PRODUCTS[purpose ?? ""] ?? purpose ?? null, workspace_id: o.metadata?.workspace_id ?? null,
    livemode: !!o.livemode, occurred_at: new Date((o.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString() };
  const explicit = taxes.some(t => t.taxability_reason === "not_collecting");
  const inferred = !!o.automatic_tax?.enabled && o.automatic_tax?.status === "complete" && tax === 0 && amount > 0 && !(taxIds?.length) && isZeroThreshold(country);
  if ((explicit || inferred) && !(taxIds?.length)) out.push({ ...base, kind: "tax_not_collecting", detail: { explicit, eu: EU_MEMBER_STATES.includes((country ?? "") as never), oss_deadline: ossDeadline(base.occurred_at) } });
  const hit = country ? sanctionedJurisdiction(country, addr?.state ?? null) : null;
  if (hit) out.push({ ...base, kind: "sanctioned_billing_country", source_id: `${o.id}:sanctions`, detail: { jurisdiction: hit.code } });
  return out;
}

/** Non-Union OSS backdating: the application must be made by the 10th day of the month after the first EU consumer sale. */
export function ossDeadline(firstSaleIso: string): string {
  const d = new Date(firstSaleIso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 10)).toISOString().slice(0, 10);
}

/** Connected-account (DEC-107 direct charge) sessions: only the sanctions signal applies (the seller is merchant of record). */
export function directChargeSanctionsSignal(o: TaxObject, account: string): ComplianceSignal | null {
  const addr = o.customer_details?.address ?? null;
  const hit = addr?.country ? sanctionedJurisdiction(addr.country, addr.state ?? null) : null;
  if (!hit) return null;
  return { kind: "sanctioned_billing_country", source: "stripe_connect_checkout", source_id: `${account}:${o.id}:sanctions`, country: hit.code.slice(0, 2),
    amount_minor: Number(o.amount_total ?? 0) || null, tax_minor: null, currency: o.currency ? o.currency.toUpperCase() : null, product: "marketplace",
    workspace_id: null, livemode: !!o.livemode, occurred_at: new Date((o.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(), detail: { account, jurisdiction: hit.code } };
}
