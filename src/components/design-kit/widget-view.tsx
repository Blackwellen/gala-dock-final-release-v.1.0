import type { CSSProperties, ReactNode } from "react";
import type { WidgetLayer } from "@/lib/media/document";
import { icons } from "lucide-react";
import { listItems, pairItems } from "@/lib/design-kit/widgets";
import { CARD_LAYOUTS } from "@/lib/design-kit/info-cards";

/**
 * Renders a widget layer as SVG at the layer's own pixel size (crisp in exports). Variants: 0 Filled · 1 Outline · 2 Minimal ·
 * 3 Rounded · 4 Glass · 5 Bold. Server-safe (no hooks), so library thumbnails render it too.
 */
export function WidgetView({ l, style }: { l: WidgetLayer; style: CSSProperties }) {
  const W = Math.max(10, l.w), H = Math.max(10, l.h), t = l.theme, v = l.variant % 6, p = l.props, font = `'${l.font ?? "Inter"}', Inter, sans-serif`;
  const panel = v === 2 ? "none" : v === 1 ? "none" : v === 4 ? "rgba(255,255,255,0.16)" : v === 5 ? t.a : t.bg;
  const ink = v === 5 ? "#ffffff" : v === 2 || v === 1 ? (t.bg === "#ffffff" || t.bg.startsWith("#f") ? t.text : t.a) : t.text;
  const accent = v === 5 ? t.b : t.a;
  const r = v === 3 ? Math.min(W, H) * 0.18 : v === 2 ? 0 : Math.min(W, H) * 0.06;
  const strokeW = Math.max(2, Math.min(W, H) * 0.02);
  const frame = <rect x={strokeW / 2} y={strokeW / 2} width={W - strokeW} height={H - strokeW} rx={r} fill={panel} stroke={v === 1 || v === 4 ? accent : "none"} strokeWidth={v === 1 || v === 4 ? strokeW : 0} />;
  const txt = (x: number, y: number, s: number, c: string, children: ReactNode, o: { w?: number; a?: "start" | "middle" | "end"; ls?: number; i?: boolean } = {}) =>
    <text x={x} y={y} fontSize={s} fontWeight={o.w ?? 600} fill={c} textAnchor={o.a ?? "middle"} dominantBaseline="middle" letterSpacing={o.ls ?? 0} fontStyle={o.i ? "italic" : undefined} fontFamily={font}>{children}</text>;
  let body: ReactNode = null;
  switch (l.widget) {
    case "countdown": {
      const units: [string, string | number][] = [["Days", p.days!], ["Hours", p.hours!], ["Mins", p.mins!], ["Secs", p.secs!]];
      const top = H * 0.26, cw = (W * 0.9) / 4, bh = H * 0.56;
      body = <>{txt(W / 2, top * 0.6, H * 0.12, ink, p.label, { w: 600, ls: 1 })}{units.map(([u, n], i) => { const x = W * 0.05 + i * cw; return <g key={u}>
        <rect x={x + cw * 0.06} y={top} width={cw * 0.88} height={bh} rx={Math.min(cw, bh) * 0.12} fill={v === 2 ? "none" : accent} stroke={v === 2 ? accent : "none"} strokeWidth={strokeW} />
        {txt(x + cw / 2, top + bh * 0.42, bh * 0.46, v === 2 ? accent : "#ffffff", String(n).padStart(2, "0"), { w: 800 })}{txt(x + cw / 2, top + bh * 0.82, bh * 0.14, v === 2 ? ink : "#ffffffcc", u.toUpperCase(), { w: 600, ls: 1 })}</g>; })}</>;
      break;
    }
    case "date-block": body = <>{v !== 2 && <rect x={0} y={0} width={W} height={H * 0.28} rx={r} fill={accent} />}{txt(W / 2, H * 0.14, H * 0.13, v === 2 ? accent : "#ffffff", p.month, { w: 800, ls: 3 })}
      {txt(W / 2, H * 0.56, H * 0.4, ink, p.day, { w: 800 })}{txt(W / 2, H * 0.86, H * 0.09, ink, p.weekday, { w: 500 })}</>; break;
    case "time-block": body = <>{txt(W * 0.08, H / 2, H * 0.22, accent, String(p.label).toUpperCase(), { a: "start", w: 700, ls: 2 })}{txt(W * 0.92, H / 2, H * 0.5, ink, p.time, { a: "end", w: 800 })}</>; break;
    case "calendar": {
      const days = Number(p.days) || 30, start = Number(p.start) || 0, hi = Number(p.day) || 0, gx = W * 0.08, gw = W * 0.84, cell = gw / 7, top = H * 0.24;
      body = <>{txt(W / 2, H * 0.09, H * 0.07, ink, p.title, { w: 800 })}{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <g key={i}>{txt(gx + cell * (i + 0.5), H * 0.17, H * 0.045, accent, d, { w: 700 })}</g>)}
        {Array.from({ length: days }, (_, i) => { const k = i + start, cx = gx + cell * ((k % 7) + 0.5), cy = top + cell * 0.95 * (Math.floor(k / 7) + 0.5);
          return <g key={i}>{i + 1 === hi && <circle cx={cx} cy={cy} r={cell * 0.38} fill={accent} />}{txt(cx, cy, cell * 0.34, i + 1 === hi ? "#ffffff" : ink, i + 1, { w: i + 1 === hi ? 800 : 500 })}</g>; })}</>;
      break;
    }
    case "timeline-h": {
      const items = pairItems(p.items), n = Math.max(1, items.length), y = H * 0.5, x0 = W * 0.07, x1 = W * 0.93;
      body = <><line x1={x0} y1={y} x2={x1} y2={y} stroke={accent} strokeWidth={strokeW * 1.5} strokeLinecap="round" />{items.map(([tm, ti], i) => { const x = n === 1 ? W / 2 : x0 + ((x1 - x0) * i) / (n - 1);
        return <g key={i}><circle cx={x} cy={y} r={H * 0.07} fill={accent} stroke={panel === "none" ? "#ffffff" : panel} strokeWidth={strokeW} />{txt(x, y - H * 0.2, H * 0.11, accent, tm, { w: 800 })}{txt(x, y + H * 0.22, H * 0.085, ink, ti, { w: 600 })}</g>; })}</>;
      break;
    }
    case "timeline-v": {
      const items = pairItems(p.items), n = Math.max(1, items.length), x = W * 0.16, y0 = H * 0.08, y1 = H * 0.92;
      body = <><line x1={x} y1={y0} x2={x} y2={y1} stroke={accent} strokeWidth={strokeW * 1.5} strokeLinecap="round" />{items.map(([tm, ti], i) => { const y = n === 1 ? H / 2 : y0 + ((y1 - y0) * i) / (n - 1);
        return <g key={i}><circle cx={x} cy={y} r={W * 0.03} fill={accent} />{txt(x + W * 0.07, y - H * 0.022, W * 0.05, accent, tm, { a: "start", w: 800 })}{txt(x + W * 0.07, y + H * 0.028, W * 0.045, ink, ti, { a: "start", w: 500 })}</g>; })}</>;
      break;
    }
    case "agenda": {
      const items = pairItems(p.items), rowH = (H * 0.76) / Math.max(1, items.length);
      body = <>{txt(W * 0.08, H * 0.1, H * 0.065, ink, p.title, { a: "start", w: 800 })}{items.map(([tm, ti], i) => { const y = H * 0.22 + rowH * (i + 0.5);
        return <g key={i}>{i > 0 && <line x1={W * 0.08} x2={W * 0.92} y1={y - rowH / 2} y2={y - rowH / 2} stroke={accent} strokeOpacity={0.3} strokeWidth={strokeW / 2} />}
          {txt(W * 0.08, y, rowH * 0.32, accent, tm, { a: "start", w: 800 })}{txt(W * 0.34, y, rowH * 0.3, ink, ti, { a: "start", w: 500 })}</g>; })}</>;
      break;
    }
    case "lineup": {
      const items = listItems(p.items);
      body = <>{txt(W / 2, H * 0.1, H * 0.06, accent, p.title, { w: 800, ls: 4 })}{items.map((name, i) => { const s = H * (i === 0 ? 0.11 : Math.max(0.045, 0.075 - i * 0.006)); const y = H * 0.24 + items.slice(0, i).reduce((a, _, j) => a + H * (j === 0 ? 0.15 : Math.max(0.07, 0.1 - j * 0.006)), 0);
        return <g key={i}>{txt(W / 2, y, s, i === 0 ? ink : ink, name, { w: i === 0 ? 900 : 600 })}</g>; })}</>;
      break;
    }
    case "ticket": {
      const cut = W * 0.7;
      body = <><line x1={cut} x2={cut} y1={H * 0.08} y2={H * 0.92} stroke={accent} strokeDasharray={`${strokeW * 2} ${strokeW * 2}`} strokeWidth={strokeW} />
        <circle cx={cut} cy={0} r={H * 0.07} fill="#ffffff" /><circle cx={cut} cy={H} r={H * 0.07} fill="#ffffff" />
        {txt(W * 0.06, H * 0.24, H * 0.07, accent, String(p.tier).toUpperCase(), { a: "start", w: 800, ls: 3 })}{txt(W * 0.06, H * 0.45, H * 0.13, ink, p.event, { a: "start", w: 800 })}
        {txt(W * 0.06, H * 0.66, H * 0.065, ink, p.date, { a: "start", w: 500 })}{txt(W * 0.06, H * 0.8, H * 0.055, ink, p.seat, { a: "start", w: 500 })}
        {txt((cut + W) / 2, H * 0.32, H * 0.16, accent, p.price, { w: 800 })}{Array.from({ length: 18 }, (_, i) => <rect key={i} x={cut + W * 0.04 + i * (W * 0.22 / 18)} y={H * 0.55} width={(W * 0.22 / 18) * (i % 3 === 0 ? 0.7 : 0.35)} height={H * 0.28} fill={ink} />)}</>;
      break;
    }
    case "price-tag": body = <>{txt(W / 2, H * 0.22, H * 0.11, ink, p.label, { w: 600 })}{txt(W / 2, H * 0.55, H * 0.3, accent, p.price, { w: 900 })}{txt(W / 2, H * 0.84, H * 0.08, ink, p.note, { w: 500 })}</>; break;
    case "stamp": body = <g transform={`rotate(-8 ${W / 2} ${H / 2})`}><rect x={W * 0.06} y={H * 0.12} width={W * 0.88} height={H * 0.76} rx={H * 0.08} fill="none" stroke={accent} strokeWidth={strokeW * 2.5} />
      {txt(W / 2, H * 0.46, H * 0.32, accent, p.text, { w: 900, ls: 3 })}{txt(W / 2, H * 0.74, H * 0.1, accent, String(p.sub).toUpperCase(), { w: 700, ls: 2 })}</g>; break;
    case "badge-age": body = <><circle cx={W / 2} cy={H / 2} r={Math.min(W, H) * 0.46} fill={v === 2 ? "none" : accent} stroke={accent} strokeWidth={strokeW * 2} />
      {txt(W / 2, H * 0.46, H * 0.32, v === 2 ? accent : "#ffffff", p.text, { w: 900 })}{txt(W / 2, H * 0.7, H * 0.08, v === 2 ? accent : "#ffffff", String(p.sub).toUpperCase(), { w: 700, ls: 1 })}</>; break;
    case "rating": {
      const val = Math.max(0, Math.min(5, Number(p.value) || 0)), s = H * 0.5, star = "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z";
      body = <><defs><clipPath id={`rc${l.id}`}><rect x={0} y={0} width={W * 0.06 + (s * 1.15) * val} height={H} /></clipPath></defs>
        {[0, 1].map(layer => <g key={layer} clipPath={layer ? `url(#rc${l.id})` : undefined}>{Array.from({ length: 5 }, (_, i) => <path key={i} d={star} transform={`translate(${W * 0.06 + i * s * 1.15} ${(H - s) / 2}) scale(${s / 100})`} fill={layer ? accent : "none"} stroke={accent} strokeWidth={6} />)}</g>)}
        {txt(W * 0.06 + s * 5.9, H * 0.42, H * 0.3, ink, val.toFixed(1), { a: "start", w: 800 })}{txt(W * 0.06 + s * 5.9, H * 0.74, H * 0.14, ink, p.label, { a: "start", w: 500 })}</>;
      break;
    }
    case "quote": body = <>{txt(W * 0.1, H * 0.25, H * 0.45, accent, "“", { w: 900 })}<foreignObject x={W * 0.1} y={H * 0.22} width={W * 0.8} height={H * 0.5}>
      <div style={{ font: `600 ${H * 0.1}px/1.25 ${font}`, color: ink, fontStyle: "italic" }}>{p.text}</div></foreignObject>{txt(W * 0.9, H * 0.84, H * 0.07, accent, `— ${p.author}`, { a: "end", w: 700 })}</>; break;
    case "stat": body = <>{txt(W / 2, H * 0.44, H * 0.36, accent, p.value, { w: 900 })}{txt(W / 2, H * 0.78, H * 0.1, ink, p.label, { w: 600 })}</>; break;
    case "progress": {
      const val = Math.max(0, Math.min(100, Number(p.value) || 0)), bx = W * 0.06, bw = W * 0.88, by = H * 0.56, bh = H * 0.24;
      body = <>{txt(bx, H * 0.26, H * 0.16, ink, p.label, { a: "start", w: 600 })}{txt(bx + bw, H * 0.26, H * 0.18, accent, `${val}%`, { a: "end", w: 800 })}
        <rect x={bx} y={by} width={bw} height={bh} rx={bh / 2} fill={accent} fillOpacity={0.18} /><rect x={bx} y={by} width={(bw * val) / 100} height={bh} rx={bh / 2} fill={accent} /></>;
      break;
    }
    case "ring": {
      const val = Math.max(0, Math.min(100, Number(p.value) || 0)), R = Math.min(W, H) * 0.38, c = 2 * Math.PI * R, sw = Math.min(W, H) * 0.1;
      body = <><circle cx={W / 2} cy={H / 2} r={R} fill="none" stroke={accent} strokeOpacity={0.18} strokeWidth={sw} />
        <circle cx={W / 2} cy={H / 2} r={R} fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(c * val) / 100} ${c}`} transform={`rotate(-90 ${W / 2} ${H / 2})`} />
        {txt(W / 2, H * 0.46, H * 0.18, ink, `${val}%`, { w: 800 })}{txt(W / 2, H * 0.62, H * 0.07, ink, p.label, { w: 600 })}</>;
      break;
    }
    case "bars": {
      const items = pairItems(p.items), max = Math.max(1, ...items.map(([, n]) => Number(n) || 0)), n = Math.max(1, items.length), x0 = W * 0.08, cw = (W * 0.84) / n, base = H * 0.86, top = H * 0.2;
      body = <>{txt(x0, H * 0.09, H * 0.06, ink, p.title, { a: "start", w: 800 })}{items.map(([lab, val], i) => { const h = ((Number(val) || 0) / max) * (base - top);
        return <g key={i}><rect x={x0 + cw * (i + 0.18)} y={base - h} width={cw * 0.64} height={h} rx={cw * 0.08} fill={i === n - 1 ? accent : t.b} />{txt(x0 + cw * (i + 0.5), base + H * 0.06, H * 0.045, ink, lab, { w: 600 })}{txt(x0 + cw * (i + 0.5), base - h - H * 0.04, H * 0.045, ink, val, { w: 700 })}</g>; })}</>;
      break;
    }
    case "donut": {
      const items = pairItems(p.items), total = Math.max(1, items.reduce((a, [, n]) => a + (Number(n) || 0), 0)), R = Math.min(W, H) * 0.3, cx = W / 2, cy = H * 0.42, c = 2 * Math.PI * R, sw = R * 0.5;
      const cols = [accent, t.b, ink, "#ff9e00", "#43aa8b", "#f94144"];
      const lens = items.map(([, n]) => (c * (Number(n) || 0)) / total), starts = lens.map((_, i) => lens.slice(0, i).reduce((a, x) => a + x, 0));
      body = <>{lens.map((len, i) => <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={cols[i % cols.length]} strokeWidth={sw} strokeDasharray={`${len} ${c}`} strokeDashoffset={-starts[i]!} transform={`rotate(-90 ${cx} ${cy})`} />)}
        {items.map(([lab, n], i) => <g key={`l${i}`}><rect x={W * 0.12} y={H * 0.8 + i * H * 0.06 - H * 0.02} width={H * 0.035} height={H * 0.035} rx={4} fill={cols[i % cols.length]} />{txt(W * 0.12 + H * 0.06, H * 0.8 + i * H * 0.06, H * 0.04, ink, `${lab} · ${Math.round(((Number(n) || 0) / total) * 100)}%`, { a: "start", w: 600 })}</g>)}</>;
      break;
    }
    case "checklist": {
      const items = listItems(p.items), rowH = (H * 0.74) / Math.max(1, items.length);
      body = <>{txt(W * 0.08, H * 0.1, H * 0.07, ink, p.title, { a: "start", w: 800 })}{items.map((it, i) => { const y = H * 0.24 + rowH * (i + 0.5), s = rowH * 0.42;
        return <g key={i}><rect x={W * 0.08} y={y - s / 2} width={s} height={s} rx={s * 0.25} fill={accent} /><path d={`M${W * 0.08 + s * 0.24} ${y} l${s * 0.18} ${s * 0.18} l${s * 0.34} ${-s * 0.36}`} stroke="#ffffff" strokeWidth={s * 0.14} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {txt(W * 0.08 + s * 1.6, y, rowH * 0.3, ink, it, { a: "start", w: 500 })}</g>; })}</>;
      break;
    }
    case "location": body = <><path d="M50 0 A35 35 0 0 1 85 35 C85 60 50 100 50 100 C50 100 15 60 15 35 A35 35 0 0 1 50 0 Z M50 22 A13 13 0 1 0 50.01 22 Z" fillRule="evenodd" fill={accent} transform={`translate(${W * 0.05} ${H * 0.18}) scale(${(H * 0.64) / 100})`} />
      {txt(W * 0.05 + H * 0.75, H * 0.38, H * 0.2, ink, p.venue, { a: "start", w: 800 })}{txt(W * 0.05 + H * 0.75, H * 0.66, H * 0.13, ink, p.address, { a: "start", w: 500 })}</>; break;
    case "contact": body = <>{([["☎", p.phone], ["✉", p.email], ["⌂", p.web]] as const).map(([ic, val], i) => <g key={i}><circle cx={W * 0.1} cy={H * (0.22 + i * 0.28)} r={H * 0.1} fill={accent} />
      {txt(W * 0.1, H * (0.22 + i * 0.28), H * 0.1, "#ffffff", ic, { w: 700 })}{txt(W * 0.2, H * (0.22 + i * 0.28), H * 0.11, ink, val, { a: "start", w: 600 })}</g>)}</>; break;
    case "social": body = <>{txt(W * 0.06, H / 2, H * 0.22, accent, String(p.platform).toUpperCase(), { a: "start", w: 700, ls: 2 })}{txt(W * 0.94, H / 2, H * 0.36, ink, p.handle, { a: "end", w: 800 })}</>; break;
    case "hashtag": body = txt(W / 2, H / 2, H * 0.42, accent, p.tag, { w: 900 }); break;
    case "wifi": body = <>{txt(W / 2, H * 0.2, H * 0.11, accent, "WI-FI", { w: 800, ls: 4 })}{txt(W * 0.1, H * 0.48, H * 0.09, ink, "Network", { a: "start", w: 500 })}{txt(W * 0.9, H * 0.48, H * 0.11, ink, p.network, { a: "end", w: 800 })}
      {txt(W * 0.1, H * 0.76, H * 0.09, ink, "Password", { a: "start", w: 500 })}{txt(W * 0.9, H * 0.76, H * 0.11, ink, p.password, { a: "end", w: 800 })}</>; break;
    case "sponsors": {
      const items = listItems(p.items), cw = (W * 0.9) / Math.max(1, items.length);
      body = <>{txt(W / 2, H * 0.2, H * 0.12, accent, String(p.title).toUpperCase(), { w: 700, ls: 3 })}{items.map((s, i) => <g key={i}>{txt(W * 0.05 + cw * (i + 0.5), H * 0.62, H * 0.17, ink, s, { w: 800 })}</g>)}</>;
      break;
    }
    case "card": {
      // Info card: icon placement (left/top/right/badge/none) × frame (card, rounded, pill, outline, banner, ticket, sticker, split).
      const lay = CARD_LAYOUTS[Number(p.layout) % CARD_LAYOUTS.length] ?? CARD_LAYOUTS[0]!, I = icons[String(p.icon) as keyof typeof icons] ?? icons.Info;
      const fr = lay.frame, solid = fr === "card" || fr === "rounded" || fr === "pill" || fr === "banner" || fr === "sticker";
      const bg = fr === "outline" ? "none" : fr === "sticker" ? accent : panel === "none" ? t.bg : panel, fg = fr === "sticker" ? "#ffffff" : ink;
      const rr = fr === "pill" || fr === "sticker" ? Math.min(W, H) / 2 : fr === "rounded" ? Math.min(W, H) * 0.16 : fr === "banner" ? 0 : Math.min(W, H) * 0.06;
      const vertical = lay.icon === "top" || lay.icon === "badge", isz = vertical ? H * 0.26 : H * 0.42, pad = Math.min(W, H) * 0.1;
      const iconBox = (x: number, y: number) => lay.icon === "none" ? null : lay.icon === "badge"
        ? <g><circle cx={x + isz / 2} cy={y + isz / 2} r={isz * 0.62} fill={fr === "sticker" ? "#ffffff" : accent} /><I x={x + isz * 0.18} y={y + isz * 0.18} width={isz * 0.64} height={isz * 0.64} color={fr === "sticker" ? accent : "#ffffff"} strokeWidth={2} /></g>
        : <I x={x} y={y} width={isz} height={isz} color={fr === "sticker" ? "#ffffff" : accent} strokeWidth={1.8} />;
      const split = fr === "split" && !vertical && lay.icon !== "none";
      let ix = pad, iy = (H - isz) / 2, tx = pad + (lay.icon === "none" ? 0 : isz + pad * 0.8), anchor: "start" | "middle" | "end" = "start", tw = W - tx - pad;
      if (lay.icon === "right") { ix = W - pad - isz; tx = pad; tw = W - isz - pad * 2.8; }
      if (vertical) { ix = (W - isz) / 2; iy = pad * 0.9; tx = W / 2; anchor = "middle"; tw = W - pad * 2; }
      const ty = vertical ? iy + isz + pad * 1.1 : H * 0.32, ts = vertical ? H * 0.1 : H * 0.17;
      body = <>
        {fr !== "ticket" && <rect x={strokeW / 2} y={strokeW / 2} width={W - strokeW} height={H - strokeW} rx={rr} fill={bg} stroke={!solid ? accent : "none"} strokeWidth={!solid ? strokeW : 0} />}
        {fr === "ticket" && <path d={`M0 0 H${W} V${H * 0.38} A${H * 0.12} ${H * 0.12} 0 0 0 ${W} ${H * 0.62} V${H} H0 V${H * 0.62} A${H * 0.12} ${H * 0.12} 0 0 0 0 ${H * 0.38} Z`} fill={panel === "none" ? t.bg : panel} stroke={accent} strokeWidth={strokeW} />}
        {split && <rect x={0} y={0} width={isz + pad * 1.6} height={H} rx={rr} fill={accent} />}
        {fr === "banner" && <rect x={0} y={0} width={W * 0.02} height={H} fill={accent} />}
        {split ? <I x={(isz + pad * 1.6 - isz) / 2} y={iy} width={isz} height={isz} color="#ffffff" strokeWidth={1.8} /> : iconBox(ix, iy)}
        <foreignObject x={split ? isz + pad * 2.4 : anchor === "middle" ? pad : tx} y={ty - ts * 0.75} width={split ? W - isz - pad * 3.4 : anchor === "middle" ? W - pad * 2 : tw} height={H - (ty - ts * 0.75) - pad * 0.5}>
          <div style={{ fontFamily: font, color: fg, textAlign: anchor === "middle" ? "center" : lay.icon === "right" ? "left" : "left", lineHeight: 1.2 }}>
            <div style={{ fontSize: ts, fontWeight: 800, marginBottom: ts * 0.25 }}>{p.title}</div>
            <div style={{ fontSize: ts * 0.72, fontWeight: 500, opacity: 0.9 }}>{p.text}</div></div></foreignObject></>;
      break;
    }
    case "divider": body = <><line x1={W * 0.04} x2={W * 0.44} y1={H / 2} y2={H / 2} stroke={accent} strokeWidth={strokeW} /><line x1={W * 0.56} x2={W * 0.96} y1={H / 2} y2={H / 2} stroke={accent} strokeWidth={strokeW} />
      {txt(W / 2, H / 2, H * 0.5, accent, p.text, { w: 700 })}</>; break;
  }
  return <svg style={style} viewBox={`0 0 ${W} ${H}`} data-layer={l.id} role="img" aria-label={l.name}>{l.widget !== "divider" && l.widget !== "stamp" && l.widget !== "card" && frame}{body}</svg>;
}
