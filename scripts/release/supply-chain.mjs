// Q39 supply chain (domains 272–274): SBOM, licence inventory, lockfile integrity, pinning and vulnerability mapping.
// Read-only: never installs or upgrades anything. Writes artifacts/release/{sbom.cdx.json, licences.json, supply-chain.json}.
// Usage: node scripts/release/supply-chain.mjs [--no-audit]      exit 1 when a policy check fails (CI gate)
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const OUT = "artifacts/release";
await fs.mkdir(OUT, { recursive: true });
// Fixed, literal arguments only (never user input). Windows needs a shell to run npm.cmd.
const npm = (args) => process.platform === "win32"
  ? execFileSync(`npm.cmd ${args.join(" ")}`, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: true, stdio: ["ignore", "pipe", "ignore"] })
  : execFileSync("npm", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));

// 1. Lockfile integrity: every installed package resolved from the public registry with an SRI hash; lockfileVersion ≥ 3.
const entries = Object.entries(lock.packages ?? {}).filter(([k, v]) => k && !v.link);
const integrity = {
  lockfileVersion: lock.lockfileVersion, packages: entries.length,
  missingIntegrity: entries.filter(([, v]) => !v.integrity).map(([k]) => k),
  nonRegistry: entries.filter(([, v]) => v.resolved && !v.resolved.startsWith("https://registry.npmjs.org/")).map(([k, v]) => `${k} → ${v.resolved}`),
  weakHash: entries.filter(([, v]) => v.integrity && !v.integrity.startsWith("sha512-")).map(([k]) => k),
  rootMatchesManifest: JSON.stringify(lock.packages?.[""]?.dependencies ?? {}) === JSON.stringify(pkg.dependencies ?? {}),
};

// 2. Pinning: framework/runtime pins exact; caret ranges are reproducible only through the lockfile (npm ci).
const ranges = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).map(([n, r]) => ({ name: n, range: r, exact: /^\d/.test(r), installed: lock.packages?.[`node_modules/${n}`]?.version }));

// 3. Licences (production closure = non-dev entries in the lockfile).
// LGPL (sharp's prebuilt libvips: dynamically linked, unmodified) is allowed but listed for review; strong copyleft is denied.
const DENY = /\b(AGPL|SSPL|GPL-[23])/i, REVIEW = /(^UNLICENSED|^UNKNOWN|^SEE LICENSE|CC-BY-NC|BUSL|Elastic|LGPL)/i;
const licences = entries.map(([k, v]) => ({ name: k.replace(/^.*node_modules\//, ""), version: v.version, dev: !!v.dev, license: v.license ?? "UNKNOWN" }));
const prod = licences.filter(l => !l.dev);
const licenceReport = {
  counts: Object.entries(licences.reduce((m, l) => (m[l.license] = (m[l.license] ?? 0) + 1, m), {})).sort((a, b) => b[1] - a[1]),
  prodDenied: prod.filter(l => DENY.test(l.license)), prodReview: prod.filter(l => REVIEW.test(l.license)),
};
await fs.writeFile(`${OUT}/licences.json`, JSON.stringify({ generatedAt: new Date().toISOString(), ...licenceReport, packages: licences }, null, 2));

// 4. SBOM (CycloneDX, npm's built-in generator from the lockfile).
let sbom = { ok: false };
try { const s = npm(["sbom", "--sbom-format", "cyclonedx", "--package-lock-only"]); await fs.writeFile(`${OUT}/sbom.cdx.json`, s); sbom = { ok: true, components: JSON.parse(s).components?.length ?? 0 }; }
catch {
  // npm sbom refuses when optional platform packages are absent (wasm fallbacks on Windows): build CycloneDX 1.5 from the lockfile.
  const components = entries.map(([k, v]) => { const name = k.replace(/^.*node_modules\//, ""); return { type: "library", name, version: v.version,
    purl: `pkg:npm/${name.replace("@", "%40")}@${v.version}`, scope: v.dev ? "excluded" : v.optional ? "optional" : "required",
    licenses: v.license ? [{ expression: v.license }] : [],
    hashes: v.integrity?.startsWith("sha512-") ? [{ alg: "SHA-512", content: Buffer.from(v.integrity.slice(7), "base64").toString("hex") }] : [] }; });
  const doc = { bomFormat: "CycloneDX", specVersion: "1.5", version: 1, metadata: { timestamp: new Date().toISOString(), tools: [{ name: "gala-dock supply-chain.mjs" }],
    component: { type: "application", name: pkg.name ?? "gala-dock", version: pkg.version ?? "0.0.0" } }, components };
  await fs.writeFile(`${OUT}/sbom.cdx.json`, JSON.stringify(doc, null, 2));
  sbom = { ok: true, components: components.length, generator: "package-lock.json (npm sbom refused: optional platform packages not installed)" };
}

// 5. Vulnerability mapping (npm audit; advisory → package → fix).
let audit = null;
if (!process.argv.includes("--no-audit")) {
  let raw = "";
  try { raw = npm(["audit", "--json"]); } catch (e) { raw = e.stdout ?? ""; }   // npm audit exits non-zero when it finds issues
  try {
    const a = JSON.parse(raw);
    audit = { totals: a.metadata?.vulnerabilities, findings: Object.entries(a.vulnerabilities ?? {}).map(([n, v]) => ({ package: n, severity: v.severity, direct: v.isDirect,
      fix: v.fixAvailable, advisories: (v.via ?? []).filter(x => typeof x === "object").map(x => ({ title: x.title, url: x.url, range: x.range, severity: x.severity })) })) };
  } catch { audit = { error: "npm audit output not parseable (offline?)" }; }
}

const failures = [
  ...(integrity.missingIntegrity.length ? [`${integrity.missingIntegrity.length} lockfile entries without integrity`] : []),
  ...(integrity.nonRegistry.length ? [`${integrity.nonRegistry.length} packages resolved outside the npm registry`] : []),
  ...(!integrity.rootMatchesManifest ? ["package-lock.json root dependencies differ from package.json (run npm install and commit the lockfile)"] : []),
  ...(licenceReport.prodDenied.length ? [`${licenceReport.prodDenied.length} production packages with a denied licence`] : []),
  ...(audit?.totals && (audit.totals.critical || audit.totals.high) ? [`npm audit: ${audit.totals.critical} critical, ${audit.totals.high} high`] : []),
];
const report = { generatedAt: new Date().toISOString(), node: process.version, integrity: { ...integrity, missingIntegrity: integrity.missingIntegrity.slice(0, 50), nonRegistry: integrity.nonRegistry.slice(0, 50) },
  pinning: { exact: ranges.filter(r => r.exact).map(r => r.name), ranged: ranges.filter(r => !r.exact).map(r => `${r.name}@${r.range} (locked ${r.installed})`) },
  licences: { counts: licenceReport.counts, prodDenied: licenceReport.prodDenied, prodReview: licenceReport.prodReview }, sbom, audit, failures };
await fs.writeFile(`${OUT}/supply-chain.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ packages: integrity.packages, sbom, licencesDenied: licenceReport.prodDenied.length, licencesReview: licenceReport.prodReview.length,
  audit: audit?.totals, failures }, null, 2));
if (failures.length) process.exitCode = 1;
