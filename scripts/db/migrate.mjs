// Q39 unified, reviewed migration tool for the shared (live) Supabase project — replaces the per-lane
// scripts/testing/apply-*-migration.mjs copies. Never logs credentials or row data.
//
// Usage: node --env-file=.env --env-file=.env.local scripts/db/migrate.mjs <command> [args]
//   status                          local files vs supabase_migrations.schema_migrations (pending, unknown, drifted)
//   parity                          status + state-machine parity (src/lib/domain/state-machines.ts vs state_machines/state_transitions)
//   lint [file…] | --pending        additive-only lint (errors block apply unless waived in the manifest)
//   review <file> --lane=X --reviewer=NAME [--exercise=PATH] [--waive=rule,rule] [--rollback="note"]
//                                   records the reviewed file + sha256 in supabase/migration-manifest.json
//   dry-run <file> [--exercise=PATH]  migration (+ exercise) in a transaction that is always rolled back; the exercise must
//                                   end by raising 'EXERCISE_OK …' (the deliberate error is the rollback guarantee)
//   apply <file>                    reviewed + unchanged + lint-clean (or waived) + dry run/exercise passes → apply and record in ONE transaction
//   next                            resume: apply pending reviewed files in version order, stop at the first failure
//   verify <file>                   recorded history row exists and its statements equal the local file
//   trigger-grants                  4031 class: functions called from SECURITY INVOKER triggers that `authenticated` cannot execute (also in parity)
//   record-only <file> --i-verified record history WITHOUT running SQL (only for files proven applied out-of-band; audited in the manifest)
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { lintMigration, withoutTxnControl } from "./lint.mjs";
import { triggerGrantSql, triggerGrantCoverageSql } from "./trigger-grants.mjs";

const DIR = "supabase/migrations", MANIFEST = "supabase/migration-manifest.json", TAG = "$gd_migration$";
const [cmd, ...rest] = process.argv.slice(2);
const flag = n => rest.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = n => rest.includes(`--${n}`);
const files = rest.filter(a => !a.startsWith("--"));
const sha = s => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
const parse = f => { const m = /^(\d{12})_(.+)\.sql$/.exec(f); if (!m) throw new Error(`Not a migration file name: ${f}`); return { version: m[1], name: m[2] }; };
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };

