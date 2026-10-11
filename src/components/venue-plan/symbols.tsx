import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Accessibility, BusFront, Info, TrainFront, Camera, Lightbulb, Cctv, FireExtinguisher, Users, Cross } from "lucide-react";

/**
 * Top-down, architectural-style plan symbols for the asset catalogue. Everything is drawn in the element's local (unrotated) frame in map units
 * (10 = 1 m); the caller applies rotation. Repeated marks (bays, cubicles, pitches) are capped so very large areas stay fast.
 */
export type Box = { x: number; y: number; w: number; h: number };
export type ArtCtx = Box & { fill: string; stroke: string; sw: number; tinted: boolean; detail: boolean };
export type Art = { body: ReactNode; dark?: boolean; noIcon?: boolean; free?: Box };

export const range = (n: number) => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => i);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// Rounded so server and browser produce identical markup (large-argument sin differs in the last digits across engines).
const rnd = (i: number) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return Math.round((s - Math.floor(s)) * 1e4) / 1e4; };
const CAP = 480;
const INK = "#14172e", DECK = "#2b2f4a", ASPHALT = "#e3e6ee", LINE = "#ffffff";

/** Lucide icon nested in plan SVG (inline size beats the global `.ws-app svg` sizing rule). */
export function Ic({ I, cx, cy, s, color, sw = 2 }: { I: LucideIcon; cx: number; cy: number; s: number; color: string; sw?: number }) {
  return <I x={cx - s / 2} y={cy - s / 2} width={s} height={s} color={color} strokeWidth={sw} className="vp-ic" style={{ width: s, height: s }} aria-hidden="true" />;
}

const pad = (c: ArtCtx, p: { fill?: string; stroke?: string; rx?: number; dash?: string; sw?: number; opacity?: number } = {}) =>
  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={p.rx ?? Math.min(3, c.w / 8, c.h / 8)} fill={p.fill ?? c.fill} stroke={p.stroke ?? c.stroke} strokeWidth={p.sw ?? c.sw} strokeDasharray={p.dash} opacity={p.opacity} />;
const over = (c: ArtCtx, pattern: string, opacity = 1, rx?: number) =>
  <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={rx ?? Math.min(3, c.w / 8, c.h / 8)} fill={`url(#${pattern})`} opacity={opacity} pointerEvents="none" />;
/** Striped awning band with a scalloped leading edge. */
function awning(x: number, y: number, w: number, d: number, col: string, key = "aw") {
  const n = Math.max(4, Math.round(w / 5)), sw = w / n, r = Math.min(sw / 2, d * 0.35);
  const scallop = `M${x} ${y + d}` + range(n).map(() => ` a${sw / 2} ${r} 0 0 0 ${sw} 0`).join("");
  return <g key={key}>{range(n).map(i => <rect key={i} x={x + i * sw} y={y} width={sw + 0.05} height={d} fill={i % 2 ? "#fff" : col} />)}
    <path d={scallop} fill="none" stroke={col} strokeWidth={0.6} />
    <rect x={x} y={y} width={w} height={d} fill="none" stroke={col} strokeWidth={0.5} /></g>;
}
const chevrons = (cx: number, cy: number, s: number, dir: 1 | -1, col: string, key: string | number) =>
  <path key={key} d={`M${cx - s} ${cy + (dir * s) / 2} L${cx} ${cy - (dir * s) / 2} L${cx + s} ${cy + (dir * s) / 2}`} fill="none" stroke={col} strokeWidth={Math.max(0.5, s * 0.35)} strokeLinecap="round" strokeLinejoin="round" />;
function treeGlyph(cx: number, cy: number, r: number, i: number, key: string | number) {
  const lobes = 6;
  return <g key={key}>
    <ellipse cx={cx + r * 0.22} cy={cy + r * 0.28} rx={r * 1.02} ry={r * 0.92} fill="#0d3b1a" opacity={0.12} />
    {range(lobes).map(j => { const a = (j / lobes) * Math.PI * 2 + rnd(i + j) * 0.4; return <circle key={j} cx={cx + Math.cos(a) * r * 0.42} cy={cy + Math.sin(a) * r * 0.42} r={r * 0.62} fill="#8cc576" />; })}
    <circle cx={cx} cy={cy} r={r * 0.7} fill="#9fd287" />
    <circle cx={cx - r * 0.25} cy={cy - r * 0.28} r={r * 0.32} fill="#c4e6b3" opacity={0.85} />
    <circle cx={cx} cy={cy} r={r * 0.95} fill="none" stroke="#4c9a2a" strokeWidth={Math.max(0.3, r * 0.05)} opacity={0.55} />
    <circle cx={cx} cy={cy} r={Math.max(0.6, r * 0.09)} fill="#6b4f2a" opacity={0.7} /></g>;
}
/** Car-park bays laid out as double-loaded aisles with flow arrows. */
function bays(c: ArtCtx, bw: number, accessible: boolean) {
  const bd = 50, aisle = 60, m = 4, H = c.h - 2 * m, W = c.w - 2 * m, nb = Math.min(80, Math.floor(W / bw));
  if (nb < 1 || H < bd * 0.8) return null;
  const mods: { y: number; rows: ("down" | "up")[]; aisleY?: number }[] = [];
  const modH = bd * 2 + aisle, nMod = Math.floor(H / modH);
  let used = 0;
  for (let j = 0; j < nMod; j++) { mods.push({ y: j * modH, rows: ["down", "up"], aisleY: j * modH + bd + aisle / 2 }); used += modH; }
  if (H - used >= bd + aisle * 0.6) { mods.push({ y: used, rows: ["down"], aisleY: used + bd + Math.min(aisle, H - used - bd) / 2 }); used += Math.min(H - used, bd + aisle); }
  else if (H - used >= bd) { mods.push({ y: used, rows: ["down"] }); used += bd; }
  const oy = c.y + m + (H - used) / 2, ox = c.x + m + (W - nb * bw) / 2, out: ReactNode[] = [];
  let count = 0;
  mods.forEach((md, j) => {
    md.rows.forEach((dir, ri) => {
      const y0 = oy + md.y + (dir === "down" ? 0 : bd + aisle);
      out.push(<line key={`b${j}${ri}`} x1={ox} x2={ox + nb * bw} y1={dir === "down" ? y0 : y0 + bd} y2={dir === "down" ? y0 : y0 + bd} stroke={LINE} strokeWidth={1.2} />);
      range(nb + 1).forEach(i => out.push(<line key={`l${j}${ri}${i}`} x1={ox + i * bw} x2={ox + i * bw} y1={y0} y2={y0 + bd} stroke={LINE} strokeWidth={1.2} />));
      range(nb).forEach(i => {
        if (count++ > CAP) return;
        if (accessible) {
          out.push(<rect key={`h${j}${ri}${i}`} x={ox + i * bw + bw - 12} y={y0 + 1} width={11} height={bd - 2} fill="url(#vp-hatch-blue)" />);
          if (c.detail && nb * md.rows.length * mods.length <= 60) out.push(<Ic key={`w${j}${ri}${i}`} I={Accessibility} cx={ox + i * bw + (bw - 12) / 2} cy={y0 + bd / 2} s={Math.min(16, bw - 16)} color="#0369a1" />);
        }
      });
    });
    if (md.aisleY !== undefined) {
      const ay = oy + md.aisleY, n = Math.max(1, Math.floor((nb * bw) / 90)), dir = j % 2 ? -1 : 1;
      range(n).forEach(i => { const ax = ox + ((i + 0.5) * nb * bw) / n;
        out.push(<path key={`a${j}${i}`} d={`M${ax - 9 * dir} ${ay} H${ax + 5 * dir} M${ax + 1 * dir} ${ay - 4} L${ax + 6 * dir} ${ay} L${ax + 1 * dir} ${ay + 4}`} fill="none" stroke={LINE} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />); });
    }
  });
  return <g>{out}</g>;
}

