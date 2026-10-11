"use client";

import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import { icons } from "lucide-react";
import { code128Svg } from "@/lib/tickets/code128";
import { resolveText, type EventData, type Layer, type Effects } from "@/lib/media/document";
import { fillCss, assetSrc } from "@/lib/media/render";

export { fillCss, assetSrc, qrContrast } from "@/lib/media/render";

/** Renders one design layer as positioned HTML/SVG. Used by the editor, previews and the exporter (same output everywhere). */
function effectStyle(e: Effects | undefined): CSSProperties {
  if (!e) return {};
  const f: string[] = [];
  if (e.brightness != null && e.brightness !== 100) f.push(`brightness(${e.brightness}%)`);
  if (e.contrast != null && e.contrast !== 100) f.push(`contrast(${e.contrast}%)`);
  if (e.saturate != null && e.saturate !== 100) f.push(`saturate(${e.saturate}%)`);
  if (e.hue) f.push(`hue-rotate(${e.hue}deg)`);
  if (e.grayscale) f.push(`grayscale(${e.grayscale}%)`);
  if (e.sepia) f.push(`sepia(${e.sepia}%)`);
  if (e.invert) f.push(`invert(${e.invert}%)`);
  if (e.blur) f.push(`blur(${e.blur}px)`);
  if (e.shadow) f.push(`drop-shadow(${e.shadow.x}px ${e.shadow.y}px ${e.shadow.blur}px ${e.shadow.color})`);
  if (e.glow) f.push(`drop-shadow(0 0 ${e.glow.blur}px ${e.glow.color})`, `drop-shadow(0 0 ${Math.round(e.glow.blur / 2)}px ${e.glow.color})`);
  return { opacity: e.opacity ?? 1, mixBlendMode: (e.blend ?? "normal") as CSSProperties["mixBlendMode"], filter: f.length ? f.join(" ") : undefined };
}

const SHAPES: Record<string, string> = {
  triangle: "M50 0 L100 100 L0 100 Z", diamond: "M50 0 L100 50 L50 100 L0 50 Z",
  star: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
  arrow: "M0 35 L65 35 L65 10 L100 50 L65 90 L65 65 L0 65 Z", badge: "M50 0 L62 12 L79 8 L84 25 L100 33 L92 50 L100 67 L84 75 L79 92 L62 88 L50 100 L38 88 L21 92 L16 75 L0 67 L8 50 L0 33 L16 25 L21 8 L38 12 Z",
  speech: "M5 5 H95 V70 H45 L25 95 L28 70 H5 Z", line: "M0 50 H100",
};

