// Q38 full-depth demo seeding — pass 1 (lane C, 2026-10-29). Every built domain the queue's Q38 seed-gap notes list, on the
// existing demo identities (reserved example.com domain). Repeatable and idempotent: each module checks current state and only
// writes what is missing; a second run reports 0 created. Runs are recorded in public.sandbox_seed_runs (seed = 'depth-pass1').
//
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-depth-pass1.mjs [--steps=a,b,…]
// Real commands/RPCs are used wherever they exist (run as the demo identity: compliance, partners, logistics, virtual, guests,
// access, ticketing codes, maps, briefs, dependencies, templates, contracts, transitions). Direct inserts are used only for
// historical data (past check-ins, past registrations' timestamps) and where noted in each module.
// No real emails/SMS (reserved domains are suppressed by the outbox), no Stripe calls, no provider calls.
import { sql } from "./seed-depth/lib.mjs";
import * as identities from "./seed-depth/identities.mjs";
import * as events from "./seed-depth/events.mjs";
import * as compliance from "./seed-depth/compliance.mjs";
import * as partners from "./seed-depth/partners.mjs";
import * as logistics from "./seed-depth/logistics.mjs";
import * as virtual from "./seed-depth/virtual.mjs";
import * as developer from "./seed-depth/developer.mjs";
import * as guests from "./seed-depth/guests.mjs";
import * as ticketing from "./seed-depth/ticketing.mjs";
import * as maps from "./seed-depth/maps.mjs";
import * as core from "./seed-depth/core.mjs";
import * as portals from "./seed-depth/portals.mjs";
import * as publish from "./seed-depth/publish.mjs";

// Order matters: identities → events → domain modules → publish (real lifecycle command) → guests (registration needs a live event).
const MODULES = { identities, events, compliance, partners, logistics, virtual, developer, ticketing, publish, guests, maps, core, portals };
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const steps = (arg("steps") ?? Object.keys(MODULES).join(",")).split(",").map(s => s.trim()).filter(Boolean);
const bad = steps.filter(s => !MODULES[s]);
if (bad.length) { console.error(`Unknown step(s): ${bad.join(", ")}`); process.exit(2); }

const runId = (await sql(`insert into public.sandbox_seed_runs(seed, version, stripe_mode, status, steps, actor, started_at)
  values ('depth-pass1', '2026-10-29', 'none', 'running', array[${steps.map(s => `'${s}'`).join(",")}], 'scripts/seed-depth-pass1.mjs', now()) returning id`))[0].id;
const summary = {};
let failed = 0;
for (const s of steps) {
  try { summary[s] = await MODULES[s].run(); }
  catch (e) { failed++; summary[s] = { error: String(e.message ?? e).slice(0, 900) }; }
  console.log(`${s}: ${JSON.stringify(summary[s])}`);
}
await sql(`update public.sandbox_seed_runs set status = '${failed ? "partial" : "completed"}', summary = '${JSON.stringify(summary).replace(/'/g, "''")}'::jsonb,
  finished_at = now(), updated_at = now() where id = '${runId}'`);
console.log(`DEPTH_SEED_SUMMARY ${JSON.stringify({ run: runId, summary })}`);
process.exitCode = failed ? 1 : 0;
