// node ink.mjs <png> x0 y0 x1 y1 → darkest pixel + median of "ink" pixels (sum < 600)
import fs from "node:fs"; import { PNG } from "pngjs";
const [,, f, ...n] = process.argv; const [x0, y0, x1, y1] = n.map(Number); const a = PNG.sync.read(fs.readFileSync(f));
const ink = []; let best = [999];
for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * a.width + x) * 4, s = a.data[k] + a.data[k + 1] + a.data[k + 2]; if (s < best[0]) best = [s, a.data[k], a.data[k + 1], a.data[k + 2]]; if (s < 600) ink.push([a.data[k], a.data[k + 1], a.data[k + 2], s]); }
ink.sort((p, q) => p[3] - q[3]); const q = ink.slice(0, Math.max(1, ink.length >> 2)); const avg = i => Math.round(q.reduce((t, p) => t + p[i], 0) / q.length);
const hex = v => v.toString(16).padStart(2, "0");
console.log(f.split("/").pop().slice(0, 40), "darkest", "#" + best.slice(1).map(hex).join(""), "dark-quartile avg", "#" + [0, 1, 2].map(avg).map(hex).join(""));