/** Plan art for an area asset. Returns the drawing plus where its label/emblem can sit. */
export function areaArt(key: string, c: ArtCtx): Art {
  const { x, y, w, h, stroke } = c, m = Math.min(w, h);
  switch (key) {
    case "stage": {
      const lip = clamp(h * 0.09, 2, 7), sw = clamp(w * 0.1, 8, 26), sh = clamp(h * 0.16, 5, 14), wing = clamp(w * 0.07, 2, 14);
      return { dark: true, noIcon: m < 30, free: { x: x + wing, y, w: w - wing * 2, h: h - lip }, body: <>
        {[x + w * 0.05, x + w * 0.95 - sw].map((sx, i) => <g key={i}><rect x={sx} y={y + h - 1} width={sw} height={sh} rx={0.8} fill="#4a5277" />
          {range(3).map(j => <line key={j} x1={sx + 0.6} x2={sx + sw - 0.6} y1={y + h - 1 + (sh * (j + 1)) / 4} y2={y + h - 1 + (sh * (j + 1)) / 4} stroke="#9aa1c4" strokeWidth={0.5} />)}</g>)}
        <rect x={x} y={y} width={w} height={h} rx={1.6} fill={DECK} stroke={c.tinted ? stroke : INK} strokeWidth={c.sw} />
        <rect x={x} y={y} width={w} height={h} rx={1.6} fill="url(#vp-deck)" />
        <rect x={x} y={y} width={wing} height={h - lip} fill={INK} opacity={0.55} /><rect x={x + w - wing} y={y} width={wing} height={h - lip} fill={INK} opacity={0.55} />
        <rect x={x} y={y + h - lip} width={w} height={lip} fill="#3d4266" />
        <line x1={x + 0.8} x2={x + w - 0.8} y1={y + h - lip} y2={y + h - lip} stroke="#f5b83d" strokeWidth={Math.max(0.5, lip * 0.12)} />
        <path d={`M${x + w / 2 - lip * 0.5} ${y + h - lip * 0.25} L${x + w / 2} ${y + h - lip * 0.85} L${x + w / 2 + lip * 0.5} ${y + h - lip * 0.25}Z`} fill="#f5b83d" /></> };
    }
    case "catwalk": {
      const vert = h >= w, lip = clamp(m * 0.12, 1.5, 5);
      return { dark: true, noIcon: true, body: <>
        <rect x={x} y={y} width={w} height={h} rx={1.2} fill={DECK} stroke={INK} strokeWidth={c.sw} /><rect x={x} y={y} width={w} height={h} fill="url(#vp-deck)" />
        {vert ? <line x1={x + w / 2} x2={x + w / 2} y1={y + 4} y2={y + h - 4} stroke="#ffffff55" strokeWidth={0.6} strokeDasharray="3 3" />
          : <line y1={y + h / 2} y2={y + h / 2} x1={x + 4} x2={x + w - 4} stroke="#ffffff55" strokeWidth={0.6} strokeDasharray="3 3" />}
        {vert ? <rect x={x} y={y + h - lip} width={w} height={lip} fill="#f5b83d" opacity={0.85} /> : <rect x={x + w - lip} y={y} width={lip} height={h} fill="#f5b83d" opacity={0.85} />}</> };
    }
    case "dj_booth": {
      const r = Math.min(w * 0.14, h * 0.26);
      return { dark: true, noIcon: true, free: { x, y: y + h * 0.7, w, h: h * 0.3 }, body: <>
        <rect x={x} y={y} width={w} height={h} rx={1.2} fill={DECK} stroke={INK} strokeWidth={c.sw} />
        <rect x={x} y={y + h * 0.82} width={w} height={h * 0.18} fill={INK} /><line x1={x} x2={x + w} y1={y + h * 0.82} y2={y + h * 0.82} stroke="#7c4dff" strokeWidth={0.5} />
        {[0.24, 0.76].map(f => <g key={f}><circle cx={x + w * f} cy={y + h * 0.42} r={r} fill="#3d4266" stroke="#9aa1c4" strokeWidth={0.4} /><circle cx={x + w * f} cy={y + h * 0.42} r={r * 0.2} fill="#c9cede" /></g>)}
        <rect x={x + w * 0.42} y={y + h * 0.2} width={w * 0.16} height={h * 0.44} rx={0.6} fill="#3d4266" stroke="#9aa1c4" strokeWidth={0.3} /></> };
    }
    case "foh": {
      const n = clamp(Math.floor((w * 0.7) / 2.4), 3, 40);
      return { noIcon: true, free: { x, y: y + h * 0.58, w, h: h * 0.42 }, body: <>
        {pad(c, { dash: "3 2" })}
        <rect x={x + w * 0.12} y={y + h * 0.14} width={w * 0.76} height={h * 0.38} rx={1} fill="#3d4266" />
        {range(n).map(i => { const fx = x + w * 0.16 + (i * w * 0.68) / (n - 1 || 1); return <g key={i}><line x1={fx} x2={fx} y1={y + h * 0.2} y2={y + h * 0.46} stroke="#c9cede" strokeWidth={0.35} /><rect x={fx - 0.6} y={y + h * (0.24 + rnd(i) * 0.16)} width={1.2} height={1} fill="#f5b83d" /></g>; })}
        {[0.38, 0.62].map(f => <circle key={f} cx={x + w * f} cy={y + h * 0.66} r={Math.min(2.4, h * 0.08)} fill="#fff" stroke={stroke} strokeWidth={0.5} />)}</> };
    }
    case "screen":
      return { dark: true, noIcon: true, body: <>
        <rect x={x - 1} y={y + h} width={2.5} height={Math.max(1.5, h * 0.4)} fill="#4a5277" /><rect x={x + w - 1.5} y={y + h} width={2.5} height={Math.max(1.5, h * 0.4)} fill="#4a5277" />
        <rect x={x} y={y} width={w} height={h} rx={0.8} fill={INK} stroke={c.tinted ? stroke : "#000"} strokeWidth={c.sw * 0.7} />
        <rect x={x + 0.8} y={y + 0.8} width={Math.max(0, w - 1.6)} height={Math.max(0, h - 1.6)} rx={0.4} fill="url(#vp-led)" /></> };
    case "bar": {
      const back = h * 0.24, ctrY = y + h * 0.46, ctrH = h * 0.2, stoolZ = h - (ctrY - y) - ctrH, r = clamp(stoolZ * 0.26, 1.2, 3.2);
      const n = Math.max(2, Math.min(60, Math.floor((w - 6) / Math.max(7, r * 3.2))));
      return { noIcon: true, free: { x, y: y + back, w, h: ctrY - y - back + ctrH }, body: <>
        {pad(c, { fill: "#fff8ec" })}
        <rect x={x} y={y} width={w} height={back} rx={Math.min(3, w / 8, h / 8)} fill="#f3d9a8" stroke={stroke} strokeWidth={0.5} />
        {range(Math.min(120, Math.floor(w / 3))).map(i => <circle key={i} cx={x + 2 + i * 3} cy={y + back / 2} r={Math.min(0.9, back * 0.2)} fill={stroke} opacity={0.35 + rnd(i) * 0.4} />)}
        <rect x={x + 2} y={ctrY} width={w - 4} height={ctrH} rx={ctrH / 2} fill="#e3b26a" stroke="#b5741a" strokeWidth={0.6} />
        <line x1={x + 4} x2={x + w - 4} y1={ctrY + ctrH * 0.3} y2={ctrY + ctrH * 0.3} stroke="#fff" strokeWidth={0.35} opacity={0.6} />
        {range(n).map(i => <circle key={i} cx={x + 3 + ((i + 0.5) * (w - 6)) / n} cy={y + h - stoolZ / 2} r={r} fill="#fff" stroke={stroke} strokeWidth={0.6} />)}</> };
    }
    case "food_stall": case "merch": {
      const a = clamp(h * 0.3, 3, 14), merch = key === "merch";
      return { free: { x, y, w, h: h - a }, body: <>
        {pad(c)}
        {merch && <><line x1={x + w * 0.12} x2={x + w * 0.88} y1={y + (h - a) * 0.35} y2={y + (h - a) * 0.35} stroke={stroke} strokeWidth={0.6} />
          {range(Math.floor((w * 0.76) / 2.5)).map(i => <line key={i} x1={x + w * 0.13 + i * 2.5} x2={x + w * 0.13 + i * 2.5} y1={y + (h - a) * 0.35 - 1.3} y2={y + (h - a) * 0.35 + 1.3} stroke={stroke} strokeWidth={0.4} opacity={0.7} />)}</>}
        <line x1={x} x2={x + w} y1={y + h - a} y2={y + h - a} stroke={stroke} strokeWidth={1.2} />
        {awning(x, y + h - a, w, a, stroke)}</> };
    }
    case "market_stall": {
      const a = clamp(h * 0.22, 2.5, 8);
      return { noIcon: true, free: { x, y, w, h: h - a }, body: <>
        {pad(c, { fill: "#fff" })}
        <path d={`M${x} ${y} L${x + w / 2} ${y + (h - a) / 2} L${x + w} ${y} M${x} ${y + h - a} L${x + w / 2} ${y + (h - a) / 2} L${x + w} ${y + h - a}`} stroke={stroke} strokeWidth={0.5} fill="none" opacity={0.6} />
        <path d={`M${x} ${y} L${x + w / 2} ${y + (h - a) / 2} L${x} ${y + h - a}Z`} fill={c.fill} opacity={0.7} />
        <path d={`M${x + w} ${y} L${x + w / 2} ${y + (h - a) / 2} L${x + w} ${y + h - a}Z`} fill={c.fill} opacity={0.7} />
        {awning(x, y + h - a, w, a, stroke)}</> };
    }
    case "food_truck": {
      const cab = clamp(w * 0.2, 6, 24), wl = clamp(w * 0.12, 3, 9), wd = clamp(h * 0.1, 1, 3), a = clamp(h * 0.26, 3, 9);
      return { free: { x, y, w: w - cab, h: h - a }, body: <>
        {[0.2, 0.62].map(f => <g key={f}><rect x={x + w * f} y={y - wd * 0.6} width={wl} height={wd} rx={0.5} fill={INK} /><rect x={x + w * f} y={y + h - a - wd * 0.4} width={wl} height={wd} rx={0.5} fill={INK} /></g>)}
        <rect x={x} y={y} width={w} height={h - a} rx={Math.min(4, h * 0.15)} fill="#fff" stroke={stroke} strokeWidth={c.sw} />
        <rect x={x + w - cab} y={y} width={cab} height={h - a} rx={Math.min(4, h * 0.15)} fill={c.fill} stroke={stroke} strokeWidth={c.sw} />
        <rect x={x + w - cab * 0.38} y={y + (h - a) * 0.12} width={cab * 0.22} height={(h - a) * 0.76} rx={1} fill="#4a5277" opacity={0.75} />
        <rect x={x + 3} y={y + (h - a) * 0.15} width={w - cab - 6} height={(h - a) * 0.3} rx={0.6} fill={c.fill} opacity={0.8} />
        {awning(x + w * 0.12, y + h - a, w - cab - w * 0.18, a, stroke)}</> };
    }
    case "catering": {
      const b = clamp(m * 0.16, 3, 8);
      return { noIcon: true, body: <>
        {pad(c, { fill: "#fbf7ee" })}
        <rect x={x + 1} y={y + 1} width={w - 2} height={b} rx={0.6} fill="#e9e1cc" stroke={stroke} strokeWidth={0.4} />
        <rect x={x + 1} y={y + 1} width={b} height={h - 2} rx={0.6} fill="#e9e1cc" stroke={stroke} strokeWidth={0.4} />
        {range(4).map(i => <circle key={i} cx={x + b + 6 + i * b * 1.1} cy={y + 1 + b / 2} r={b * 0.32} fill="none" stroke={INK} strokeWidth={0.4} opacity={0.6} />)}
        <rect x={x + w * 0.4} y={y + h * 0.45} width={w * 0.42} height={b * 1.2} rx={0.8} fill="#e9e1cc" stroke={stroke} strokeWidth={0.4} /></> };
    }
    case "standing_area":
      return { body: <>{pad(c, { rx: 4 })}{over(c, "vp-crowd", c.tinted ? 0.5 : 0.9, 4)}
        <line x1={x + 3} x2={x + w - 3} y1={y + 1.6} y2={y + 1.6} stroke={stroke} strokeWidth={1.4} strokeDasharray="5 1.5" opacity={0.8} />
        {pad(c, { fill: "none", rx: 4 })}</> };
    case "vip_area": {
      const gold = c.tinted ? stroke : "#b8912f", ins = 2.4, per = 2 * (w + h - 4 * ins), n = Math.min(CAP, Math.max(4, Math.round(per / 22)));
      const at = (t: number) => { let d = t * per; const W = w - 2 * ins, H = h - 2 * ins;
        if (d < W) return [x + ins + d, y + ins]; d -= W; if (d < H) return [x + w - ins, y + ins + d]; d -= H; if (d < W) return [x + w - ins - d, y + h - ins]; d -= W; return [x + ins, y + h - ins - d]; };
      return { body: <>{pad(c, { rx: 4 })}<rect x={x} y={y} width={w} height={h} rx={4} fill="url(#vp-carpet)" />
        <rect x={x + ins} y={y + ins} width={w - ins * 2} height={h - ins * 2} rx={2} fill="none" stroke={gold} strokeWidth={0.9} strokeDasharray="3.5 1.2" />
        {range(n).map(i => { const [px, py] = at(i / n); return <circle key={i} cx={px} cy={py} r={1.35} fill="#fff" stroke={gold} strokeWidth={0.7} />; })}</> };
    }
    case "dance_floor":
      return { body: <>{pad(c, { fill: "#fff" })}{over(c, "vp-check", 1, 1)}<rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={1} fill="none" stroke={stroke} strokeWidth={0.5} opacity={0.6} />{pad(c, { fill: "none" })}</> };
    case "smoking_area":
      return { body: <>{pad(c, { dash: "4 2" })}{over(c, "vp-hatch", 1)}
        {[[x + 4, y + 4], [x + w - 4, y + h - 4]].map(([bx, by], i) => <circle key={i} cx={bx} cy={by} r={1.6} fill="#fff" stroke={stroke} strokeWidth={0.5} />)}</> };
    case "family_area":
      return { body: <>{pad(c, { rx: 6 })}<rect x={x + 2.5} y={y + 2.5} width={w - 5} height={h - 5} rx={5} fill="none" stroke={stroke} strokeWidth={0.6} strokeDasharray="0.1 2.4" strokeLinecap="round" />
        {range(Math.min(12, Math.floor((w * h) / 900))).map(i => <circle key={i} cx={x + 8 + rnd(i) * (w - 16)} cy={y + 8 + rnd(i + 9) * (h - 16)} r={1.4 + rnd(i + 3) * 1.4} fill={["#ffd66b", "#8cc5ff", "#ff9fc3"][i % 3]} opacity={0.75} />)}</> };
    case "quiet_room": case "green_room": case "backstage": case "control_room": {
      const door = clamp(w * 0.18, 6, 12);
      return { body: <>{pad(c)}{key === "backstage" && over(c, "vp-hatch", 0.7)}
        <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={Math.min(2, w / 10)} fill="none" stroke={stroke} strokeWidth={0.35} opacity={0.5} />
        <line x1={x + w * 0.2} x2={x + w * 0.2 + door} y1={y + h} y2={y + h} stroke="#fff" strokeWidth={c.sw + 0.6} />
        <path d={`M${x + w * 0.2} ${y + h} L${x + w * 0.2} ${y + h - door} A${door} ${door} 0 0 1 ${x + w * 0.2 + door} ${y + h}`} fill="none" stroke={stroke} strokeWidth={0.4} opacity={0.7} />
        {key === "green_room" && <path d={`M${x + w - 4} ${y + 4} h-${Math.min(18, w * 0.4)} v4 h${Math.min(18, w * 0.4) - 4} v${Math.min(14, h * 0.4)} h4Z`} fill="#fff" stroke={stroke} strokeWidth={0.5} />}
        {key === "control_room" && <><circle cx={x + w - 4} cy={y + 4} r={1.6} fill={stroke} /><circle cx={x + w - 4} cy={y + 4} r={3.4} fill="none" stroke={stroke} strokeWidth={0.4} opacity={0.6} /></>}</> };
    }
    case "lounge": case "accessible_seating": case "accessible_viewing": {
      if (key === "lounge") {
        const cw = 40, ch = 30, nx = Math.max(1, Math.floor(w / cw)), ny = Math.max(1, Math.floor(h / ch)), ox = x + (w - nx * cw) / 2, oy = y + (h - ny * ch) / 2;
        return { noIcon: true, body: <>{pad(c, { rx: 4 })}{range(Math.min(nx * ny, 80)).map(i => { const gx = ox + (i % nx) * cw, gy = oy + Math.floor(i / nx) * ch;
          return <g key={i}>{[gy + 3, gy + ch - 9].map((sy, j) => <g key={j}><rect x={gx + 8} y={sy} width={24} height={6} rx={2} fill="#fff" stroke={stroke} strokeWidth={0.6} />
            <rect x={gx + 8} y={j ? sy + 4 : sy} width={24} height={2} rx={1} fill={stroke} opacity={0.35} /></g>)}
            <rect x={gx + 14} y={gy + 12} width={12} height={6} rx={1} fill={c.fill} stroke={stroke} strokeWidth={0.5} /></g>; })}</> };
      }
      const ramp = clamp(w * 0.18, 8, 24), bw = 12, n = Math.min(40, Math.floor((w - ramp - 4) / (key === "accessible_seating" ? bw + 6 : bw + 2)));
      return { noIcon: true, free: { x: x + ramp, y, w: w - ramp, h }, body: <>
        <rect x={x} y={y} width={ramp} height={h} fill="#fff" stroke={stroke} strokeWidth={0.6} />
        {range(Math.floor(h / 4)).map(i => chevrons(x + ramp / 2, y + 3 + i * 4, Math.min(2.4, ramp * 0.2), -1, stroke, i)).slice(0, 30).map((p, i) => <g key={i} transform={`rotate(90 ${x + ramp / 2} ${y + 3 + i * 4})`} opacity={0.5}>{p}</g>)}
        <rect x={x + ramp} y={y} width={w - ramp} height={h} rx={1.5} fill={c.fill} stroke={stroke} strokeWidth={c.sw} />
        <path d={`M${x + ramp + 1.5} ${y + h - 1.5} V${y + 1.5} H${x + w - 1.5} V${y + h - 1.5}`} fill="none" stroke={stroke} strokeWidth={0.5} opacity={0.6} />
        {c.detail && range(n).map(i => { const bx = x + ramp + 3 + i * (key === "accessible_seating" ? bw + 6 : bw + 2);
          return <g key={i}><rect x={bx} y={y + h * 0.2} width={bw} height={Math.min(14, h * 0.6)} rx={1} fill="#fff" stroke={stroke} strokeWidth={0.5} />
            <Ic I={Accessibility} cx={bx + bw / 2} cy={y + h * 0.2 + Math.min(14, h * 0.6) / 2} s={Math.min(bw * 0.7, h * 0.45)} color={stroke} />
            {key === "accessible_seating" && <circle cx={bx + bw + 3} cy={y + h * 0.2 + Math.min(14, h * 0.6) / 2} r={2} fill="#fff" stroke={stroke} strokeWidth={0.5} />}</g>; })}</> };
    }
    case "sponsor":
      return { body: <>{pad(c, { dash: "5 2.5" })}<rect x={x + w * 0.62} y={y + h * 0.12} width={w * 0.28} height={h * 0.2} rx={1} fill={stroke} opacity={0.18} />
        <circle cx={x + 4} cy={y + 4} r={1.4} fill={stroke} /><path d={`M${x + 4} ${y + 4} l5 1.6 l-5 1.6Z`} fill={stroke} opacity={0.7} /></> };
    case "box_office": case "cloakroom": {
      const ctr = clamp(h * 0.22, 3, 8), n = Math.max(1, Math.min(20, Math.floor(w / 13)));
      return { noIcon: key === "cloakroom", free: { x, y, w, h: h - ctr }, body: <>{pad(c)}
        <rect x={x} y={y + h - ctr} width={w} height={ctr} fill="#fff" stroke={stroke} strokeWidth={0.6} />
        {key === "box_office" ? range(n).map(i => <rect key={i} x={x + ((i + 0.5) * w) / n - 3.5} y={y + h - ctr + 0.8} width={7} height={ctr - 1.6} rx={0.5} fill={stroke} opacity={0.25} />)
          : [0.3, 0.6].map(f => <g key={f}><line x1={x + 3} x2={x + w - 3} y1={y + (h - ctr) * f} y2={y + (h - ctr) * f} stroke={stroke} strokeWidth={0.7} />
            {range(Math.floor((w - 6) / 1.8)).map(i => <line key={i} x1={x + 3.5 + i * 1.8} x2={x + 3.5 + i * 1.8 + 0.6} y1={y + (h - ctr) * f - 1.8} y2={y + (h - ctr) * f + 1.8} stroke={stroke} strokeWidth={0.35} opacity={0.75} />)}</g>)}</> };
    }
    case "toilets": case "showers": {
      const n = clamp(Math.floor(w / 12), 1, 60), cw = w / n, ch = h * 0.66, r = Math.min(cw * 0.62, (h - ch) * 0.9), shower = key === "showers";
      return { noIcon: true, free: { x, y: y + ch, w, h: h - ch }, body: <>{pad(c, { fill: shower ? "#f2fbfb" : "#f6f7fb" })}
        {range(n).map(i => { const cx0 = x + i * cw;
          return <g key={i}><rect x={cx0} y={y} width={cw} height={ch} fill="#fff" stroke={stroke} strokeWidth={0.55} />
            {shower ? <><rect x={cx0 + cw * 0.15} y={y + ch * 0.12} width={cw * 0.7} height={ch * 0.7} fill="url(#vp-tile)" stroke={stroke} strokeWidth={0.3} />
              <circle cx={cx0 + cw / 2} cy={y + ch * 0.24} r={Math.min(cw, ch) * 0.1} fill={stroke} opacity={0.7} /><circle cx={cx0 + cw / 2} cy={y + ch * 0.6} r={0.6} fill={stroke} />
              <line x1={cx0 + 1} x2={cx0 + cw - 1} y1={y + ch} y2={y + ch} stroke={stroke} strokeWidth={0.6} strokeDasharray="1 0.8" /></>
              : <><rect x={cx0 + cw * 0.32} y={y + ch * 0.06} width={cw * 0.36} height={ch * 0.12} rx={0.4} fill={stroke} opacity={0.3} />
                <ellipse cx={cx0 + cw / 2} cy={y + ch * 0.36} rx={cw * 0.17} ry={ch * 0.18} fill="#fff" stroke={stroke} strokeWidth={0.5} />
                <line x1={cx0 + cw * 0.1} x2={cx0 + cw * 0.1 + r} y1={y + ch} y2={y + ch} stroke="#f6f7fb" strokeWidth={0.8} />
                <path d={`M${cx0 + cw * 0.1} ${y + ch} v${r} M${cx0 + cw * 0.1} ${y + ch + r} A${r} ${r} 0 0 0 ${cx0 + cw * 0.1 + r} ${y + ch}`} fill="none" stroke={stroke} strokeWidth={0.35} opacity={0.65} /></>}</g>; })}</> };
    }
    case "first_aid": {
      const s = m * 0.52, t = s * 0.34, cx = x + w / 2, cy = y + h / 2;
      return { noIcon: true, free: { x, y: y + h * 0.78, w, h: h * 0.22 }, body: <>{pad(c, { fill: "#fff" })}
        <rect x={x + 1.2} y={y + 1.2} width={w - 2.4} height={h - 2.4} rx={1.6} fill="none" stroke={stroke} strokeWidth={0.4} opacity={0.5} />
        <path d={`M${cx - t / 2} ${cy - s / 2}h${t}v${(s - t) / 2}h${(s - t) / 2}v${t}h-${(s - t) / 2}v${(s - t) / 2}h-${t}v-${(s - t) / 2}h-${(s - t) / 2}v-${t}h${(s - t) / 2}Z`} fill={stroke} /></> };
    }
    case "lockers": {
      const cols = clamp(Math.floor(w / 4), 1, 80), rows = h >= 12 ? 2 : 1, lw = w / cols, lh = h / rows;
      return { noIcon: true, body: <>{pad(c, { fill: "#fff" })}{range(cols * rows).map(i => { const lx = x + (i % cols) * lw, ly = y + Math.floor(i / cols) * lh;
        return <g key={i}><rect x={lx + 0.3} y={ly + 0.3} width={lw - 0.6} height={lh - 0.6} rx={0.3} fill={c.fill} stroke={stroke} strokeWidth={0.3} /><circle cx={lx + lw * 0.75} cy={ly + lh / 2} r={0.35} fill={stroke} /></g>; })}</> };
    }
    case "entrance": case "exit": case "security": {
      const sec = key === "security", n = clamp(Math.floor(w / (sec ? 15 : 12)), 1, 40), lw = w / n, dir = key === "exit" ? 1 : -1;
      return { noIcon: true, body: <>{pad(c, sec ? { fill: "#eef0f7", stroke: c.tinted ? stroke : "#2b2f4a" } : {})}
        {range(n - 1).map(i => <line key={i} x1={x + (i + 1) * lw} x2={x + (i + 1) * lw} y1={y + 0.5} y2={y + h - 0.5} stroke={sec ? "#2b2f4a" : stroke} strokeWidth={0.6} />)}
        {range(n).map(i => { const lx = x + (i + 0.5) * lw;
          return sec ? <g key={i}><rect x={lx - lw * 0.32} y={y + h * 0.42} width={lw * 0.64} height={Math.max(1, h * 0.14)} fill="none" stroke="#2b2f4a" strokeWidth={0.6} />
            <rect x={lx - lw * 0.38} y={y + h * 0.4} width={1.4} height={Math.max(1.4, h * 0.18)} fill="#2b2f4a" /><rect x={lx + lw * 0.38 - 1.4} y={y + h * 0.4} width={1.4} height={Math.max(1.4, h * 0.18)} fill="#2b2f4a" />
            <rect x={lx - lw * 0.28} y={y + h * 0.7} width={lw * 0.56} height={Math.max(1, h * 0.12)} rx={0.4} fill="#c9cede" /></g>
            : <g key={i}>{chevrons(lx, y + h * 0.5, Math.min(lw * 0.22, h * 0.25), dir as 1 | -1, stroke, "c")}<circle cx={x + i * lw + 1.2} cy={y + h / 2} r={0.7} fill={stroke} opacity={0.6} /></g>; })}</> };
    }
    case "fire_exit": {
      const lf = w / 2;
      return { noIcon: true, body: <>{pad(c, { fill: "#fff" })}
        <path d={`M${x} ${y + h} A${lf} ${lf} 0 0 1 ${x + lf} ${y + h - lf} M${x + w} ${y + h} A${lf} ${lf} 0 0 0 ${x + lf} ${y + h - lf}`} fill="none" stroke={stroke} strokeWidth={0.4} strokeDasharray="1 0.8" />
        <rect x={x} y={y + h - 1} width={w} height={1} fill={stroke} />{chevrons(x + w / 2, y + h * 0.42, Math.min(w * 0.18, h * 0.3), 1, stroke, "c")}</> };
    }
    case "car_park": case "accessible_parking": {
      const acc = key === "accessible_parking";
      return { noIcon: true, body: <>{pad(c, { fill: ASPHALT, stroke: c.tinted ? stroke : "#9aa1bd", rx: 2 })}{acc && pad(c, { fill: "#d8ecfb", stroke: "none", rx: 2, opacity: 0.6 })}
        {bays(c, acc ? 36 : 25, acc)}
        {m >= 40 && <g><rect x={x + 4} y={y + 4} width={12} height={12} rx={2.4} fill={acc ? "#0369a1" : "#1a1af2"} /><text x={x + 10} y={y + 14} textAnchor="middle" className="vp-badge" style={{ fontSize: 10 }}>P</text></g>}</> };
    }
    case "coach_drop": case "taxi_rank": {
      const kerb = clamp(h * 0.14, 2, 8), taxi = key === "taxi_rank", vl = taxi ? 45 : 120, vh = Math.min(taxi ? 18 : 25, (h - kerb) * 0.7);
      const n = Math.max(0, Math.min(30, Math.floor((w - 16) / (vl + 8)))), yc = y + kerb + (h - kerb) / 2;
      return { noIcon: true, body: <>{pad(c, { fill: ASPHALT, stroke: "#9aa1bd" })}
        <rect x={x} y={y} width={w} height={kerb} fill="#cfd5e3" />
        <rect x={x + 2} y={y + kerb + 1.5} width={w - 4} height={h - kerb - 3} fill="none" stroke="#f5b83d" strokeWidth={1} strokeDasharray={taxi ? "4 2" : undefined} />
        {!taxi && <path d={`M${x + 2} ${y + h - 2.5}` + range(Math.floor((w - 4) / 8)).map(i => ` L${x + 6 + i * 8} ${y + h - (i % 2 ? 2.5 : 6)}`).join("")} fill="none" stroke="#f5b83d" strokeWidth={0.6} opacity={0.8} />}
        {taxi && h > 14 && <text x={x + w - 6} y={yc} textAnchor="end" dy="0.35em" className="vp-paint" style={{ fontSize: Math.min(10, (h - kerb) * 0.4) }}>TAXI</text>}
        {range(n).map(i => { const vx = x + 8 + i * (vl + 8);
          return <g key={i}><rect x={vx} y={yc - vh / 2} width={vl} height={vh} rx={taxi ? 4 : 2.5} fill="#fff" stroke={stroke} strokeWidth={0.6} />
            <rect x={vx + vl * (taxi ? 0.62 : 0.88)} y={yc - vh / 2 + 1.2} width={vl * (taxi ? 0.14 : 0.07)} height={vh - 2.4} rx={1} fill="#4a5277" opacity={0.6} />
            {taxi ? <rect x={vx + vl * 0.18} y={yc - vh / 2 + 1.2} width={vl * 0.12} height={vh - 2.4} rx={1} fill="#4a5277" opacity={0.35} />
              : range(5).map(j => <rect key={j} x={vx + 6 + j * (vl * 0.16)} y={yc - vh / 2 + 2} width={vl * 0.08} height={vh - 4} rx={0.5} fill={stroke} opacity={0.12} />)}</g>; })}</> };
    }
    case "bike_rack": {
      const n = clamp(Math.floor(w / 10), 1, 60), sl = h * 0.5;
      return { noIcon: true, body: <>{pad(c, { fill: "#f1faf4" })}
        {range(n).map(i => { const sx = x + (i + 0.5) * (w / n);
          return <g key={i}><rect x={sx - 0.7} y={y + (h - sl) / 2} width={1.4} height={sl} rx={0.7} fill={stroke} />
            {[-2.6, 2.6].map(o => <g key={o} opacity={0.75}><line x1={sx + o} x2={sx + o} y1={y + h * 0.1} y2={y + h * 0.9} stroke="#4a5277" strokeWidth={0.5} />
              <ellipse cx={sx + o} cy={y + h * 0.2} rx={0.5} ry={h * 0.12} fill="none" stroke="#4a5277" strokeWidth={0.35} /><ellipse cx={sx + o} cy={y + h * 0.8} rx={0.5} ry={h * 0.12} fill="none" stroke="#4a5277" strokeWidth={0.35} /></g>)}</g>; })}</> };
    }
    case "grass":
      return { noIcon: true, body: <>{pad(c, { rx: 4 })}{over(c, "vp-mottle", 1, 4)}{over(c, "vp-grass", 1, 4)}</> };
    case "park": {
      const nt = clamp(Math.floor((w * h) / 2200), 3, 70);
      const path = `M${x} ${y + h * 0.7} C${x + w * 0.3} ${y + h * 0.45}, ${x + w * 0.6} ${y + h * 0.95}, ${x + w} ${y + h * 0.55}`;
      return { noIcon: true, body: <>{pad(c, { rx: 6 })}{over(c, "vp-mottle", 1, 6)}{over(c, "vp-grass", 1, 6)}
        <path d={path} fill="none" stroke="#e9dcb8" strokeWidth={Math.min(12, h * 0.07)} strokeLinecap="round" /><path d={path} fill="none" stroke="#f6eed8" strokeWidth={Math.min(9, h * 0.05)} strokeLinecap="round" />
        {range(nt).map(i => { const tx = x + 8 + rnd(i * 3 + 1) * (w - 16), ty = y + 8 + rnd(i * 7 + 2) * (h - 16), rr = clamp(m * 0.05, 4, 12) * (0.75 + rnd(i) * 0.5);
          return Math.abs(ty - (y + h * 0.7 - ((tx - x) / w) * h * 0.15)) < rr * 1.4 ? null : treeGlyph(tx, ty, rr, i, i); })}</> };
    }
    case "water":
      return { noIcon: true, body: <>{pad(c, { fill: "#cfe6fb", stroke: c.tinted ? stroke : "#5aa5e6", rx: Math.min(10, m / 4) })}
        <rect x={x} y={y} width={w} height={h} rx={Math.min(10, m / 4)} fill="url(#vp-water)" opacity={0.85} />
        <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={Math.min(8, m / 4)} fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.75} /></> };
    case "marquee": {
      const wide = w >= h, ins = 0, half = (wide ? h : w) / 2;
      const r1 = wide ? [x + half, y + h / 2] : [x + w / 2, y + half], r2 = wide ? [x + w - half, y + h / 2] : [x + w / 2, y + h - half];
      const seams = wide ? range(Math.floor((w - h) / 30)).map(i => x + half + (i + 1) * ((w - h) / (Math.floor((w - h) / 30) + 1))) : range(Math.floor((h - w) / 30)).map(i => y + half + (i + 1) * ((h - w) / (Math.floor((h - w) / 30) + 1)));
      const per = 2 * (w + h), np = Math.min(CAP, Math.floor(per / 24));
      const peg = (t: number) => { let d = t * per; const o = 4; if (d < w) return [x + d, y - o]; d -= w; if (d < h) return [x + w + o, y + d]; d -= h; if (d < w) return [x + w - d, y + h + o]; d -= w; return [x - o, y + h - d]; };
      return { noIcon: true, body: <>
        {range(np).map(i => { const [px, py] = peg((i + 0.5) / np); return <circle key={i} cx={px} cy={py} r={0.7} fill={stroke} opacity={0.6} />; })}
        {pad(c, { fill: "#fdfaf2", rx: 1 + ins })}
        <path d={`M${x} ${y} L${r1[0]} ${r1[1]} L${x} ${y + h} M${x + w} ${y} L${r2[0]} ${r2[1]} L${x + w} ${y + h} M${r1[0]} ${r1[1]} L${r2[0]} ${r2[1]}`} stroke={stroke} strokeWidth={0.8} fill="none" />
        <path d={wide ? `M${x} ${y} L${r1[0]} ${r1[1]} L${r2[0]} ${r2[1]} L${x + w} ${y}Z` : `M${x} ${y} L${r1[0]} ${r1[1]} L${r2[0]} ${r2[1]} L${x} ${y + h}Z`} fill={c.fill} opacity={0.55} />
        {seams.map((s, i) => wide ? <line key={i} x1={s} x2={s} y1={y} y2={y + h} stroke={stroke} strokeWidth={0.35} opacity={0.6} /> : <line key={i} y1={s} y2={s} x1={x} x2={x + w} stroke={stroke} strokeWidth={0.35} opacity={0.6} />)}</> };
    }
    case "camping": {
      const pt = 80, nx = Math.max(1, Math.floor(w / pt)), ny = Math.max(1, Math.floor(h / pt)), ox = x + (w - nx * pt) / 2, oy = y + (h - ny * pt) / 2;
      return { noIcon: true, body: <>{pad(c, { rx: 4 })}{over(c, "vp-grass", 0.8, 4)}
        {range(nx + 1).map(i => <line key={`v${i}`} x1={ox + i * pt} x2={ox + i * pt} y1={oy} y2={oy + ny * pt} stroke={stroke} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.6} />)}
        {range(ny + 1).map(i => <line key={`h${i}`} y1={oy + i * pt} y2={oy + i * pt} x1={ox} x2={ox + nx * pt} stroke={stroke} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.6} />)}
        {range(Math.min(nx * ny, CAP)).map(i => { if (rnd(i) < 0.3) return null; const tx = ox + (i % nx) * pt + 18 + rnd(i + 5) * 30, ty = oy + Math.floor(i / nx) * pt + 18 + rnd(i + 11) * 30, tw = 22, th2 = 16;
          return <g key={i}><rect x={tx} y={ty} width={tw} height={th2} rx={2} fill="#fdfaf2" stroke="#a0782c" strokeWidth={0.6} /><line x1={tx} x2={tx + tw} y1={ty + th2 / 2} y2={ty + th2 / 2} stroke="#a0782c" strokeWidth={0.6} /></g>; })}</> };
    }
    case "square":
      return { noIcon: true, body: <>{pad(c, { fill: "#f7f2e6" })}{over(c, "vp-paving", 1)}{pad(c, { fill: "none" })}</> };
    default:
      return { body: pad(c) };
  }
}

