// Finds class names used in components that no stylesheet defines — the usual cause of an unstyled dialog or list.
// Usage: node scripts/design/unstyled-classes.mjs [prefix-filter]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
const walk = (d, ext, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "node_modules") walk(p, ext, out); } else if (ext.test(f)) out.push(p); } return out; };
const css = walk("src", /\.css$/).map(f => readFileSync(f, "utf8")).join("\n");
const defined = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]));
const used = new Map();
for (const f of walk("src", /\.tsx$/)) {
  const s = readFileSync(f, "utf8"), rel = f.split(sep).join("/").replace(/^src\//, "");
  for (const m of s.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)) for (const c of (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, " ").split(/\s+/))
    if (/^[a-z][\w-]*-[\w-]+$/.test(c) && !defined.has(c)) { if (!used.has(c)) used.set(c, new Set()); used.get(c).add(rel); }
}
const filter = process.argv[2];
const rows = [...used].filter(([c]) => !filter || c.startsWith(filter)).sort();
const byFile = new Map(); for (const [c, fs] of rows) for (const f of fs) { if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(c); }
for (const [f, cs] of [...byFile].sort((a, b) => b[1].length - a[1].length)) console.log(`${String(cs.length).padStart(3)}  ${f}: ${cs.slice(0, 12).join(" ")}`);
console.log(`\n${rows.length} undefined classes in ${byFile.size} files`);
