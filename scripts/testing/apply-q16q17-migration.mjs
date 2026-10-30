// Applies ONE reviewed Q16/Q17 (lane C: organizer CRM, proposals, contracts, team and live operations) migration to the shared Supabase project and records it in supabase_migrations.schema_migrations
// in the same implicit transaction, so history does not drift. Never logs credentials or database records.
// Usage: node --env-file=.env --env-file=.env.local scripts/testing/apply-q16q17-migration.mjs <file-name> --dry-run | --apply
import fs from "node:fs/promises";

const REVIEWED = [
  "202610293008_sales_clients_pipeline.sql",
  "202610293009_proposals_contracts.sql",
  "202610293010_accept_proposal_fix.sql",
  "202610293011_team_crew_operations.sql",
  "202610293012_live_operations_risk.sql",
  "202610293013_operational_conflicts_unify.sql",
  "202610293014_crew_login_invite.sql",
];
const file = process.argv[2];
if (!REVIEWED.includes(file)) throw new Error(`Not a reviewed Q16/Q17 migration: ${file ?? "(none)"}`);
const dryRun = process.argv.includes("--dry-run");
if (!dryRun && !process.argv.includes("--apply")) throw new Error("Use --dry-run (rolled-back transaction) or --apply");
if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error("Missing database management configuration");

const [, version, name] = /^(\d{12})_(.+)\.sql$/.exec(file);
const sql = await fs.readFile(`supabase/migrations/${file}`, "utf8");
const tag = "$lane_c_migration$";
if (sql.includes(tag)) throw new Error("Migration text collides with the history quote tag");

const run = async query => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Database query failed: HTTP ${response.status} ${text.replace(/\s+/g, " ").slice(0, 400)}`);
  return JSON.parse(text);
};

const recorded = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (recorded[0]?.n) { console.log(`${file} is already recorded in schema_migrations; not re-applying.`); process.exit(0); }

if (dryRun) {
  // Runs the migration inside an explicit transaction that is always rolled back: proves it applies cleanly, changes nothing.
  await run(`begin;
${sql}
;
rollback;`);
  console.log(`Dry run OK (rolled back): ${file}`);
  process.exit(0);
}

// One request = one implicit transaction: the migration and its history row commit together or not at all.
await run(`${sql}\n;\ninsert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${tag}${sql}${tag}]);`);
const check = await run(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`);
if (!check[0]?.n) throw new Error("Migration ran but its history row is missing");
console.log(`Applied and recorded ${file}`);