/** Point assets: compact plan badges and small fixtures. `rot` turns directional parts (camera cones, shelters, gates). */
export function pointArt(key: string, cx: number, cy: number, r: number, fill: string, stroke: string, sw: number, Icon: LucideIcon, rot = 0): ReactNode {
  const R = (n: ReactNode) => rot ? <g transform={`rotate(${rot} ${cx} ${cy})`}>{n}</g> : n;
  const badge = (shape: "circle" | "square", bg: string, fg: string, I: LucideIcon = Icon) => <>
    {shape === "circle" ? <><circle cx={cx} cy={cy} r={r} fill="#fff" stroke={stroke} strokeWidth={sw} /><circle cx={cx} cy={cy} r={r - 2} fill={bg} /></>
      : <><rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.32} fill="#fff" stroke={stroke} strokeWidth={sw} /><rect x={cx - r + 1.6} y={cy - r + 1.6} width={r * 2 - 3.2} height={r * 2 - 3.2} rx={r * 0.24} fill={bg} /></>}
    <Ic I={I} cx={cx} cy={cy} s={r * 1.1} color={fg} /></>;
  switch (key) {
    case "tree": return treeGlyph(cx, cy, r, Math.round(cx + cy), "t");
    case "bus_stop": case "shuttle": return <>
      {R(<><rect x={cx - r} y={cy - r * 0.55} width={r * 2} height={r * 1.1} rx={1.2} fill="#fff" stroke={stroke} strokeWidth={sw} />
        <rect x={cx - r} y={cy - r * 0.55} width={r * 2} height={r * 0.22} fill={stroke} /><line x1={cx - r * 0.8} x2={cx + r * 0.8} y1={cy - r * 0.05} y2={cy - r * 0.05} stroke={stroke} strokeWidth={0.6} opacity={0.5} />
        <circle cx={cx + r * 1.3} cy={cy + r * 0.45} r={r * 0.28} fill={stroke} /></>)}
      <Ic I={key === "bus_stop" ? BusFront : Icon} cx={cx} cy={cy + r * 0.18} s={r * 0.7} color={stroke} /></>;
    case "train": return <>
      <line x1={cx - r * 1.5} x2={cx + r * 1.5} y1={cy + r * 1.25} y2={cy + r * 1.25} stroke="#4a5277" strokeWidth={0.6} /><line x1={cx - r * 1.5} x2={cx + r * 1.5} y1={cy + r * 1.55} y2={cy + r * 1.55} stroke="#4a5277" strokeWidth={0.6} />
      {range(7).map(i => <line key={i} x1={cx - r * 1.4 + i * r * 0.47} x2={cx - r * 1.4 + i * r * 0.47} y1={cy + r * 1.12} y2={cy + r * 1.68} stroke="#4a5277" strokeWidth={0.5} opacity={0.7} />)}
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.38} fill="#1a1af2" stroke="#fff" strokeWidth={1} /><Ic I={TrainFront} cx={cx} cy={cy} s={r * 1.2} color="#fff" /></>;
    case "camera": return <>
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1} fill="#fff" stroke={stroke} strokeWidth={sw} />
      <path d={`M${cx - r} ${cy - r} L${cx + r} ${cy + r} M${cx + r} ${cy - r} L${cx - r} ${cy + r}`} stroke={stroke} strokeWidth={0.4} opacity={0.4} />
      {R(<path d={`M${cx} ${cy} L${cx - r * 0.9} ${cy - r * 2.6} A${r * 2.8} ${r * 2.8} 0 0 1 ${cx + r * 0.9} ${cy - r * 2.6}Z`} fill={stroke} opacity={0.1} />)}
      <circle cx={cx} cy={cy} r={r * 0.62} fill={fill} /><Ic I={Camera} cx={cx} cy={cy} s={r * 0.9} color={stroke} /></>;
    case "lighting_tower": return <>
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy], i) => <line key={i} x1={cx} y1={cy} x2={cx + dx * r} y2={cy + dy * r} stroke={stroke} strokeWidth={0.8} />)}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy], i) => <rect key={`p${i}`} x={cx + dx * r - 1} y={cy + dy * r - 1} width={2} height={2} fill={stroke} />)}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff7d6" stroke="#e08a00" strokeWidth={0.7} /><Ic I={Lightbulb} cx={cx} cy={cy} s={r * 0.75} color="#b45f00" /></>;
    case "cctv": return <>
      {R(<path d={`M${cx} ${cy} L${cx - r * 1.4} ${cy + r * 2.8} A${r * 3.1} ${r * 3.1} 0 0 0 ${cx + r * 1.4} ${cy + r * 2.8}Z`} fill={stroke} opacity={0.1} stroke={stroke} strokeWidth={0.3} strokeDasharray="1 1" />)}
      <circle cx={cx} cy={cy} r={r * 0.7} fill="#2b2f4a" stroke="#fff" strokeWidth={0.8} /><Ic I={Cctv} cx={cx} cy={cy} s={r * 0.85} color="#fff" /></>;
    case "gate": return R(<>
      <rect x={cx - r - 1.2} y={cy - 1.2} width={2.4} height={2.4} fill={stroke} /><rect x={cx + r - 1.2} y={cy - 1.2} width={2.4} height={2.4} fill={stroke} />
      <path d={`M${cx - r} ${cy} L${cx - r * 0.25} ${cy - r * 0.7} M${cx + r} ${cy} L${cx + r * 0.25} ${cy - r * 0.7}`} stroke={stroke} strokeWidth={1} strokeLinecap="round" />
      <path d={`M${cx - r * 0.02} ${cy} A${r} ${r} 0 0 0 ${cx - r * 0.25} ${cy - r * 0.7} M${cx + r * 0.02} ${cy} A${r} ${r} 0 0 1 ${cx + r * 0.25} ${cy - r * 0.7}`} fill="none" stroke={stroke} strokeWidth={0.4} strokeDasharray="1 0.8" /></>);
    case "extinguisher": return badge("square", "#e5384f", "#fff", FireExtinguisher);
    case "assembly_point": return <>
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.18} fill="#16a46c" stroke="#fff" strokeWidth={1} />
      {[0, 90, 180, 270].map(a => <path key={a} transform={`rotate(${a} ${cx} ${cy})`} d={`M${cx - r * 0.18} ${cy - r * 0.86} h${r * 0.36} l${-r * 0.18} ${r * 0.24}Z`} fill="#fff" />)}
      <Ic I={Users} cx={cx} cy={cy} s={r * 0.95} color="#fff" /></>;
    case "info_point": return <><circle cx={cx} cy={cy} r={r} fill="#1a1af2" stroke="#fff" strokeWidth={1.2} /><Ic I={Info} cx={cx} cy={cy} s={r * 1.2} color="#fff" /></>;
    case "accessible_toilet": case "baby_change": return badge("square", fill, stroke);
    case "first_aid": return badge("square", "#fff", "#e5384f", Cross);
    default: return badge("circle", fill, stroke);
  }
}

