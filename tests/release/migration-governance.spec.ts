import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { lintMigration, withoutTxnControl } from "../../scripts/db/lint.mjs";

// Q39 release / supply chain / migration governance — tool-level checks (no browser, no data writes).
const node = (args: string[]) => {
  try { const o = execFileSync(process.execPath, ["--env-file=.env", "--env-file=.env.local", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280_000 }); return { code: 0, out: o, stdout: o }; }
  catch (e) { const x = e as { status: number; stdout?: string; stderr?: string }; return { code: x.status, out: `${x.stdout ?? ""}${x.stderr ?? ""}`, stdout: x.stdout ?? "" }; }
};

test.describe("Q39 migration governance and supply chain", () => {
  test.setTimeout(300_000);

  // 2026-10-29: a file's own COMMIT ended the dry run's transaction and made 202610294062 live before its exercise ran.
  test("dry run and apply strip a file's top-level transaction control, never function bodies", () => {
    const out = withoutTxnControl(`begin;
create table if not exists public.n (id int);
create function public.f() returns void language plpgsql as $fn$ begin perform 1; end; $fn$;
do $$ begin raise notice 'x'; end $$;
COMMIT TRANSACTION;
rollback;
`);
    expect(out).not.toMatch(/^\s*(begin|commit|rollback)\b[^;]*;/im);
    expect(out).toContain("$fn$ begin perform 1; end; $fn$");
    expect(out).toContain("do $$ begin raise notice 'x'; end $$");
  });

  test("additive-only lint: destructive statements are errors, re-created objects are allowed", () => {
    const bad = lintMigration(`drop table public.events;\nalter table public.t drop column x;\nalter table public.t rename to u;\ntruncate public.t;\nalter table public.t alter column a type bigint;\nalter table public.t alter column a set not null;\ndelete from public.t;\ndrop function public.f(uuid);`);
    expect(bad.errors.map(e => e.id).sort()).toEqual(["alter_type", "delete_unbounded", "drop_column", "drop_function", "drop_table", "rename", "set_not_null", "truncate"]);
    const ok = lintMigration(`create table if not exists public.n (id uuid primary key);
alter table public.n add column if not exists v int not null default 0;
alter table public.c drop constraint if exists c_check; alter table public.c add constraint c_check check (true);
drop policy if exists p on public.n; create policy p on public.n for select using (true);
drop trigger if exists tr on public.n; create trigger tr before insert on public.n for each row execute function public.f();
revoke insert, update, delete, truncate on table public.n from authenticated;
create or replace function public.g() returns void language plpgsql as $$ begin delete from public.n; drop table public.x; end $$;`);
    expect(ok.errors).toEqual([]);
    expect(ok.warnings.map(w => w.id)).not.toContain("drop_policy");
    expect(lintMigration("alter table public.t add column x int not null;").warnings.map(w => w.id)).toContain("add_not_null_no_default");
    expect(lintMigration("update public.events set name = 'x';").warnings.map(w => w.id)).toContain("bulk_update");
  });

  test("every lane C migration of this run is reviewed, unchanged and lint-clean", () => {
    const m = JSON.parse(fs.readFileSync("supabase/migration-manifest.json", "utf8")) as { reviewed: { file: string; sha256: string }[] };
    for (const f of ["202610293029_analytics_warehouse.sql", "202610293030_experiments.sql", "202610293031_push_devices.sql", "202610293032_lifecycle_service_override_required.sql"]) {
      const entry = m.reviewed.find(r => r.file === f);
      expect(entry, f).toBeTruthy();
      expect(lintMigration(fs.readFileSync(`supabase/migrations/${f}`, "utf8")).errors, f).toEqual([]);
    }
  });

  test("schema_migrations and state-machine/role-permission parity with the live database", () => {
    const r = node(["scripts/db/migrate.mjs", "parity"]);
    const j = JSON.parse(r.stdout) as { migrations: { unknown: string[]; pending: string[] }; stateMachines: { missingMachines: string[]; missingTransitions: string[]; differentMachines: unknown[]; rolePermissions: { seedSafeToApply: boolean; missingInDb: string[] } } };
    expect(j.migrations.unknown).toEqual([]);                          // nothing recorded that is not in the repo
    expect(j.stateMachines.missingMachines).toEqual([]);
    expect(j.stateMachines.missingTransitions).toEqual([]);
    expect(j.stateMachines.differentMachines).toEqual([]);
    expect(j.stateMachines.rolePermissions.missingInDb).toEqual([]);
    expect(j.stateMachines.rolePermissions.seedSafeToApply).toBe(true); // re-applying the generated seed would not drop a live grant
    // Files written after another lane's apply are reported, never silently re-run.
    expect(j.migrations.pending.filter(f => !/^20261029[1-4]0\d\d_/.test(f))).toEqual([]);
  });

  test("apply refuses unreviewed files and never re-applies a recorded one", () => {
    expect(node(["scripts/db/migrate.mjs", "apply", "202610110001_auth_onboarding.sql"]).out).toMatch(/not in supabase\/migration-manifest\.json/);
    expect(node(["scripts/db/migrate.mjs", "apply", "202610293031_push_devices.sql"]).out).toMatch(/already recorded; not re-applied/);
    expect(node(["scripts/db/migrate.mjs", "record-only", "202610293031_push_devices.sql"]).out).toMatch(/--i-verified/);
    expect(node(["scripts/db/migrate.mjs", "verify", "202610293031_push_devices.sql"]).out).toMatch(/statements match the local file/);
  });

  test("Q39 (d) trigger grants: no SECURITY INVOKER trigger calls a function authenticated cannot execute; the 4031 mistake is caught", () => {
    type Hit = { table: string; trigger_function: string; callee: string };
    const live = JSON.parse(node(["scripts/db/migrate.mjs", "trigger-grants"]).stdout) as { checked: { tables: number; trigger_functions: number }; hits: Hit[] };
    expect(live.hits).toEqual([]);
    expect(live.checked.tables).toBeGreaterThan(0);
    // Replay 4031 (EXECUTE on fixture_purge_active revoked from clients) in a rolled-back transaction: the check must flag the client tables.
    const sim = JSON.parse(node(["scripts/db/migrate.mjs", "trigger-grants", "--simulate-revoke=public.fixture_purge_active()"]).stdout) as { rolledBack: boolean; hits: Hit[] };
    expect(sim.rolledBack).toBe(true);
    expect(sim.hits.map(h => h.table)).toEqual(expect.arrayContaining(["build_items", "event_order_versions"]));
    expect(sim.hits.every(h => h.callee === "public.fixture_purge_active")).toBe(true);
    expect(JSON.parse(node(["scripts/db/migrate.mjs", "trigger-grants"]).stdout).hits).toEqual([]);   // nothing was left revoked
  });

  test("Q39 (b) drift: line endings alone are not drift (202610294007), and verify agrees", () => {
    const s = JSON.parse(node(["scripts/db/migrate.mjs", "status"]).stdout) as { driftedStatements: string[] };
    expect(s.driftedStatements).toEqual([]);
    expect(node(["scripts/db/migrate.mjs", "verify", "202610294007_event_dependencies.sql"]).out).toMatch(/statements match the local file/);
  });

  test("supply chain: lockfile integrity, licences and SBOM", () => {
    node(["scripts/release/supply-chain.mjs", "--no-audit"]);
    const r = JSON.parse(fs.readFileSync("artifacts/release/supply-chain.json", "utf8")) as { failures: string[]; sbom: { ok: boolean; components: number }; integrity: { missingIntegrity: string[]; nonRegistry: string[]; rootMatchesManifest: boolean } };
    expect(r.integrity.missingIntegrity).toEqual([]);
    expect(r.integrity.nonRegistry).toEqual([]);
    expect(r.integrity.rootMatchesManifest).toBe(true);
    expect(r.sbom.ok).toBe(true);
    expect(r.sbom.components).toBeGreaterThan(100);
    expect(r.failures).toEqual([]);                                     // --no-audit: audit findings are reported separately (C08)
    const sbom = JSON.parse(fs.readFileSync("artifacts/release/sbom.cdx.json", "utf8")) as { bomFormat: string; components: { purl: string }[] };
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.components.some(c => c.purl.startsWith("pkg:npm/next@"))).toBe(true);
  });
});
