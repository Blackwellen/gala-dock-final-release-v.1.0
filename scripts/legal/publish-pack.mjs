#!/usr/bin/env node
// Legal sign-off (R3): puts the deployed legal pack in force and queues the change notices. Run ONCE, after the deploy is live.
//   node --env-file=.env --env-file=.env.local scripts/legal/publish-pack.mjs --dry       compare + show who would be notified
//   node --env-file=.env --env-file=.env.local scripts/legal/publish-pack.mjs --publish   publish and queue the notices
// Options: --site=https://www.galadock.com (default NEXT_PUBLIC_SITE_URL) --by="owner sign-off 2026-11-15"
// Safety: refuses unless the LIVE site's /legal/manifest.json lists exactly the versions and sha256 texts of this checkout (so no
// notice can go out for texts users can't read yet); legal_publish_pack itself refuses a second run and a changed text under an
// existing version. Never prints credentials or personal data (counts only).
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = k => process.argv.includes(`--${k}`);
const site = (arg("site") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");
const by = (arg("by") ?? "owner sign-off 2026-11-15").slice(0, 120);
if (has("dry") === has("publish")) { console.error("usage: --dry | --publish [--site=URL] [--by=TEXT]"); process.exit(2); }

async function run(query) {
  const { SUPABASE_PROJECT_REF: ref, SUPABASE_PAT_KEY: pat } = process.env;
  if (!ref || !pat) throw new Error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`database: HTTP ${res.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const lit = v => `'${String(v).replace(/'/g, "''")}'`;

// Local pack: registry versions + sha256 of each content/legal body (same normalisation as build-texts.mjs).
const registry = readFileSync("src/lib/legal/registry.ts", "utf8");
const pack = /LEGAL_PACK = "([^"]+)"/.exec(registry)?.[1];
const local = new Map([...registry.matchAll(/\{ slug: "([a-z-]+)", title: "[^"]+", href: "[^"]+", group: "[^"]+", version: "([^"]+)", label: "([^"]+)", previous: "([^"]+)"/g)]
  .map(m => [m[1], { slug: m[1], version: m[2], label: m[3], previous: m[4] }]));
for (const f of readdirSync("content/legal").filter(x => x.endsWith(".md"))) {
  const raw = readFileSync(join("content/legal", f), "utf8").replace(/\r\n?/g, "\n");
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim() + "\n";
  const d = local.get(f.slice(0, -3)); if (d) d.sha256 = createHash("sha256").update(body).digest("hex");
}

const live = await (await fetch(`${site}/legal/manifest.json`, { cache: "no-store", signal: AbortSignal.timeout(30_000) })).json().catch(() => null);
if (!live?.documents) { console.error(`refused: ${site}/legal/manifest.json is not serving a legal pack yet (deploy first)`); process.exit(1); }
const diffs = [];
if (live.pack !== pack) diffs.push(`pack: live ${live.pack} ≠ local ${pack}`);
for (const d of local.values()) {
  const l = live.documents.find(x => x.slug === d.slug);
  if (!l) diffs.push(`${d.slug}: missing on the live site`);
  else if (l.version !== d.version || l.sha256 !== d.sha256) diffs.push(`${d.slug}: live ${l.version}/${String(l.sha256).slice(0, 8)} ≠ local ${d.version}/${String(d.sha256).slice(0, 8)}`);
}
if (live.documents.length !== local.size) diffs.push(`document count: live ${live.documents.length} ≠ local ${local.size}`);
if (diffs.length) { console.error(`refused: the live site doesn't serve this checkout's legal texts:\n- ${diffs.join("\n- ")}`); process.exit(1); }
console.log(`live site serves legal pack ${pack}: ${local.size} documents, texts identical to this checkout`);

const [state] = await run(`select (select count(*) from public.legal_packs where pack = ${lit(pack)})::int as done, public.legal_notice_counts() as counts`);
if (state.done) { console.log(`pack ${pack} is already published; nothing to do`); process.exit(0); }
console.log(`notices that will be queued (one in-app notice + one email each): ${JSON.stringify(state.counts)}`);
if (has("dry")) { console.log("dry run: nothing written"); process.exit(0); }

const manifest = JSON.stringify({ pack, documents: [...local.values()] });
const [out] = await run(`select public.legal_publish_pack(${lit(pack)}, ${lit(manifest)}::jsonb, ${lit(by)}) as r`);
console.log(`published: ${JSON.stringify(out.r)}`);
console.log("The email worker (pg_cron email-outbox, every 2 minutes) sends the queued notices.");
