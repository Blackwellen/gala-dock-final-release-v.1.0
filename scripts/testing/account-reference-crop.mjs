// Analysis crop only: retain the source, remove phone hardware/OS chrome, no scaling or content masks.
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
const source = 'Designs/PWA/Modern Event App Account Dashboard.png';
const crop = { x: 40, y: 108, width: 714, height: 1780 };
const original = PNG.sync.read(await fs.readFile(source));
if (original.width !== 794 || original.height !== 1981) throw new Error('Reference dimensions changed; review crop');
const out = new PNG({ width: crop.width, height: crop.height });
PNG.bitblt(original, out, crop.x, crop.y, crop.width, crop.height, 0, 0);
await fs.writeFile('artifacts/pwa/finish-account-reference.png', PNG.sync.write(out));
await fs.writeFile('artifacts/pwa/finish-account-reference-crop.json', JSON.stringify({ source, original: { width: original.width, height: original.height }, crop, reason: 'Visually inspected rectangular app region excludes outer bezel, OS status/notch and home indicator. No app content masks. Mandatory five-item shell supersedes the reference six-item navigation.', candidate: '357x890 CSS pixels, DPR2; source CSS viewport is inferred and not approved as a fidelity gate.' }, null, 2));
