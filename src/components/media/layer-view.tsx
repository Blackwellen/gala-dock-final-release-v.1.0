"use client";

import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import { icons } from "lucide-react";
import { code128Svg } from "@/lib/tickets/code128";
import { resolveText, fillPlaceholders, toFriendly, fromFriendly, COVER_PLACEHOLDER, type EventData, type Layer, type Effects, type Fill, type EraseStroke, type PathLayer } from "@/lib/media/document";
import { fillCss, assetSrc } from "@/lib/media/render";
import { textFxShadow } from "@/lib/design-kit/effects";
import { WidgetView } from "@/components/design-kit/widget-view";
import { pathD } from "@/lib/media/path";
import { sanitizeSvg, safeSvgColor } from "@/lib/security/svg-sanitize";
export { pathD };

export { fillCss, assetSrc, qrContrast } from "@/lib/media/render";

/** Renders one design layer as positioned HTML/SVG. Used by the editor, previews and the exporter (same output everywhere). */
function effectStyle(e: Effects | undefined, id: string): CSSProperties {
  if (!e) return {};
  const f: string[] = [];
  if (e.duotone) f.push(`url(#dt${id})`);
  if (e.brightness != null && e.brightness !== 100) f.push(`brightness(${e.brightness}%)`);
  if (e.contrast != null && e.contrast !== 100) f.push(`contrast(${e.contrast}%)`);
  if (e.saturate != null && e.saturate !== 100) f.push(`saturate(${e.saturate}%)`);
  if (e.hue) f.push(`hue-rotate(${e.hue}deg)`);
  if (e.grayscale) f.push(`grayscale(${e.grayscale}%)`);
  if (e.sepia) f.push(`sepia(${e.sepia}%)`);
  if (e.invert) f.push(`invert(${e.invert}%)`);
  if (e.blur) f.push(`blur(${e.blur}px)`);
  for (const s of [e.shadow, ...(e.shadows ?? [])]) if (s) f.push(`drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`);
  if (e.glow) f.push(`drop-shadow(0 0 ${e.glow.blur}px ${e.glow.color})`, `drop-shadow(0 0 ${Math.round(e.glow.blur / 2)}px ${e.glow.color})`);
  return { opacity: e.opacity ?? 1, mixBlendMode: (e.blend ?? "normal") as CSSProperties["mixBlendMode"], filter: f.length ? f.join(" ") : undefined };
}
const radiusCss = (e: Effects | undefined, fallback: number | string = 0) => e?.radii ? e.radii.map(r => `${r}px`).join(" ") : e?.radius ?? fallback;
const inset = (e: Effects | undefined) => e?.innerShadow ? `inset ${e.innerShadow.x}px ${e.innerShadow.y}px ${e.innerShadow.blur}px ${e.innerShadow.color}` : undefined;

