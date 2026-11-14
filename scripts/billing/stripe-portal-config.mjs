// Q67: create (or show) the Stripe customer-portal configuration for Gala Dock plans on the SANDBOX account only.
// Usage: node --env-file=.env --env-file=.env.local scripts/billing/stripe-portal-config.mjs [--apply]
// Without --apply it only lists. Refuses anything but an sk_test_/rk_test_ key. Live is created by the owner (CLOSE_OUT_RUNBOOK).
// Never prints keys. Params come from src/lib/billing/core.ts (portalConfigurationParams), the same ones the app would use.
import { portalConfigurationParams, PORTAL_PURPOSE } from "../../src/lib/billing/core.ts";

const key = process.env.STRIPE_SECRET_KEY_SANDBOX ?? "";
if (!/^(sk|rk)_test_/.test(key)) { console.error("STRIPE_SECRET_KEY_SANDBOX is missing or not a test key — refusing."); process.exit(1); }
const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.galadock.com").replace(/\/$/, "");
const api = async (method, path, params) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(params ? { "Idempotency-Key": "gd-portal-config-plans-v1" } : {}) }, body: params ? new URLSearchParams(params) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j?.error?.code ?? j?.error?.message ?? "stripe_error"}`); return j;
};
const list = await api("GET", "billing_portal/configurations?active=true&limit=100");
const ours = (list.data ?? []).find(c => c.metadata?.gd_purpose === PORTAL_PURPOSE);
if (ours) { console.log(JSON.stringify({ mode: "test", existing: ours.id, livemode: ours.livemode }, null, 2)); process.exit(0); }
if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "test", existing: null, next: "re-run with --apply to create it" }, null, 2)); process.exit(0); }
const created = await api("POST", "billing_portal/configurations", portalConfigurationParams({ returnUrl: `${site}/organizer/settings?tab=billing`, privacyUrl: `${site}/privacy`, termsUrl: `${site}/terms` }));
console.log(JSON.stringify({ mode: "test", created: created.id, livemode: created.livemode, features: Object.keys(created.features ?? {}).filter(k => created.features[k]?.enabled) }, null, 2));
