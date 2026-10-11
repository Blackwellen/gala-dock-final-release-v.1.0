// Measures how SSIM against a reference reacts to tiny shifts of the reference itself.
import fs from "node:fs";
import { PNG } from "pngjs";
const file = process.argv[2];
const a = PNG.sync.read(fs.readFileSync(file));
const { width, height } = a;
const shift = (dx, dy) => { const b = new PNG({ width, height }); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const sx = Math.min(width - 1, Math.max(0, x - dx)), sy = Math.min(height - 1, Math.max(0, y - dy)); const s = (sy * width + sx) * 4, d = (y * width + x) * 4; for (let k = 0; k < 4; k++) b.data[d + k] = a.data[s + k]; } return b; };
const lum = (p, i) => 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2];
function ssim(p, q) { const C1 = 6.5025, C2 = 58.5225; let t = 0, n = 0; for (let y = 0; y + 8 <= height; y += 4) for (let x = 0; x + 8 <= width; x += 4) { let ma = 0, mb = 0; const va = [], vb = []; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const k = ((y + j) * width + x + i) * 4; const u = lum(p, k), v = lum(q, k); va.push(u); vb.push(v); ma += u; mb += v; } ma /= 64; mb /= 64; let sa = 0, sb = 0, sab = 0; for (let m = 0; m < 64; m++) { sa += (va[m] - ma) ** 2; sb += (vb[m] - mb) ** 2; sab += (va[m] - ma) * (vb[m] - mb); } sa /= 63; sb /= 63; sab /= 63; t += ((2 * ma * mb + C1) * (2 * sab + C2)) / ((ma * ma + mb * mb + C1) * (sa + sb + C2)); n++; } return (t / n).toFixed(4); }
for (const [dx, dy] of [[1, 0], [2, 0], [2, 2], [4, 3]]) console.log(`shift ${dx},${dy}px: ssim ${ssim(a, shift(dx, dy))}`);
