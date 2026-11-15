// R1: folds the signed-in matrix (artifacts/release/r1-signed-in-matrix.json), the click-through + Phase B results already in
// artifacts/release/r1-signed-in.json, the unresolved routes and the fixture ledger into one report, and prunes screenshots that
// no failing cell references any more. Usage: node scripts/qa/r1-report.mjs
import fs from "node:fs";

const OUT = "artifacts/release/r1", REPORT = "artifacts/release/r1-signed-in.json", MATRIX = "artifacts/release/r1-signed-in-matrix.json";
const rep = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, "utf8")) : {};
const m = JSON.parse(fs.readFileSync(MATRIX, "utf8"));
// dev-server-only noise that is not product behaviour: the proxied HMR socket dropping while the watchdog restarts the server
const noise = f => f.kind === "console-error" && /_next\/hmr|webpack-hmr/.test(f.detail);
const rows = m.results.map(r => ({ ...r, findings: (r.findings ?? []).filter(f => !noise(f)) }));
const cells = rows.filter(r => r.cat);
const byRoute = {};
for (const r of cells) { const b = byRoute[r.route] ??= { label: r.label, cells: 0, passed: 0, kinds: {} }; b.cells++; if (!r.findings.length) b.passed++; for (const f of r.findings) b.kinds[f.kind] = (b.kinds[f.kind] ?? 0) + 1; }
const byKind = {}; for (const r of rows) for (const f of r.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
const byLabel = {}; for (const [, b] of Object.entries(byRoute)) { const l = byLabel[b.label ?? "?"] ??= { routes: 0, cells: 0, passed: 0 }; l.routes++; l.cells += b.cells; l.passed += b.passed; }
const keep = new Set(rows.filter(r => r.findings.length && r.shot).map(r => r.shot.replace(/\\/g, "/")));
for (const c of rep.click ?? []) if (c.findings?.length && c.shot) keep.add(c.shot.replace(/\\/g, "/"));
let pruned = 0; for (const f of fs.readdirSync(OUT)) { if (!f.endsWith(".png")) continue; const p = `${OUT}/${f}`; if (!keep.has(p)) { fs.rmSync(p); pruned++; } }
const out = {
  ...rep,
  matrix: {
    at: m.summary.at, cellsPerRoute: m.summary.cellsPerRoute, routes: Object.keys(byRoute).length, cells: cells.length,
    passed: cells.filter(r => !r.findings.length).length, failed: cells.filter(r => r.findings.length).length, byKind, byWorkspace: byLabel,
    routesWithFindings: Object.fromEntries(Object.entries(byRoute).filter(([, b]) => b.passed < b.cells).map(([k, b]) => [k, { cells: b.cells, passed: b.passed, kinds: b.kinds }])),
    failingCells: rows.filter(r => r.findings.length).map(r => ({ route: r.route, cell: r.cell, findings: r.findings, shot: r.shot })),
  },
  unresolved: fs.existsSync(`${OUT}/unresolved.json`) ? JSON.parse(fs.readFileSync(`${OUT}/unresolved.json`, "utf8")) : [],
  fixtures: fs.existsSync(`${OUT}/fixtures.json`) ? JSON.parse(fs.readFileSync(`${OUT}/fixtures.json`, "utf8")) : null,
};
fs.writeFileSync(REPORT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ routes: out.matrix.routes, cells: out.matrix.cells, passed: out.matrix.passed, failed: out.matrix.failed, byKind, byWorkspace: byLabel, pruned }, null, 1));
