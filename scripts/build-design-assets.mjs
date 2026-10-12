// Builds the self-hosted design asset libraries used by Media Studio and the venue/event map studio into public/design-assets/.
// Each file is fetched by the browser only when its picker opens, so the editors stay light.
//   fonts.json        — Google Fonts catalogue (open-source families: family, category, weights, italic, popularity rank)
//   emoji.json        — Unicode emoji (emojibase-data, MIT): char, name, group, tags
//   icons/<set>.json  — Iconify icon sets: Tabler (MIT), Phosphor (MIT), Material Design Icons (Apache-2.0), Remix (Apache-2.0)
//   index.json        — what's available, with counts and licences (shown in the pickers)
// Usage: node scripts/build-design-assets.mjs   (re-run to refresh; needs network for the Google Fonts catalogue)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const out = new URL("../public/design-assets/", import.meta.url);
mkdirSync(new URL("icons/", out), { recursive: true });
const write = (name, data) => { const s = JSON.stringify(data); writeFileSync(new URL(name, out), s); return s.length; };

// ── Fonts
const meta = await (await fetch("https://fonts.google.com/metadata/fonts")).text();
const gf = JSON.parse(meta.replace(/^\)\]\}'\n?/, "")).familyMetadataList.filter(f => f.isOpenSource !== false && !f.isBrandFont);
const weightsOf = f => {
  const wght = (f.axes ?? []).find(a => a.tag === "wght");
  if (wght) return [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(w => w >= wght.min && w <= wght.max);
  return [...new Set(Object.keys(f.fonts).map(k => Number.parseInt(k, 10)))].sort((a, b) => a - b);
};
const fonts = gf.map(f => ({ f: f.family, c: f.category, w: weightsOf(f), i: Object.keys(f.fonts).some(k => k.endsWith("i")) || (f.axes ?? []).some(a => a.tag === "ital"), p: f.popularity }))
  .sort((a, b) => a.p - b.p);
const fontBytes = write("fonts.json", fonts);

// ── Emoji
const compact = require("emojibase-data/en/compact.json"), groups = require("emojibase-data/en/messages.json").groups;
const gname = Object.fromEntries(groups.map(g => [g.order, g.message]));
const emoji = compact.filter(e => e.group !== undefined && e.group !== 2).map(e => ({ e: e.unicode, n: e.label, g: gname[e.group], t: (e.tags ?? []).slice(0, 6) }));
const emojiBytes = write("emoji.json", emoji);

// ── Icons
const SETS = [["tabler", "Tabler", "MIT"], ["ph", "Phosphor", "MIT"], ["mdi", "Material Design", "Apache-2.0"], ["ri", "Remix", "Apache-2.0"]];
const sets = [];
for (const [prefix, name, license] of SETS) {
  const j = JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), "utf8"));
  const icons = {};
  for (const [k, v] of Object.entries(j.icons)) if (!v.hidden) icons[k] = v.width || v.height ? [v.body, v.width ?? j.width, v.height ?? j.height] : v.body;
  if (prefix === "ph") {
    // Phosphor ships six weights of every icon; one file per weight keeps each download small and gives a style filter.
    for (const style of ["regular", "thin", "light", "bold", "fill", "duotone"]) {
      const sub = Object.fromEntries(Object.entries(icons).filter(([k]) => (k.match(/-(thin|light|bold|fill|duotone)$/)?.[1] ?? "regular") === style));
      const id = style === "regular" ? "ph" : `ph-${style}`;
      const bytes = write(`icons/${id}.json`, { p: prefix, w: j.width ?? 16, h: j.height ?? 16, i: sub });
      sets.push({ prefix: id, iconify: prefix, name: `${name} ${style}`, license, count: Object.keys(sub).length, bytes });
    }
    continue;
  }
  const bytes = write(`icons/${prefix}.json`, { p: prefix, w: j.width ?? 16, h: j.height ?? 16, i: icons });
  sets.push({ prefix, iconify: prefix, name, license, count: Object.keys(icons).length, bytes });
}
write("index.json", { built: new Date().toISOString(), fonts: fonts.length, emoji: emoji.length, iconSets: sets });
console.log(`fonts ${fonts.length} (${(fontBytes / 1024).toFixed(0)} KB), emoji ${emoji.length} (${(emojiBytes / 1024).toFixed(0)} KB)`);
for (const s of sets) console.log(`icons ${s.prefix}: ${s.count} (${(s.bytes / 1024).toFixed(0)} KB)`);
console.log(`total icons ${sets.reduce((a, s) => a + s.count, 0)}`);
