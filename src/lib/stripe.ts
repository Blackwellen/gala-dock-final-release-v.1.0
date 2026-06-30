// Gala Dock — Stripe (REST, no SDK). Server-only. Uses STRIPE_SECRET_KEY. Powers ticket checkout
// (V1.5 15-4). Webhook-driven fulfilment lands when STRIPE_WEBHOOK_SECRET is configured; until then
// fulfilment is confirmed on the success return by retrieving the session.

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export interface CheckoutParams {
  productName: string;
  unitAmountCents: number;
  currency: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(p: CheckoutParams): Promise<{ id: string; url: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", p.successUrl);
  body.set("cancel_url", p.cancelUrl);
  if (p.customerEmail) body.set("customer_email", p.customerEmail);
  body.set("line_items[0][quantity]", String(Math.max(1, p.quantity)));
  body.set("line_items[0][price_data][currency]", p.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(p.unitAmountCents));
  body.set("line_items[0][price_data][product_data][name]", p.productName);
  for (const [k, v] of Object.entries(p.metadata ?? {})) body.set(`metadata[${k}]`, v);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.url ? { id: json.id, url: json.url } : null;
}

export async function retrieveSession(
  id: string
): Promise<{ paymentStatus: string; metadata: Record<string, string>; amountTotal: number } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return {
    paymentStatus: json.payment_status ?? "unpaid",
    metadata: json.metadata ?? {},
    amountTotal: json.amount_total ?? 0,
  };
}
