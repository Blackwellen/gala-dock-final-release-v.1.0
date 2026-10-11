// Creates (or reuses) Stripe webhook endpoints for live + sandbox, platform + Connect, and stores
// their IDs/secrets in .env (never printed). Usage: node --env-file=.env scripts/stripe-webhooks.mjs
import fs from "node:fs";
const URL_ = "https://www.galadock.com/api/stripe/webhook";
const PLATFORM = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "transfer.created", "transfer.reversed"];
const CONNECT = ["account.updated", "account.application.deauthorized", "capability.updated", "payout.paid", "payout.failed"];
const modes = [["", process.env.STRIPE_SECRET_KEY], ["_SANDBOX", process.env.STRIPE_SECRET_KEY_SANDBOX]];
const env = {};
for (const [suffix, key] of modes) {
  const existing = (await (await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers: { Authorization: `Bearer ${key}` } })).json()).data ?? [];
  for (const [kind, events, connect] of [["", PLATFORM, false], ["_CONNECT", CONNECT, true]]) {
    const found = existing.find(e => e.url === URL_ && !!e.application === connect && e.metadata?.purpose === `gala-dock${kind.toLowerCase()}`);
    if (found) { console.log(`reuse ${suffix || "_LIVE"}${kind}: ${found.id} (secret only available at creation; keep existing env value)`); continue; }
    const body = new URLSearchParams({ url: URL_, description: `Gala Dock ${connect ? "Connect" : "platform"} events`, "metadata[purpose]": `gala-dock${kind.toLowerCase()}` });
    if (connect) body.set("connect", "true");
    events.forEach((e, i) => body.set(`enabled_events[${i}]`, e));
    const res = await (await fetch("https://api.stripe.com/v1/webhook_endpoints", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body })).json();
    if (res.error) { console.log(`FAIL ${suffix || "_LIVE"}${kind}: ${res.error.message}`); continue; }
    env[`STRIPE_WEBHOOK_SECRET${suffix}${kind}`] = res.secret;
    env[`STRIPE_WEBHOOK_ENDPOINT_ID${suffix}${kind}`] = res.id;
    console.log(`created ${suffix || "_LIVE"}${kind}: ${res.id} livemode=${res.livemode} events=${res.enabled_events.length}`);
  }
}
let text = fs.readFileSync(".env", "utf8");
for (const [k, v] of Object.entries(env)) {
  const line = `${k}=${v}`;
  text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
}
fs.writeFileSync(".env", text);
console.log(`stored ${Object.keys(env).length} values in .env:`, Object.keys(env).join(", "));
