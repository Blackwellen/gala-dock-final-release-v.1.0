// Q28 VAT readiness: reports whether Stripe Tax is ready in TEST MODE for platform own-sales (plans, AI credit packs, overage).
// Read-only (GET tax/settings, GET tax/registrations). BILLING_AUTOMATIC_TAX=on should only be set once this prints ready=true.
// Usage: node --env-file=.env --env-file=.env.local scripts/billing/stripe-tax-status.mjs
import { stripeTest } from "../lib/stripe-test-mode.mjs";

const settings = await stripeTest("GET", "tax/settings");
const regs = await stripeTest("GET", "tax/registrations", { limit: "100" });
const active = (regs.data ?? []).filter(r => r.status === "active").map(r => r.country);
const missing = settings.status_details?.pending?.missing_fields ?? [];
const ready = settings.status === "active" && active.includes("GB");
console.log(JSON.stringify({ mode: "test", ready, status: settings.status, missing_fields: missing, registrations_active: active,
  default_tax_behavior: settings.defaults?.tax_behavior ?? null, switch: process.env.BILLING_AUTOMATIC_TAX ?? "(unset → off)" }, null, 1));
if (!ready) console.log("Owner: Stripe Dashboard (test mode) → Settings → Tax: set head office address, add the GB VAT registration; then set BILLING_AUTOMATIC_TAX=on.");
