/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) renders plain <img> */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Per-page social image for the seven public routes (blueprint §1.6): white canvas, cobalt eyebrow, the page's proposition. */
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export async function ogImage(eyebrow: string, title: string, accent: string) {
  const mark = await readFile(join(process.cwd(), "public/brand/gala-dock-mark-trim.png")).then(b => `data:image/png;base64,${b.toString("base64")}`, () => null);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "linear-gradient(135deg, #ffffff 0%, #ffffff 55%, #eef3ff 100%)", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {mark ? <img src={mark} width={64} height={64} alt="" /> : null}
        <span style={{ fontSize: 34, fontWeight: 700, color: "#6906EB" }}>Gala·Dock</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 5, color: "#2457E6", textTransform: "uppercase" }}>{eyebrow}</span>
        <span style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05, color: "#0e1430", letterSpacing: -2 }}>{title}</span>
        <span style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05, color: "#2457E6", letterSpacing: -2 }}>{accent}</span>
      </div>
      <div style={{ display: "flex", height: 6, width: 160, borderRadius: 6, background: "#2457E6" }} />
    </div>,
    ogSize,
  );
}
