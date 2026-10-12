import type { CSSProperties, PointerEvent as RPE, ReactNode } from "react";
import { icons as lucide } from "lucide-react";
import { WidgetView } from "@/components/design-kit/widget-view";
import { pathD } from "@/lib/media/path";
import { fillCss } from "@/lib/media/render";
import type { Fill, WidgetLayer } from "@/lib/media/document";

/**
 * Design layer for the venue / event map studio: the same libraries as Media Studio (icons, emoji, symbols, shapes, fonts, widgets,
 * colours, gradients, glow/shadow) as map elements. Coordinates are map units (10 = 1 m), like every other MapEl.
 *   glyph  — icon (embedded SVG or Lucide name), emoji or symbol, sized by w/h
 *   shape  — library shape (SVG path in a 0–100 box) with fill/gradient and outline
 *   text   — styled text in any Google font
 *   curve  — bendy line / closed curve through absolute points
 *   widget — info card or widget (signage, timelines, line-ups…)
 */
export type DesignStyle = { color?: string; fill?: Fill; stroke?: string; strokeW?: number; dash?: "solid" | "dashed" | "dotted"; opacity?: number;
  glow?: { blur: number; color: string } | null; shadow?: { x: number; y: number; blur: number; color: string } | null };
export type DesignEl = {
  type: "glyph" | "shape" | "text" | "curve" | "widget"; id?: string; label: string; x?: number; y?: number; w?: number; h?: number; rot?: number; hidden?: boolean; locked?: boolean; layer?: string;
  glyph?: { kind: "icon" | "emoji" | "symbol"; name?: string; body?: string; vw?: number; vh?: number; char?: string };
  d?: string; lineOnly?: boolean;
  font?: string; weight?: number; italic?: boolean; size?: number; align?: "start" | "middle" | "end";
  points?: number[][]; smooth?: boolean; closed?: boolean; endCap?: "none" | "arrow" | "dot";
  widget?: Pick<WidgetLayer, "widget" | "variant" | "theme" | "props">;
  style?: DesignStyle;
};
export const DESIGN_TYPES = new Set(["glyph", "shape", "text", "curve", "widget"]);
export const isDesignEl = (e: { type: string }): e is DesignEl => DESIGN_TYPES.has(e.type);

const filterOf = (s?: DesignStyle) => {
  const f: string[] = [];
  if (s?.shadow) f.push(`drop-shadow(${s.shadow.x}px ${s.shadow.y}px ${s.shadow.blur}px ${s.shadow.color})`);
  if (s?.glow) f.push(`drop-shadow(0 0 ${s.glow.blur}px ${s.glow.color})`, `drop-shadow(0 0 ${Math.round(s.glow.blur / 2)}px ${s.glow.color})`);
  return f.length ? f.join(" ") : undefined;
};
const dashOf = (s?: DesignStyle) => s?.dash === "dashed" ? `${(s.strokeW ?? 2) * 3} ${(s.strokeW ?? 2) * 2}` : s?.dash === "dotted" ? `0.1 ${(s.strokeW ?? 2) * 2}` : undefined;

