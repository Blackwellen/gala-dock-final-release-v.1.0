// Clears TEST-mode connected-account links the current sandbox key cannot see (accounts from the old sandbox → Stripe 403
// account_invalid / 404 resource_missing), and corrects payout_status='active' on workspaces that have no test account at all.
// Test column only (workspaces.stripe_account_id, connect_accounts.livemode=false): live links are never read or touched.
// Bounded: only the workspaces listed in the dry run; each change is conditional on the value read and audited
// (stripe.stale_account_cleared / stripe.payout_status_corrected). Seeded acct_test_* fixture ids are left alone (no Stripe object).
// Dry run unless --apply. Stripe GETs only. Prints workspace names/ids and account ids, never keys.
//   node --env-file=.env --env-file=.env.local scripts/stripe/clear-stale-test-links.mjs [--apply]
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const key = process.env.STRIPE_SECRET_KEY_SANDBOX ?? "";
if (!/^(sk|rk)_test_/.test(key)) { console.error("refusing: STRIPE_SECRET_KEY_SANDBOX is not a test-mode key"); process.exit(1); }
const get = async path => { const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const me = await get("account");
console.log(`sandbox ${me.body.id}`);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { headers: { "x-gala-stripe-mode": "test" } } });
const { data: platform } = await db.from("stripe_platform_mode").select("livemode").maybeSingle();
const platformTest = !platform?.livemode;

// 1. stale test links
const { data: linked, error } = await db.from("workspaces").select("id,name,stripe_account_id,payout_status,payout_status_test").not("stripe_account_id", "is", null).not("stripe_account_id", "like", "acct_test%");
if (error) { console.error(error.message); process.exit(1); }
const stale = [];
for (const w of linked) {
  const r = await get(`accounts/${encodeURIComponent(w.stripe_account_id)}`);
  const code = r.body?.error?.code;
  if ((r.status === 403 || r.status === 404) && (code === "account_invalid" || code === "resource_missing")) stale.push({ ...w, code });
  else console.log(`ok     ${w.name} ${w.stripe_account_id} (${r.status})`);
}
// 2. payout_status 'active' with no test account (no id and no test connect row)
const { data: active } = await db.from("workspaces").select("id,name,payout_status,payout_status_test,stripe_account_id").eq("payout_status_test", "active").is("stripe_account_id", null);
const ids = (active ?? []).map(w => w.id);
const { data: rows } = ids.length ? await db.from("connect_accounts").select("workspace_id").in("workspace_id", ids).eq("livemode", false) : { data: [] };
const withRow = new Set((rows ?? []).map(r => r.workspace_id));
// --fix-ids=<uuid,…> limits the payout_status corrections to named workspaces (others are listed, not changed).
const only = process.argv.find(a => a.startsWith("--fix-ids="))?.slice(10).split(",").filter(Boolean);
const allInconsistent = (active ?? []).filter(w => !withRow.has(w.id));
const inconsistent = only ? allInconsistent.filter(w => only.includes(w.id)) : allInconsistent;
for (const w of allInconsistent.filter(w => !inconsistent.includes(w))) console.log(`skip   ${w.name} (${w.id}) payout_status active without a test account (not in --fix-ids)`);

for (const w of stale) console.log(`stale  ${w.name} (${w.id}) ${w.stripe_account_id} → ${w.code}`);
for (const w of inconsistent) console.log(`fix    ${w.name} (${w.id}) payout_status active without a test account → incomplete`);
if (!apply) { console.log(`DRY RUN · ${stale.length} stale links · ${inconsistent.length} payout_status fixes · pass --apply`); process.exit(0); }

for (const w of stale) {
  const u = await db.from("workspaces").update({ stripe_account_id: null, payout_status_test: "not_connected", ...(platformTest ? { payout_status: "not_connected" } : {}) })
    .eq("id", w.id).eq("stripe_account_id", w.stripe_account_id).select("id");
  if (u.error || u.data?.length !== 1) throw new Error(`workspace ${w.id}: ${u.error?.message ?? "not updated"}`);
  const c = await db.from("connect_accounts").update({ charges_enabled: false, payouts_enabled: false, disabled_reason: "stale_account_link", updated_at: new Date().toISOString() })
    .eq("workspace_id", w.id).eq("stripe_account_id", w.stripe_account_id).eq("livemode", false);
  if (c.error) throw new Error(c.error.message);
  await db.from("audit_events").insert({ workspace_id: w.id, actor_type: "system", event: "stripe.stale_account_cleared", metadata: { account: w.stripe_account_id, mode: "test", source: "clear-stale-test-links", code: w.code } });
}
for (const w of inconsistent) {
  const u = await db.from("workspaces").update({ payout_status_test: "incomplete", ...(platformTest ? { payout_status: "incomplete" } : {}) })
    .eq("id", w.id).eq("payout_status_test", "active").is("stripe_account_id", null).select("id");
  if (u.error || u.data?.length !== 1) throw new Error(`workspace ${w.id}: ${u.error?.message ?? "not updated"}`);
  await db.from("audit_events").insert({ workspace_id: w.id, actor_type: "system", event: "stripe.payout_status_corrected", metadata: { from: "active", to: "incomplete", reason: "no_test_account", source: "clear-stale-test-links" } });
}
console.log(`APPLIED · ${stale.length} stale links cleared · ${inconsistent.length} payout_status corrected`);
