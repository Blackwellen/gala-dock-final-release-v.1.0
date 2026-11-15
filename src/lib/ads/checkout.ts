// Pure (no I/O): Stripe Checkout params for a promotion boost. Unit-tested in tests/release/q56-ads-bughunt.spec.ts.
/**
 * Q56: Checkout for a promotion boost (Gala Dock is the merchant). The order total already includes VAT (trg_payment_order_vat: price plus
 * 20%, platform_fee_vat_minor); it was charged as one "£58.80" line with no VAT shown and no invoice. Now the net price and the VAT are
 * separate lines and Stripe issues an invoice carrying Gala Dock's VAT number — a VAT receipt for the advertiser. The total is unchanged
 * (payment_order_succeeded checks it). Guest customer (customer_email): the invoice is never mistaken for a plan invoice.
 */
export function boostCheckoutParams(o: { po: { reference: string; amount_minor: number; currency: string; description: string; platform_fee_vat_minor?: number | null }; email: string;
  successUrl: string; cancelUrl: string; nowSec: number; accountTaxIds?: readonly string[] }): Record<string, string> {
  const cur = o.po.currency.toLowerCase(), vat = Math.max(0, Math.min(Number(o.po.platform_fee_vat_minor ?? 0), o.po.amount_minor)), net = o.po.amount_minor - vat;
  const rate = net > 0 ? Math.round((vat * 100) / net) : 0;
  const lines: Record<string, string> = {
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": cur, "line_items[0][price_data][unit_amount]": String(net),
    "line_items[0][price_data][product_data][name]": o.po.description.slice(0, 200),
    ...(vat > 0 ? { "line_items[1][quantity]": "1", "line_items[1][price_data][currency]": cur, "line_items[1][price_data][unit_amount]": String(vat),
      "line_items[1][price_data][product_data][name]": `VAT at ${rate}%` } : {}),
  };
  const taxIds = Object.fromEntries((o.accountTaxIds ?? []).filter(id => /^txi_[A-Za-z0-9]+$/.test(id)).slice(0, 5).map((id, i) => [`invoice_creation[invoice_data][account_tax_ids][${i}]`, id]));
  return {
    mode: "payment", customer_email: o.email, client_reference_id: o.po.reference, success_url: o.successUrl, cancel_url: o.cancelUrl,
    expires_at: String(o.nowSec + 3600), ...lines,
    "invoice_creation[enabled]": "true", "invoice_creation[invoice_data][description]": `Gala Dock promotion · ${o.po.reference}`.slice(0, 300),
    "invoice_creation[invoice_data][metadata][payment_order]": o.po.reference, ...taxIds,
    // Q74 (D2): Gala Dock is the merchant — business buyers can add their VAT / tax ID (printed on the invoice). Stripe needs a Customer
    // to keep it, so one is created for the guest session (never linked to billing_customers, so never mistaken for a plan invoice).
    "tax_id_collection[enabled]": "true", customer_creation: "always",
    "metadata[payment_order]": o.po.reference, "metadata[purpose]": "platform_boost", "payment_intent_data[metadata][payment_order]": o.po.reference,
    "payment_intent_data[description]": `${o.po.reference} · ${o.po.description}`.slice(0, 300),
  };
}
