// Generates favicon and PWA icons from the supplied brand mark (public/brand/gala-dock-mark.png)
// using Chrome's high-quality canvas resampling. Re-run whenever the mark changes.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const mark = `data:image/png;base64,${(await fs.readFile("public/brand/gala-dock-mark.png")).toString("base64")}`;
// [file, size, scale of mark relative to canvas, background]
const targets = [
  ["public/brand/favicon-32.png", 32, 1, null], ["public/brand/favicon-48.png", 48, 1, null],
  ["public/icons/icon-192.png", 192, 0.92, null], ["public/icons/icon-512.png", 512, 0.92, null],
  // Maskable icons keep the mark inside the 80% safe zone on a solid background.
  ["public/icons/maskable-192.png", 192, 0.62, "#ffffff"], ["public/icons/maskable-512.png", 512, 0.62, "#ffffff"],
  ["public/icons/apple-touch-icon.png", 180, 0.74, "#ffffff"],
];
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
for (const [file, size, scale, bg] of targets) {
  const data = await page.evaluate(async ({ mark, size, scale, bg }) => {
    const img = new Image(); img.src = mark; await img.decode();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
    // The source is 137x129: fit by its longer side and centre it.
    const s = (size * scale) / Math.max(img.width, img.height);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { mark, size, scale, bg });
  await fs.writeFile(file, Buffer.from(data, "base64"));
  console.log(`${file} ${size}x${size}`);
}
await browser.close();