async function run(query) {
  const { SUPABASE_PROJECT_REF: ref, SUPABASE_PAT_KEY: pat } = process.env;
  if (!ref || !pat) die("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(300_000) });
  const text = await res.text();
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.body = text; throw e; }
  return JSON.parse(text);
}
const readManifest = async () => { try { return JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch { return { reviewed: [], recordedOnly: [] }; } };
const writeManifest = m => fs.writeFile(MANIFEST, JSON.stringify(m, null, 2) + "\n");
const localFiles = async () => (await fs.readdir(DIR)).filter(f => /^\d{12}_.+\.sql$/.test(f)).sort();
const readSql = async f => (await fs.readFile(`${DIR}/${f}`, "utf8")).replace(/^﻿/, "");
const recorded = async () => new Map((await run("select version, name, md5(array_to_string(coalesce(statements, '{}'), E'\\n')) h, coalesce(array_length(statements, 1), 0) n from supabase_migrations.schema_migrations"))
  .map(r => [r.version, r]));

async function status(print = true) {
  const [list, rec] = await Promise.all([localFiles(), recorded()]);
  const local = new Map(list.map(f => [parse(f).version, f]));
  const pending = list.filter(f => !rec.has(parse(f).version));
  const unknown = [...rec.keys()].filter(v => !local.has(v)).sort();
  const drifted = [];
  for (const f of list) {
    const r = rec.get(parse(f).version);
    if (!r || r.n !== 1) continue;   // only single-blob histories written by the reviewed tools are comparable
    // Q39 (b): compare the text as recorded AND line-ending-normalised. Git autocrlf checks files out with CRLF, so a file applied
    // from an LF copy (e.g. 202610294007) was reported as "edited after apply" although every statement is identical (verify agrees).
    const text = await readSql(f), md5 = t => createHash("md5").update(t).digest("hex");
    if (r.h !== md5(text) && r.h !== md5(text.replace(/\r\n/g, "\n"))) drifted.push(f);
  }
  const lastApplied = [...rec.keys()].filter(v => local.has(v) && !v.startsWith("2099")).sort().at(-1);   // 2099… seeds sort last by design
  const outOfOrder = pending.filter(f => lastApplied && parse(f).version < lastApplied && !parse(f).version.startsWith("2099"));
  const out = { local: list.length, recorded: rec.size, pending, outOfOrder, unknown, driftedStatements: drifted };
  if (print) console.log(JSON.stringify(out, null, 2));
  return out;
}

// Q39 (d): the 4031 class — callees of SECURITY INVOKER triggers on client-writable tables that `authenticated` cannot execute.
async function triggerGrants() {
  const [hits, cov] = await Promise.all([run(triggerGrantSql()), run(triggerGrantCoverageSql())]);
  return { checked: cov[0] ?? {}, hits };
}

async function stateParity() {
  const { machines } = await import(new URL("../../src/lib/domain/state-machines.ts", import.meta.url).href);
  const [m, t] = await Promise.all([run("select machine, table_name, column_name, mode from public.state_machines"), run("select machine, from_state, to_state from public.state_transitions")]);
  const dbM = new Map(m.map(r => [r.machine, r])), dbT = new Set(t.map(r => `${r.machine}|${r.from_state}|${r.to_state}`));
  const missingMachines = [], differentMachines = [], missingTransitions = [], extraTransitions = [];
  const want = new Set();
  for (const [name, def] of Object.entries(machines)) {
    const row = dbM.get(name);
    if (!row) missingMachines.push(name);
    else if (row.table_name !== def.table || row.column_name !== def.column || row.mode !== def.mode) differentMachines.push({ name, db: row, ts: { table: def.table, column: def.column, mode: def.mode } });
    for (const [from, tos] of Object.entries(def.transitions)) for (const to of tos) { const k = `${name}|${from}|${to}`; want.add(k); if (!dbT.has(k)) missingTransitions.push(k); }
  }
  for (const k of dbT) if (!want.has(k) && Object.hasOwn(machines, k.split("|")[0])) extraTransitions.push(k);
  const extraMachines = [...dbM.keys()].filter(n => !Object.hasOwn(machines, n));
  // Role permissions: the generated seed DELETES and re-inserts role_permissions, so a DB-only grant would be lost on re-apply.
  const { rolePermissions } = await import(new URL("../../src/lib/domain/permissions.ts", import.meta.url).href);
  const tsP = new Set(Object.entries(rolePermissions).flatMap(([k, roles]) => Object.entries(roles).flatMap(([r, list]) => list.map(p => `${k}|${r}|${p}`))));
  const dbP = new Set((await run("select workspace_kind || '|' || role || '|' || permission k from public.role_permissions")).map(r => r.k));
  return { tsMachines: Object.keys(machines).length, dbMachines: dbM.size, missingMachines, extraMachines, differentMachines, missingTransitions, extraTransitions,
    rolePermissions: { ts: tsP.size, db: dbP.size, missingInDb: [...tsP].filter(k => !dbP.has(k)), dbOnly: [...dbP].filter(k => !tsP.has(k)),
      seedSafeToApply: [...dbP].every(k => tsP.has(k)) } };
}

async function dryRun(f, exercisePath) {
  const sql = withoutTxnControl(await readSql(f));
  if (sql.includes(TAG)) throw new Error("Migration text collides with the history quote tag");
  if (!exercisePath) { await run(`begin;\n${sql}\n;\nrollback;`); return "Dry run OK (rolled back)"; }
  const exercise = await fs.readFile(exercisePath, "utf8");
  try { await run(`begin;\n${sql}\n;\n${exercise}\n;\nrollback;`); }
  catch (e) {
    const body = String(e.body ?? e.message), m = /EXERCISE_OK[^"]*/.exec(body.replace(/\\"/g, "'"));
    if (m) return `Dry run + exercise OK (rolled back)\n${m[0].slice(0, 20000)}`;
    throw new Error(`Dry run/exercise FAILED: ${body.replace(/\s+/g, " ").slice(0, 3000)}`);
  }
  throw new Error("Exercise must end by raising EXERCISE_OK (guarantees rollback)");
}

async function apply(f, manifest) {
  const { version, name } = parse(f);
  const entry = manifest.reviewed.find(r => r.file === f);
  if (!entry) throw new Error(`${f} is not in ${MANIFEST} (run: review ${f} --lane=… --reviewer=…)`);
  const sql = await readSql(f);
  if (entry.sha256 !== sha(sql)) throw new Error(`${f} changed after review (sha mismatch) — re-review it`);
  const lint = lintMigration(sql), blocking = lint.errors.filter(e => !(entry.waivers ?? []).includes(e.id));
  if (blocking.length) throw new Error(`${f}: additive lint errors ${blocking.map(e => `${e.id}@${e.line}`).join(", ")}`);
  const rec = await run(`select count(*)::int n from supabase_migrations.schema_migrations where version = '${version}'`);
  if (rec[0]?.n) return `${f} already recorded; not re-applied`;
  const exercise = entry.exercise ? await fs.access(entry.exercise).then(() => entry.exercise, () => null) : null;
  if (entry.exercise && !exercise) throw new Error(`${f}: reviewed exercise ${entry.exercise} is not available locally — dry-run it explicitly first`);
  console.log(await dryRun(f, exercise));
  // One request = one implicit transaction: the migration and its history row commit together or not at all.
  await run(`${withoutTxnControl(sql)}\n;\ninsert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${TAG}${sql}${TAG}]);`);
  const check = await run(`select count(*)::int n from supabase_migrations.schema_migrations where version = '${version}'`);
  if (!check[0]?.n) throw new Error("Migration ran but its history row is missing");
  return `Applied and recorded ${f}`;
}

