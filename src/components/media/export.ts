"use client";

import { cssFontUrls, fontSpecs, googleFontHrefs, usedFaceCss, type Page } from "@/lib/media/document";
import { loadFonts } from "@/lib/design-kit/assets";

/**
 * Exports a rendered page (media spec §50). Images and fonts are inlined as data URLs, the page DOM is wrapped in an SVG
 * foreignObject and rasterised at the chosen scale, so the output is reproduced from the canonical document, not a screenshot.
 */
const toDataUrl = async (url: string) => {
  const r = await fetch(url, { credentials: "same-origin" }); if (!r.ok) throw new Error("asset");
  const b = await r.blob();
  return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); });
};

async function fontCss(page: Page, faces = "") {
  const specs = fontSpecs({ unit: "px", dpi: 150, pages: [page] });
  if (!specs.length) return "";
  try {
    const catalogue = await loadFonts().then(list => new Map(list.map(f => [f.f, { w: f.w, i: f.i }]))).catch(() => null);
    const google = (await Promise.all(googleFontHrefs(specs, catalogue).map(h => fetch(h).then(r => (r.ok ? r.text() : "")).catch(() => "")))).join("\n");
    // Q55: uploaded brand fonts (same-origin @font-face) are embedded too; they used to be left out of every export.
    const css = `${usedFaceCss(faces, specs.map(s => s.family))}\n${google}`;
    const urls = cssFontUrls(css).slice(0, 60);
    let out = css;
    for (const u of urls) { try { out = out.replaceAll(u, await toDataUrl(u)); } catch { /* keep remote url */ } }
    return out;
  } catch { return ""; }
}

/** Q75: counts images left out of an export (another site's image without CORS, or one that no longer loads) so the editor can say so. */
export type ExportReport = { dropped: number };
export async function renderPage(el: HTMLElement, page: Page, scale = 1, transparent = false, faces = "", report?: ExportReport): Promise<HTMLCanvasElement> {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.transform = "none"; clone.style.position = "relative"; clone.style.left = "0"; clone.style.top = "0"; clone.style.display = "block"; clone.style.cursor = "";
  // Editor-only chrome inside the page node (transparency checkerboard, in-progress pen/line preview) never reaches the file.
  for (const n of [...clone.querySelectorAll(".st-checker, .st-live")]) n.remove();
  for (const n of [...clone.querySelectorAll("[contenteditable]")]) n.removeAttribute("contenteditable");
  if (transparent) clone.style.background = "transparent";
  for (const img of [...clone.querySelectorAll("img")]) { try { img.src = await toDataUrl(img.src); } catch { img.remove(); if (report) report.dropped++; } }
  const css = await fontCss(page, faces);
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

export async function exportDesign(els: HTMLElement[], pages: Page[], format: "png" | "jpeg" | "webp" | "pdf", opts: { scale: number; quality: number; transparent: boolean; faces?: string; report?: ExportReport }): Promise<Blob> {
  if (format === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    for (let i = 0; i < pages.length; i++) {
      const c = await renderPage(els[i]!, pages[i]!, opts.scale, false, opts.faces, opts.report);
      const jpg = await pdf.embedJpg(await (await new Promise<Blob>(r => c.toBlob(b => r(b!), "image/jpeg", 0.95))).arrayBuffer());
      const p = pdf.addPage([pages[i]!.width * 0.48, pages[i]!.height * 0.48]);   // 150 dpi working px → points
      p.drawImage(jpg, { x: 0, y: 0, width: p.getWidth(), height: p.getHeight() });
    }
    return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
  }
  const c = await renderPage(els[0]!, pages[0]!, opts.scale, opts.transparent && format === "png", opts.faces, opts.report);
  return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("export"))), `image/${format}`, opts.quality));
}
