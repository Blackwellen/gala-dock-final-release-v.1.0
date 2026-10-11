// node crop.mjs <key> x y w h [scale] → artifacts/tmp/crop.png (design left | ours right)
import fs from "node:fs"; import { PNG } from "pngjs";
const [,, key, X, Y, W, H, S = "2"] = process.argv; const [x, y, w, h, s] = [X, Y, W, H, S].map(Number);
const man = fs.readdirSync("artifacts/visual/ws-manifest").flatMap(f => JSON.parse(fs.readFileSync("artifacts/visual/ws-manifest/" + f)));
const row = man.find(r => r.key === key);
const a = PNG.sync.read(fs.readFileSync(row.file)), b = PNG.sync.read(fs.readFileSync(`artifacts/visual/ws/screens/${key}.png`));
const out = new PNG({ width: (w * 2 + 4) * s, height: h * s });
for (let yy = 0; yy < h * s; yy++) for (let xx = 0; xx < out.width; xx++) {
  const side = xx < w * s ? a : xx >= (w + 4) * s ? b : null, k = (yy * out.width + xx) * 4;
  if (!side) { out.data.set([255, 0, 0, 255], k); continue; }
  const sx = x + Math.floor((side === a ? xx : xx - (w + 4) * s) / s), sy = y + Math.floor(yy / s), j = (sy * side.width + sx) * 4;
  out.data.set(side.data.subarray(j, j + 4), k);
}
fs.writeFileSync("artifacts/tmp/crop.png", PNG.sync.write(out));
