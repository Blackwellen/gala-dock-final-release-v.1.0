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

// ── Icons. Each library becomes one or more "sets" (style variants), each set one or more chunk files (~1.5 MB max) that the
// picker loads together. group: line | filled | colour | brands — the picker's style filter.
const loadSet = prefix => {
  const j = JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), "utf8"));
  const icons = {};
  for (const [k, v] of Object.entries(j.icons)) if (!v.hidden) icons[k] = v.width || v.height ? [v.body, v.width ?? j.width, v.height ?? j.height] : v.body;
  return { icons, w: j.width ?? 16, h: j.height ?? 16 };
};
const LIB = [
  // [iconify prefix, display name, licence, [[set id, label, group, name filter]]]
  ["tabler", "Tabler", "MIT", [["tabler", "Tabler", "line", k => !k.endsWith("-filled")], ["tabler-filled", "Tabler filled", "filled", k => k.endsWith("-filled")]]],
  ["ph", "Phosphor", "MIT", ["regular", "thin", "light", "bold", "fill", "duotone"].map(st => [st === "regular" ? "ph" : `ph-${st}`, `Phosphor ${st}`, st === "fill" ? "filled" : st === "duotone" ? "colour" : "line",
    k => (k.match(/-(thin|light|bold|fill|duotone)$/)?.[1] ?? "regular") === st])],
  ["mdi", "Material Design", "Apache-2.0", [["mdi", "Material Design", "filled", k => !k.endsWith("-outline")], ["mdi-outline", "Material Design outline", "line", k => k.endsWith("-outline")]]],
  ["ri", "Remix", "Apache-2.0", [["ri", "Remix line", "line", k => k.endsWith("-line") || !k.endsWith("-fill")], ["ri-fill", "Remix fill", "filled", k => k.endsWith("-fill")]]],
  ["fluent", "Fluent (Microsoft)", "MIT", [["fluent", "Fluent", "line", k => /-24-regular$/.test(k)], ["fluent-filled", "Fluent filled", "filled", k => /-24-filled$/.test(k)]]],
  ["material-symbols", "Material Symbols (Google)", "Apache-2.0", [["material-symbols", "Material Symbols", "filled", k => !/-(outline|rounded|sharp)/.test(k)],
    ["material-symbols-outline", "Material Symbols outline", "line", k => /-outline$/.test(k) && !/rounded|sharp/.test(k)], ["material-symbols-rounded", "Material Symbols rounded", "filled", k => /-rounded$/.test(k) && !/outline/.test(k)]]],
  ["iconoir", "Iconoir", "MIT", [["iconoir", "Iconoir", "line", () => true]]],
  ["carbon", "Carbon (IBM)", "Apache-2.0", [["carbon", "Carbon", "line", () => true]]],
  ["fluent-emoji-flat", "Fluent Emoji", "MIT", [["fluent-emoji-flat", "Fluent Emoji (colour)", "colour", () => true]]],
  ["flat-color-icons", "Flat Color Icons", "MIT", [["flat-color-icons", "Flat Color Icons", "colour", () => true]]],
  ["logos", "SVG Logos", "CC0-1.0", [["logos", "Brand logos (colour)", "brands", () => true]]],
  ["simple-icons", "Simple Icons", "CC0-1.0", [["simple-icons", "Brand icons (single colour)", "brands", () => true]]],
];
const MAX = 1.5 * 1024 * 1024;
const sets = [];
for (const [prefix, , license, variants] of LIB) {
  const { icons, w, h } = loadSet(prefix);
  for (const [id, label, group, keep] of variants) {
    const entries = Object.entries(icons).filter(([k]) => keep(k)).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) continue;
    const total = JSON.stringify(Object.fromEntries(entries)).length, chunks = Math.max(1, Math.ceil(total / MAX)), per = Math.ceil(entries.length / chunks);
    let bytes = 0;
    for (let c = 0; c < chunks; c++) bytes += write(`icons/${id}${chunks > 1 ? `.${c}` : ""}.json`, { p: prefix, w, h, i: Object.fromEntries(entries.slice(c * per, (c + 1) * per)) });
    sets.push({ prefix: id, iconify: prefix, name: label, group, license, count: entries.length, chunks, bytes });
  }
}
write("index.json", { built: new Date().toISOString(), fonts: fonts.length, emoji: emoji.length, iconSets: sets });
console.log(`fonts ${fonts.length} (${(fontBytes / 1024).toFixed(0)} KB), emoji ${emoji.length} (${(emojiBytes / 1024).toFixed(0)} KB)`);
for (const s of sets) console.log(`icons ${s.prefix}: ${s.count} (${(s.bytes / 1024).toFixed(0)} KB)`);
console.log(`total icons ${sets.reduce((a, s) => a + s.count, 0)}`);
