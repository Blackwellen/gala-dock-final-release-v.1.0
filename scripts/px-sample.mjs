// Prints pixel colours along a strip in a design and a screenshot: node scripts/px-sample.mjs <png> x0 x1 y [step]
import fs from "node:fs"; import { PNG } from "pngjs";
const [file, x0, x1, y, step = 1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(file)), out = [];
const sx = p.width / 1536;
for (let x = +x0; x <= +x1; x += +step) { const i = (Math.round(+y * sx) * p.width + Math.round(x * sx)) * 4; out.push(`${x}:#${[0, 1, 2].map(k => p.data[i + k].toString(16).padStart(2, "0")).join("")}`); }
console.log(out.join(" "));