/** Route and barrier lines. */
export function lineArt(key: string, pts: string, stroke: string, sel: boolean): ReactNode {
  const p = (props: Record<string, string | number | undefined>, k: string) => <polyline key={k} points={pts} fill="none" strokeLinecap="round" strokeLinejoin="round" {...props} />;
  const hi = sel ? p({ stroke: "#1a1af2", strokeWidth: 0.9, strokeDasharray: "3 2", opacity: 0.9 }, "sel") : null;
  const mk = (c: string) => `url(#vp-arrow-${c})`;
  switch (key) {
    case "vehicle_route": return <>{p({ stroke: "#c3c8d8", strokeWidth: 20 }, "a")}{p({ stroke: "#e3e6ee", strokeWidth: 18 }, "b")}{p({ stroke: "#fff", strokeWidth: 1, strokeDasharray: "6 6", strokeLinecap: "butt", markerEnd: mk("s") }, "c")}{hi}</>;
    case "queue_lane": return <>{p({ stroke: sel ? "#1a1af2" : stroke, strokeWidth: 12 }, "a")}{p({ stroke: "#fff8ec", strokeWidth: 10.4 }, "b")}{p({ stroke: stroke, strokeWidth: 0.7, strokeDasharray: "2 3", opacity: 0.7, markerEnd: mk("a") }, "c")}</>;
    case "fence": return <>{p({ stroke: sel ? "#1a1af2" : "#4a5277", strokeWidth: 0.6 }, "a")}{p({ stroke: sel ? "#1a1af2" : "#2b2f4a", strokeWidth: 1.8, strokeDasharray: "1.8 12", strokeLinecap: "butt" }, "b")}</>;
    case "trail": return <>{p({ stroke: "#eadfc2", strokeWidth: 9 }, "a")}{p({ stroke: "#a0782c", strokeWidth: 0.8, strokeDasharray: "1.5 3", opacity: 0.7 }, "b")}{hi}</>;
    case "emergency_route": return <>{p({ stroke: "#fff", strokeWidth: 5 }, "a")}{p({ stroke: sel ? "#1a1af2" : stroke, strokeWidth: 2.8, strokeDasharray: "9 4", strokeLinecap: "butt", markerEnd: mk("r") }, "b")}</>;
    case "step_free": return <>{p({ stroke: "#fff", strokeWidth: 5 }, "a")}{p({ stroke: sel ? "#1a1af2" : stroke, strokeWidth: 2.6, strokeDasharray: "6 4", markerEnd: mk("g") }, "b")}</>;
    default: return <>{p({ stroke: "#fff", strokeWidth: 5 }, "a")}{p({ stroke: sel ? "#1a1af2" : stroke, strokeWidth: 2.6, strokeDasharray: "0.1 4.5", markerEnd: mk("b") }, "b")}</>;
  }
}