export function LayerView({ l, data, editing, onText }: { l: Layer; data: EventData; editing?: boolean; onText?: (t: string) => void }) {
  const box: CSSProperties = { position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h, display: l.hidden ? "none" : undefined,
    transform: `rotate(${l.rotation}deg) scale(${l.flipX ? -1 : 1},${l.flipY ? -1 : 1})`, transformOrigin: "center", ...effectStyle(l.effects) };
  const radius = l.effects?.radius ?? 0;
  const stroke = l.effects?.stroke;
  switch (l.type) {
    case "text": {
      const style: CSSProperties = { ...box, fontFamily: `'${l.font}', Inter, sans-serif`, fontSize: l.size, fontWeight: l.weight, fontStyle: l.italic ? "italic" : "normal", lineHeight: l.lineHeight,
        letterSpacing: l.letterSpacing, textAlign: l.align, textTransform: l.transform ?? "none", textDecoration: l.underline ? "underline" : "none", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
        display: l.hidden ? "none" : "flex", flexDirection: "column", justifyContent: l.valign === "middle" ? "center" : l.valign === "bottom" ? "flex-end" : "flex-start",
        color: l.fill && l.fill.type !== "solid" ? "transparent" : l.color, WebkitTextStroke: stroke ? `${stroke.width}px ${stroke.color}` : undefined };
      const inner: CSSProperties = l.fill && l.fill.type !== "solid" ? { backgroundImage: fillCss(l.fill), WebkitBackgroundClip: "text", backgroundClip: "text" } : {};
      const txt = resolveText(l, data);
      return <div style={style} data-layer={l.id}><span style={{ ...inner, background: l.highlight ? l.highlight : inner.backgroundImage ? undefined : "none", backgroundImage: inner.backgroundImage, padding: l.highlight ? "0.05em 0.25em" : undefined, outline: "none" }}
        contentEditable={editing} suppressContentEditableWarning onBlur={e => onText?.(e.currentTarget.innerText)}>{editing ? l.text : txt}</span></div>;
    }
    case "image": {
      const r = l.mask === "circle" || l.mask === "ellipse" ? "50%" : l.mask === "rounded" ? Math.min(l.w, l.h) * 0.08 : radius;
      return <div style={{ ...box, overflow: "hidden", borderRadius: r, outline: stroke ? `${stroke.width}px ${stroke.dash ?? "solid"} ${stroke.color}` : undefined }} data-layer={l.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetSrc(l.asset)} alt="" draggable={false} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: l.fit, objectPosition: `${l.focusX}% ${l.focusY}%`, transform: `scale(${l.zoom})`, transformOrigin: `${l.focusX}% ${l.focusY}%`, pointerEvents: "none" }} /></div>;
    }
    case "shape": {
      if (l.shape === "rect" || l.shape === "ellipse") return <div style={{ ...box, background: fillCss(l.fill), borderRadius: l.shape === "ellipse" ? "50%" : radius, border: stroke ? `${stroke.width}px ${stroke.dash ?? "solid"} ${stroke.color}` : undefined, boxSizing: "border-box" }} data-layer={l.id} />;
      const gid = `g${l.id}`, fill = l.fill.type === "solid" ? l.fill.color : `url(#${gid})`;
      return <svg style={box} viewBox="0 0 100 100" preserveAspectRatio="none" data-layer={l.id}>
        {l.fill.type !== "solid" && <defs>{l.fill.type === "linear" ? <linearGradient id={gid} gradientTransform={`rotate(${(l.fill.angle ?? 180) - 90} .5 .5)`}>{l.fill.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}</linearGradient>
          : <radialGradient id={gid}>{l.fill.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}</radialGradient>}</defs>}
        <path d={SHAPES[l.shape]} fill={l.shape === "line" ? "none" : fill} stroke={l.shape === "line" ? (l.fill.type === "solid" ? l.fill.color : "#000") : stroke?.color} strokeWidth={l.shape === "line" ? Math.max(1, (stroke?.width ?? 4) * 100 / Math.max(1, l.h)) : stroke ? stroke.width * 100 / Math.max(1, l.w) : 0}
          vectorEffect="non-scaling-stroke" strokeDasharray={stroke?.dash === "dashed" ? "6 4" : stroke?.dash === "dotted" ? "1 3" : undefined} /></svg>;
    }
    case "qr": case "barcode": return <CodeView l={l} data={data} box={box} />;
    case "drawing": return <svg style={box} viewBox={`0 0 ${l.w} ${l.h}`} data-layer={l.id}>{l.paths.map((p, i) => <path key={i} d={p.d} stroke={p.color} strokeWidth={p.width} strokeOpacity={p.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
    case "icon": { const I = icons[l.icon as keyof typeof icons]; return <div style={{ ...box, color: l.color, display: l.hidden ? "none" : "grid", placeItems: "center" }} data-layer={l.id}>{I ? <I width="100%" height="100%" strokeWidth={1.75} /> : null}</div>; }
  }
}

function CodeView({ l, data, box }: { l: Extract<Layer, { type: "qr" | "barcode" }>; data: EventData; box: CSSProperties }) {
  const value = resolveText(l, data);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    if (l.type === "barcode") { try { const s = code128Svg(value.replace(/[^\x20-\x7e]/g, "").slice(0, 80) || "GALADOCK", { height: 100, color: l.fg }); queueMicrotask(() => { if (live) setSvg(s); }); } catch { /* invalid */ } }
    else void QRCode.toString(value || " ", { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: l.fg, light: l.bg } }).then(s => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [value, l.fg, l.bg, l.type]);
  return <div style={{ ...box, background: l.bg, display: box.display ?? "grid", gridTemplateRows: l.label ? "1fr auto" : "1fr", padding: l.type === "barcode" ? 4 : 0 }} data-layer={l.id}>
    <div style={{ width: "100%", height: "100%" }} className="ms-code" dangerouslySetInnerHTML={{ __html: svg }} />
    {l.label && <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: Math.max(10, l.w * 0.075), color: l.fg, paddingBottom: 4 }}>{l.label}</div>}
  </div>;
}