/** Duotone: luminance → two-colour map (SVG filter referenced from the layer's CSS filter). */
function Duotone({ id, colors }: { id: string; colors: [string, string] }) {
  const c = colors.map(h => { const n = parseInt(h.replace("#", "").slice(0, 6).padEnd(6, "0"), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => +(v / 255).toFixed(3)); });
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><filter id={`dt${id}`} colorInterpolationFilters="sRGB">
    <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" />
    <feComponentTransfer><feFuncR type="table" tableValues={`${c[0]![0]} ${c[1]![0]}`} /><feFuncG type="table" tableValues={`${c[0]![1]} ${c[1]![1]}`} /><feFuncB type="table" tableValues={`${c[0]![2]} ${c[1]![2]}`} /></feComponentTransfer>
  </filter></svg>;
}
/** Rubber-tool strokes as an alpha mask (layer pixels): everything visible except the erased strokes. */
const eraseMask = (w: number, h: number, strokes: EraseStroke[] | undefined): CSSProperties => {
  if (!strokes?.length) return {};
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><mask id="m"><rect width="${w}" height="${h}" fill="#fff"/>${strokes.map(s => `<path d="${s.d}" stroke="#000" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</mask><rect width="${w}" height="${h}" mask="url(#m)"/></svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return { WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" };
};
/** Path mask for filled shapes whose fill SVG can't paint natively (conic gradients). */
const pathMask = (d: string, evenodd?: boolean): CSSProperties => {
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${d}"${evenodd ? ' fill-rule="evenodd"' : ""}/></svg>`)}")`;
  return { WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" };
};

const SHAPES: Record<string, string> = {
  triangle: "M50 0 L100 100 L0 100 Z", diamond: "M50 0 L100 50 L50 100 L0 50 Z",
  star: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
  arrow: "M0 35 L65 35 L65 10 L100 50 L65 90 L65 65 L0 65 Z", badge: "M50 0 L62 12 L79 8 L84 25 L100 33 L92 50 L100 67 L84 75 L79 92 L62 88 L50 100 L38 88 L21 92 L16 75 L0 67 L8 50 L0 33 L16 25 L21 8 L38 12 Z",
  speech: "M5 5 H95 V70 H45 L25 95 L28 70 H5 Z", line: "M0 50 H100",
};
function Grad({ id, fill }: { id: string; fill: Fill }) {
  if (fill.type === "solid" || fill.type === "conic") return null;
  return <defs>{fill.type === "linear" ? <linearGradient id={id} gradientTransform={`rotate(${(fill.angle ?? 180) - 90} .5 .5)`}>{fill.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}</linearGradient>
    : <radialGradient id={id}>{fill.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}</radialGradient>}</defs>;
}
function PathView({ l, box }: { l: PathLayer; box: CSSProperties }) {
  const s = l.stroke, gid = `pg${l.id}`, fill = l.closed && l.fill ? (l.fill.type === "solid" ? l.fill.color : `url(#${gid})`) : "none";
  const cap = (k: "s" | "e", kind?: string) => kind && kind !== "none" ? <marker id={`${k}${l.id}`} viewBox="0 0 10 10" refX={kind === "arrow" ? (k === "e" ? 7 : 3) : 5} refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
    {kind === "arrow" ? <path d="M0 0 L10 5 L0 10 Z" fill={s.color} /> : kind === "dot" ? <circle cx="5" cy="5" r="4" fill={s.color} /> : <rect x="4" y="0" width="2" height="10" fill={s.color} />}</marker> : null;
  return <svg style={{ ...box, overflow: "visible" }} viewBox={`0 0 ${Math.max(1, l.w)} ${Math.max(1, l.h)}`} data-layer={l.id}>
    <defs>{cap("s", l.startCap)}{cap("e", l.endCap)}</defs>{l.fill && <Grad id={gid} fill={l.fill} />}
    <path d={pathD(l.pts, l.smooth, l.closed)} fill={fill} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={s.dash === "dashed" ? `${s.width * 3} ${s.width * 2}` : s.dash === "dotted" ? `0.1 ${s.width * 2}` : undefined}
      markerStart={l.startCap && l.startCap !== "none" ? `url(#s${l.id})` : undefined} markerEnd={l.endCap && l.endCap !== "none" ? `url(#e${l.id})` : undefined} /></svg>;
}

export function LayerView({ l, data, editing, onText }: { l: Layer; data: EventData; editing?: boolean; onText?: (t: string) => void }) {
  const box: CSSProperties = { position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h, display: l.hidden ? "none" : undefined,
    transform: `rotate(${l.rotation}deg) scale(${l.flipX ? -1 : 1},${l.flipY ? -1 : 1})`, transformOrigin: "center", ...effectStyle(l.effects, l.id) };
  const stroke = l.effects?.stroke;
  const duo = l.effects?.duotone ? <Duotone id={l.id} colors={l.effects.duotone} /> : null;
  switch (l.type) {
    case "text": {
      const fx = l.effects?.textFx ? textFxShadow(l.effects.textFx, l.size) : null;
      const style: CSSProperties = { ...box, fontFamily: `'${l.font}', Inter, sans-serif`, fontSize: l.size, fontWeight: l.weight, fontStyle: l.italic ? "italic" : "normal", lineHeight: l.lineHeight,
        letterSpacing: l.letterSpacing, textAlign: l.align, textTransform: l.transform ?? "none", textDecoration: l.underline ? "underline" : "none", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
        display: l.hidden ? "none" : "flex", flexDirection: "column", justifyContent: l.valign === "middle" ? "center" : l.valign === "bottom" ? "flex-end" : "flex-start",
        color: l.fill && l.fill.type !== "solid" ? "transparent" : fx?.color ?? l.color, WebkitTextStroke: fx?.stroke ?? (stroke ? `${stroke.width}px ${stroke.color}` : undefined), textShadow: fx?.textShadow };
      const inner: CSSProperties = l.fill && l.fill.type !== "solid" ? { backgroundImage: fillCss(l.fill), WebkitBackgroundClip: "text", backgroundClip: "text" } : {};
      const txt = resolveText(l, data);
      return <div style={style} data-layer={l.id}><span style={{ ...inner, background: l.highlight ? l.highlight : inner.backgroundImage ? undefined : "none", backgroundImage: inner.backgroundImage, padding: l.highlight ? "0.05em 0.25em" : undefined, outline: "none" }}
        contentEditable={editing} suppressContentEditableWarning onBlur={e => onText?.(fromFriendly(e.currentTarget.innerText))}>{editing ? toFriendly(l.text) : txt}</span></div>;
    }
    case "image": {
      const r = l.mask === "circle" || l.mask === "ellipse" ? "50%" : l.mask === "rounded" ? Math.min(l.w, l.h) * 0.08 : radiusCss(l.effects);
      const c = l.crop;
      const img: CSSProperties = c ? { position: "absolute", left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%`, width: `${100 / c.w}%`, height: `${100 / c.h}%`, objectFit: "fill", pointerEvents: "none" }
        : { width: "100%", height: "100%", objectFit: l.fit, objectPosition: `${l.focusX}% ${l.focusY}%`, transform: `scale(${l.zoom})`, transformOrigin: `${l.focusX}% ${l.focusY}%`, pointerEvents: "none" };
      return <div style={{ ...box, overflow: "hidden", borderRadius: r, outline: stroke ? `${stroke.width}px ${stroke.dash ?? "solid"} ${stroke.color}` : undefined, ...eraseMask(l.w, l.h, l.erase) }} data-layer={l.id}>
        {duo}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={l.asset.src === COVER_PLACEHOLDER ? data["event.cover_image"] ?? l.asset.sample ?? "/assets/gd/oe-sunset.webp" : assetSrc(l.asset)} alt="" draggable={false} crossOrigin="anonymous" style={img} />
        {(l.effects?.vignette || l.effects?.innerShadow) && <div style={{ position: "absolute", inset: 0, borderRadius: r, pointerEvents: "none", boxShadow: inset(l.effects),
          background: l.effects?.vignette ? `radial-gradient(ellipse at center, transparent ${Math.max(10, 70 - l.effects.vignette / 2)}%, rgba(0,0,0,${(l.effects.vignette / 100).toFixed(2)}) 100%)` : undefined }} />}</div>;
    }
    case "shape": {
      if (l.shape === "rect" || l.shape === "ellipse") return <div style={{ ...box, background: fillCss(l.fill), borderRadius: l.shape === "ellipse" ? "50%" : radiusCss(l.effects), boxShadow: inset(l.effects), border: stroke ? `${stroke.width}px ${stroke.dash ?? "solid"} ${stroke.color}` : undefined, boxSizing: "border-box" }} data-layer={l.id} />;
      const d = l.shape === "custom" ? l.d ?? "" : SHAPES[l.shape] ?? "", evenodd = l.shape === "custom";
      if (l.fill.type === "conic" && !l.lineOnly) return <div style={{ ...box, background: fillCss(l.fill), ...pathMask(d, evenodd) }} data-layer={l.id} />;
      const gid = `g${l.id}`, fill = l.fill.type === "solid" ? l.fill.color : `url(#${gid})`, line = l.shape === "line" || l.lineOnly;
      return <svg style={box} viewBox="0 0 100 100" preserveAspectRatio="none" data-layer={l.id}><Grad id={gid} fill={l.fill} />
        <path d={d} fill={line ? "none" : fill} fillRule={evenodd ? "evenodd" : undefined} stroke={line ? (l.fill.type === "solid" ? l.fill.color : fill) : stroke?.color}
          strokeWidth={line ? Math.max(1, stroke?.width ?? 4) : stroke ? stroke.width : 0} strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" strokeDasharray={stroke?.dash === "dashed" ? "6 4" : stroke?.dash === "dotted" ? "1 3" : undefined} /></svg>;
    }
    case "qr": case "barcode": return <CodeView l={l} data={data} box={box} />;
    case "drawing": {
      const mid = `dm${l.id}`;
      return <svg style={box} viewBox={`0 0 ${l.w} ${l.h}`} data-layer={l.id}>
        <defs>{l.paths.some(p => p.brush === "airbrush") && <filter id={`ab${l.id}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={Math.max(2, Math.max(...l.paths.map(p => p.width)) / 3)} /></filter>}
          {l.erase?.length ? <mask id={mid} maskUnits="userSpaceOnUse" x={0} y={0} width={l.w} height={l.h}><rect width={l.w} height={l.h} fill="#fff" />{l.erase.map((e, i) => <path key={i} d={e.d} stroke="#000" strokeWidth={e.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}</mask> : null}</defs>
        <g mask={l.erase?.length ? `url(#${mid})` : undefined}>{l.paths.map((p, i) => <path key={i} d={p.d} stroke={p.color} strokeWidth={p.brush === "airbrush" ? p.width * 1.6 : p.width} fill="none"
          strokeOpacity={p.brush === "highlighter" ? Math.min(p.opacity, 0.4) : p.brush === "airbrush" ? Math.min(p.opacity, 0.55) : p.opacity}
          strokeLinecap={p.brush === "highlighter" || p.brush === "marker" ? "square" : "round"} strokeLinejoin="round"
          filter={p.brush === "airbrush" ? `url(#ab${l.id})` : undefined} style={p.brush === "highlighter" ? { mixBlendMode: "multiply" } : undefined} />)}</g></svg>;
    }
    case "icon": {
      if (l.svg) return <div style={{ ...box, color: l.color, display: l.hidden ? "none" : "grid", placeItems: "center" }} data-layer={l.id}>
        <svg viewBox={`0 0 ${l.svg.w} ${l.svg.h}`} width="100%" height="100%" dangerouslySetInnerHTML={{ __html: sanitizeSvg(l.svg.body) }} /></div>;
      const I = icons[l.icon as keyof typeof icons]; return <div style={{ ...box, color: l.color, display: l.hidden ? "none" : "grid", placeItems: "center" }} data-layer={l.id}>{I ? <I width="100%" height="100%" strokeWidth={1.75} /> : null}</div>;
    }
    case "path": return <PathView l={l} box={box} />;
    case "widget": {
      // Widget text supports the same {{event.*}} placeholders as text layers.
      const props = Object.fromEntries(Object.entries(l.props).map(([k, v]) => [k, typeof v === "string" ? fillPlaceholders(v, data) : v]));
      return <WidgetView l={{ ...l, props }} style={box} />;
    }
  }
}

function CodeView({ l, data, box }: { l: Extract<Layer, { type: "qr" | "barcode" }>; data: EventData; box: CSSProperties }) {
  const value = resolveText(l, data);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    // Q45-S01: colours come from the stored design — validated before they reach SVG attributes, and the output is sanitised.
    if (l.type === "barcode") { try { const s = sanitizeSvg(code128Svg(value.replace(/[^\x20-\x7e]/g, "").slice(0, 80) || "GALADOCK", { height: 100, color: safeSvgColor(l.fg) })); queueMicrotask(() => { if (live) setSvg(s); }); } catch { /* invalid */ } }
    else void QRCode.toString(value || " ", { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: l.fg, light: l.bg } }).then(s => { if (live) setSvg(sanitizeSvg(s)); }).catch(() => { /* invalid colour */ });
    return () => { live = false; };
  }, [value, l.fg, l.bg, l.type]);
  return <div style={{ ...box, background: l.bg, display: box.display ?? "grid", gridTemplateRows: l.label ? "1fr auto" : "1fr", padding: l.type === "barcode" ? 4 : 0 }} data-layer={l.id}>
    <div style={{ width: "100%", height: "100%" }} className="ms-code" dangerouslySetInnerHTML={{ __html: svg }} />
    {l.label && <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: Math.max(10, l.w * 0.075), color: l.fg, paddingBottom: 4 }}>{l.label}</div>}
  </div>;
}