try {
  switch (cmd) {
    case "status": await status(); break;
    case "parity": { const s = await status(false); const p = await stateParity(); const tg = await triggerGrants();
      console.log(JSON.stringify({ migrations: s, stateMachines: p, triggerGrants: tg }, null, 2));
      if (s.unknown.length || s.driftedStatements.length || p.missingMachines.length || p.missingTransitions.length || p.differentMachines.length || !p.rolePermissions.seedSafeToApply || tg.hits.length) process.exitCode = 2; break; }
    case "trigger-grants": {
      // --simulate-revoke=public.fn(args): replay the 4031 mistake inside a transaction that is always rolled back, and report the hits.
      const sim = flag("simulate-revoke");
      if (sim) {
        if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_, ]*\)$/.test(sim)) die("--simulate-revoke expects schema.function(argtypes)");
        try { await run(`begin;\nrevoke execute on function ${sim} from public, authenticated;\ndo $sim$ begin raise exception 'SIM_HITS %', (select coalesce(json_agg(h), '[]') from (${triggerGrantSql()}) h); end $sim$;\nrollback;`); }
        catch (e) {
          const msg = (() => { try { return JSON.parse(e.body).message; } catch { return String(e.body ?? e.message); } })();
          const m = /SIM_HITS (\[[\s\S]*\])/.exec(msg);
          if (!m) die(`simulation failed: ${msg.slice(0, 2000)}`);
          const hits = JSON.parse(m[1]); console.log(JSON.stringify({ simulated: sim, rolledBack: true, hits }, null, 2)); break;
        }
        die("simulation did not report");
      }
      const tg = await triggerGrants(); console.log(JSON.stringify(tg, null, 2)); if (tg.hits.length) process.exitCode = 2; break;
    }
    case "lint": {
      const targets = has("pending") ? (await status(false)).pending : files;
      let errors = 0;
      for (const f of targets) {
        const r = lintMigration(await readSql(f)); errors += r.errors.length;
        console.log(`${r.errors.length ? "FAIL" : "ok  "} ${f}${r.errors.length ? "  errors: " + r.errors.map(e => `${e.id}@${e.line}`).join(", ") : ""}${r.warnings.length ? "  warnings: " + r.warnings.map(w => w.id).join(", ") : ""}`);
      }
      if (errors) process.exitCode = 1; break;
    }
    case "review": {
      const f = files[0]; parse(f);
      const lane = flag("lane"), reviewer = flag("reviewer");
      if (!lane || !reviewer) die("review needs --lane= and --reviewer=");
      const sql = await readSql(f), lint = lintMigration(sql), waivers = (flag("waive") ?? "").split(",").filter(Boolean);
      const m = await readManifest();
      m.reviewed = m.reviewed.filter(r => r.file !== f);
      m.reviewed.push({ file: f, sha256: sha(sql), lane, reviewer, reviewedAt: new Date().toISOString(), exercise: flag("exercise") ?? null, waivers,
        rollback: flag("rollback") ?? null, lint: { errors: lint.errors.map(e => e.id), warnings: lint.warnings.map(w => w.id) } });
      m.reviewed.sort((a, b) => a.file.localeCompare(b.file));
      await writeManifest(m); console.log(`Reviewed ${f} (${lint.errors.length} lint errors, ${lint.warnings.length} warnings${waivers.length ? `, waived: ${waivers}` : ""})`); break;
    }
    case "dry-run": console.log(await dryRun(files[0], flag("exercise"))); break;
    case "apply": console.log(await apply(files[0], await readManifest())); break;
    case "next": {
      const m = await readManifest(), pend = (await status(false)).pending.filter(f => m.reviewed.some(r => r.file === f));
      if (!pend.length) { console.log("Nothing reviewed is pending."); break; }
      for (const f of pend) console.log(await apply(f, m));   // throws (and stops) at the first failure
      break;
    }
    case "verify": {
      const f = files[0], { version } = parse(f), sql = await readSql(f);
      const r = await run(`select array_to_string(coalesce(statements, '{}'), E'\\n') s from supabase_migrations.schema_migrations where version = '${version}'`);
      if (!r.length) die(`${f}: not recorded`, 2);
      const same = sha(r[0].s ?? "") === sha(sql);
      console.log(`${f}: recorded${same ? ", statements match the local file" : r[0].s ? ", STATEMENTS DIFFER from the local file" : " (no statements stored)"}`);
      if (!same) process.exitCode = 2; break;
    }
    case "record-only": {
      const f = files[0], { version, name } = parse(f);
      if (!has("i-verified")) die("record-only needs --i-verified (only for migrations proven applied out-of-band)");
      const sql = await readSql(f);
      const rec = await run(`select count(*)::int n from supabase_migrations.schema_migrations where version = '${version}'`);
      if (rec[0]?.n) { console.log(`${f} already recorded`); break; }
      await run(`insert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${TAG}${sql}${TAG}])`);
      const m = await readManifest(); (m.recordedOnly ??= []).push({ file: f, sha256: sha(sql), recordedAt: new Date().toISOString(), note: flag("note") ?? "applied out-of-band; verified before recording" });
      await writeManifest(m); console.log(`Recorded ${f} without executing it`); break;
    }
    default: die("Commands: status | parity | trigger-grants | lint | review | dry-run | apply | next | verify | record-only");
  }
} catch (e) { die(e.message); }
