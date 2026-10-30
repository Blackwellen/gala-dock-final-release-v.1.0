// Q38 full-depth demo seeding — pass 2 (lane C, 2026-10-29): the remainder after pass 1 (scripts/seed-depth-pass1.mjs).
// Same rules: demo identities only (reserved example.com domain), real commands/RPCs as those identities wherever they exist,
// idempotent (each module checks current state and writes only what is missing; a second run reports 0 created), runs recorded
// in public.sandbox_seed_runs (seed = 'depth-pass2'). Direct inserts only where a module says so (historical rows, provider-
// authored catalogue rows that the app itself writes as plain RLS inserts, placeholder file metadata).
// No real emails/SMS (reserved domains are suppressed by the outbox), no Stripe calls, no provider calls, no AI calls, no paid orders.
//
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-depth-pass2.mjs [--steps=a,b,…]
import { sql } from "./seed-depth/lib.mjs";
import * as plan from "./seed-depth/plan.mjs";
import * as trust from "./seed-depth/trust.mjs";
import * as providerops from "./seed-depth/providerops.mjs";
import * as hospitality from "./seed-depth/hospitality.mjs";
import * as promotion from "./seed-depth/promotion.mjs";
import * as composition from "./seed-depth/composition.mjs";
import * as risk from "./seed-depth/risk.mjs";
import { closeAll } from "./seed-depth/auth.mjs";

// Order matters: plan (Pro + API key) first — risk holds later never touch the demo owner.
const MODULES = { plan, trust, providerops, hospitality, promotion, composition, risk };
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const steps = (arg("steps") ?? Object.keys(MODULES).join(",")).split(",").map(s => s.trim()).filter(Boolean);
const bad = steps.filter(s => !MODULES[s]);
if (bad.length) { console.error(`Unknown step(s): ${bad.join(", ")}`); process.exit(2); }

const runId = (await sql(`insert into public.sandbox_seed_runs(seed, version, stripe_mode, status, steps, actor, started_at)
  values ('depth-pass2', '2026-10-29', 'none', 'running', array[${steps.map(s => `'${s}'`).join(",")}], 'scripts/seed-depth-pass2.mjs', now()) returning id`))[0].id;
const summary = {};
let failed = 0;
for (const s of steps) {
  try { summary[s] = await MODULES[s].run(); }
  catch (e) { failed++; summary[s] = { error: String(e.message ?? e).slice(0, 900) }; }
  console.log(`${s}: ${JSON.stringify(summary[s])}`);
}
await closeAll();
await sql(`update public.sandbox_seed_runs set status = '${failed ? "partial" : "completed"}', summary = '${JSON.stringify(summary).replace(/'/g, "''")}'::jsonb,
  finished_at = now(), updated_at = now() where id = '${runId}'`);
console.log(`DEPTH_SEED_SUMMARY ${JSON.stringify({ run: runId, summary })}`);
process.exitCode = failed ? 1 : 0;
