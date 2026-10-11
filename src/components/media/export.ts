"use client";

import { googleFontHref, type Page } from "@/lib/media/document";

/**
 * Exports a rendered page (media spec §50). Images and fonts are inlined as data URLs, the page DOM is wrapped in an SVG
 * foreignObject and rasterised at the chosen scale, so the output is reproduced from the canonical document, not a screenshot.
 */
const toDataUrl = async (url: string) => {
  const r = await fetch(url, { credentials: "same-origin" }); if (!r.ok) throw new Error("asset");
  const b = await r.blob();
  return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); });
};

async function fontCss(families: string[]) {
  if (!families.length) return "";
  try {
    const css = await (await fetch(googleFontHref(families))).text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]!))].slice(0, 40);
    let out = css;
    for (const u of urls) { try { out = out.replaceAll(u, await toDataUrl(u)); } catch { /* keep remote url */ } }
    return out;
  } catch { return ""; }
}

export async function renderPage(el: HTMLElement, page: Page, scale = 1, transparent = false): Promise<HTMLCanvasElement> {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.transform = "none"; clone.style.position = "relative"; clone.style.left = "0"; clone.style.top = "0";
  if (transparent) clone.style.background = "transparent";
  for (const img of [...clone.querySelectorAll("img")]) { try { img.src = await toDataUrl(img.src); } catch { img.remove(); } }
  const families = page.layers.filter(l => l.type === "text").map(l => (l as { font: string }).font);
  const css = await fontCss(families);
  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}"><defs><style>${css.replace(/</g, "")}</style></defs><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = Math.round(page.width * scale); c.height = Math.round(page.height * scale);
  const ctx = c.getContext("2d")!;
  if (!transparent) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
  return c;
}

export async function exportDesign(els: HTMLElement[], pages: Page[], format: "png" | "jpeg" | "webp" | "pdf", opts: { scale: number; quality: number; transparent: boolean }): Promise<Blob> {
  if (format === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    for (let i = 0; i < pages.length; i++) {
      const c = await renderPage(els[i]!, pages[i]!, opts.scale, false);
      const jpg = await pdf.embedJpg(await (await new Promise<Blob>(r => c.toBlob(b => r(b!), "image/jpeg", 0.95))).arrayBuffer());
      const p = pdf.addPage([pages[i]!.width * 0.48, pages[i]!.height * 0.48]);   // 150 dpi working px → points
      p.drawImage(jpg, { x: 0, y: 0, width: p.getWidth(), height: p.getHeight() });
    }
    return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
  }
  const c = await renderPage(els[0]!, pages[0]!, opts.scale, opts.transparent && format === "png");
  return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("export"))), `image/${format}`, opts.quality));
}
