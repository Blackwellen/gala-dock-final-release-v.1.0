// Q38 full-depth demo seeding — pass 3 (lane D · SEED, 2026-10-29): organiser-workspace depth for Alex Events (leave, a linked crew
// login, registrations, risk flags, virtual replay, lost property, sustainability, venues/days, event forms, dependencies, Comedy
// Central partners + logistics, a disposable party-portal login, an emergency request and a booking dispute). See
// scripts/seed-depth/organiser.mjs for the command used per item. Same rules as passes 1–2: demo identities only, real
// commands/RPCs as those identities, idempotent (a second run reports 0 created), runs recorded in public.sandbox_seed_runs
// (seed = 'depth-pass3'). No real emails/SMS, no Stripe calls, no paid orders, no AI calls.
//
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-depth-pass3.mjs [--steps=organiser]
import { sql } from "./seed-depth/lib.mjs";
import * as organiser from "./seed-depth/organiser.mjs";
import { closeAll } from "./seed-depth/auth.mjs";

const MODULES = { organiser };
const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const steps = (arg("steps") ?? Object.keys(MODULES).join(",")).split(",").map(s => s.trim()).filter(Boolean);
const bad = steps.filter(s => !MODULES[s]);
if (bad.length) { console.error(`Unknown step(s): ${bad.join(", ")}`); process.exit(2); }

const runId = (await sql(`insert into public.sandbox_seed_runs(seed, version, stripe_mode, status, steps, actor, started_at)
  values ('depth-pass3', '2026-10-29', 'none', 'running', array[${steps.map(s => `'${s}'`).join(",")}], 'scripts/seed-depth-pass3.mjs', now()) returning id`))[0].id;
const summary = {};
let failed = 0;
for (const s of steps) {
  try { summary[s] = await MODULES[s].run(); if (summary[s].error) failed++; }
  catch (e) { failed++; summary[s] = { error: String(e.message ?? e).slice(0, 900) }; }
  console.log(`${s}: ${JSON.stringify(summary[s])}`);
}
await closeAll();
await sql(`update public.sandbox_seed_runs set status = '${failed ? "partial" : "completed"}', summary = '${JSON.stringify(summary).replace(/'/g, "''")}'::jsonb,
  finished_at = now(), updated_at = now() where id = '${runId}'`);
console.log(`DEPTH_SEED_SUMMARY ${JSON.stringify({ run: runId, summary })}`);
process.exitCode = failed ? 1 : 0;