/** SVG renderer for a design element inside the map's <svg>. */
export function DesignElView({ e, selected, onDown }: { e: DesignEl; selected?: boolean; onDown?: (ev: RPE<SVGGElement>) => void }) {
  if (e.hidden) return null;
  const x = e.x ?? 0, y = e.y ?? 0, w = Math.max(1, e.w ?? 40), h = Math.max(1, e.h ?? 40), s = e.style ?? {};
  const cx = x + w / 2, cy = y + h / 2;
  const g: CSSProperties = { filter: filterOf(s), opacity: s.opacity ?? 1, cursor: onDown ? "move" : undefined };
  const rot = e.rot ? `rotate(${e.rot} ${cx} ${cy})` : undefined;
  const outline = selected ? <rect x={x} y={y} width={w} height={h} fill="none" stroke="#1a1af2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" /> : null;
  let body: ReactNode = null;
  switch (e.type) {
    case "glyph": {
      const k = e.glyph?.kind;
      if (k === "icon" && e.glyph?.body) body = <svg x={x} y={y} width={w} height={h} viewBox={`0 0 ${e.glyph.vw ?? 24} ${e.glyph.vh ?? 24}`} color={s.color ?? "#090a2e"} dangerouslySetInnerHTML={{ __html: e.glyph.body }} />;
      else if (k === "icon") { const I = lucide[(e.glyph?.name ?? "Info") as keyof typeof lucide] ?? lucide.Info; body = <I x={x} y={y} width={w} height={h} color={s.color ?? "#090a2e"} strokeWidth={1.8} />; }
      else body = <text x={cx} y={cy} fontSize={h * 0.86} textAnchor="middle" dominantBaseline="central" fill={s.color ?? "#090a2e"}
        fontFamily={k === "emoji" ? "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif" : "Inter,'Segoe UI Symbol',sans-serif"}>{e.glyph?.char}</text>;
      break;
    }
    case "shape": {
      const gid = `dg${e.id ?? `${x}-${y}`}`, f = s.fill ?? { type: "solid", color: s.color ?? "#2f6bff" };
      const paint = f.type === "solid" ? f.color : `url(#${gid})`;
      body = <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
        {f.type === "linear" && <defs><linearGradient id={gid} gradientTransform={`rotate(${(f.angle ?? 180) - 90} .5 .5)`}>{f.stops.map((st, i) => <stop key={i} offset={st.offset} stopColor={st.color} />)}</linearGradient></defs>}
        {(f.type === "radial" || f.type === "conic") && <defs><radialGradient id={gid}>{f.stops.map((st, i) => <stop key={i} offset={st.offset} stopColor={st.color} />)}</radialGradient></defs>}
        <path d={e.d ?? "M0 0 H100 V100 H0 Z"} fill={e.lineOnly ? "none" : paint} fillRule="evenodd" stroke={e.lineOnly ? paint : s.stroke ?? "none"} strokeWidth={e.lineOnly ? s.strokeW ?? 3 : s.stroke ? s.strokeW ?? 2 : 0}
          vectorEffect="non-scaling-stroke" strokeDasharray={dashOf(s)} strokeLinecap="round" strokeLinejoin="round" /></svg>;
      break;
    }
    case "text": {
      const size = e.size ?? 24, anchor = e.align ?? "middle";
      body = <text x={anchor === "start" ? x : anchor === "end" ? x + w : cx} y={cy} fontSize={size} fontWeight={e.weight ?? 700} fontStyle={e.italic ? "italic" : undefined} fontFamily={`'${e.font ?? "Inter"}', Inter, sans-serif`}
        textAnchor={anchor} dominantBaseline="central" fill={s.fill && s.fill.type === "solid" ? s.fill.color : s.color ?? "#090a2e"} stroke={s.stroke} strokeWidth={s.stroke ? s.strokeW ?? 1 : 0} paintOrder="stroke">{e.label}</text>;
      break;
    }
    case "curve": {
      const pts = (e.points ?? []).map(([px, py]) => ({ x: px!, y: py! })), col = s.color ?? "#090a2e", sw = s.strokeW ?? 4, mid = `dm${e.id ?? x}`;
      body = <>{e.endCap && e.endCap !== "none" && <defs><marker id={mid} viewBox="0 0 10 10" refX={e.endCap === "arrow" ? 7 : 5} refY="5" markerWidth="4" markerHeight="4" orient="auto">
        {e.endCap === "arrow" ? <path d="M0 0 L10 5 L0 10 Z" fill={col} /> : <circle cx="5" cy="5" r="4" fill={col} />}</marker></defs>}
        <path d={pathD(pts, e.smooth ?? true, !!e.closed)} fill={e.closed && s.fill ? (s.fill.type === "solid" ? s.fill.color : fillCss(s.fill)) : "none"} stroke={col} strokeWidth={sw}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashOf(s)} markerEnd={e.endCap && e.endCap !== "none" ? `url(#${mid})` : undefined} /></>;
      return <g className="vm-design" style={g} onPointerDown={onDown}>{body}{selected && pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sw * 1.4 + 2} fill="#fff" stroke="#1a1af2" vectorEffect="non-scaling-stroke" />)}</g>;
    }
    case "widget": {
      if (!e.widget) return null;
      const l: WidgetLayer = { id: e.id ?? "w", name: e.label, type: "widget", x: 0, y: 0, w, h, rotation: 0, ...e.widget };
      body = <foreignObject x={x} y={y} width={w} height={h}><WidgetView l={l} style={{ width: "100%", height: "100%", display: "block" }} /></foreignObject>;
      break;
    }
  }
  return <g className="vm-design" style={g} transform={rot} onPointerDown={onDown}>{body}{outline}</g>;
}
