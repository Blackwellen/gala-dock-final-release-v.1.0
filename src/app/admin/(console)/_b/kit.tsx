import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, CalendarDays, ChevronDown, type LucideIcon } from "lucide-react";
import { Sparkline, IconTile, type Tone } from "@/components/workspace/kit";
import { titleCase } from "@/lib/workspace/format";

/* Server-safe presentational pieces shared by the Admin B screens. Styles: src/styles/admin-b.css. */

export function Head({ title, subtitle, actions, back, badges, className = "" }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; badges?: ReactNode; className?: string }) {
  return <header className={`adb-head ${className}`}>
    <div>
      {back && <Link className="adb-back" href={back.href}><ArrowLeft aria-hidden="true" />{back.label}</Link>}
      <div className="adb-title"><h1>{title}</h1>{badges}</div>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="adb-head-actions">{actions}</div>}
  </header>;
}

/** KPI card matching the Admin designs: icon tile, label, value, delta and a trend line drawn from real daily values. */
export function Kpi({ icon, tone = "blue", label, value, delta, suffix = "vs last 30 days", series, invert = false, note, badge, className = "" }: {
  icon: LucideIcon; tone?: Tone; label: ReactNode; value: ReactNode; delta?: number | null; suffix?: string; series?: number[]; invert?: boolean; note?: ReactNode; badge?: ReactNode; className?: string;
}) {
  const good = delta == null ? true : invert ? delta <= 0 : delta >= 0;
  return <div className={`adb-kpi ${className}`}>
    <IconTile icon={icon} tone={tone} size={44} />
    <div className="adb-kpi-body">
      <span className="adb-kpi-label">{label}</span>
      <strong>{value}</strong>
      {delta !== undefined && (delta === null ? <small className="adb-kpi-sub">No prior period</small>
        : <b className={`adb-delta ${good ? "up" : "down"}`}>{delta >= 0 ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}{Math.abs(delta)}%</b>)}
      {note !== undefined ? <small className="adb-kpi-sub">{note}</small> : delta !== undefined && delta !== null && <small className="adb-kpi-sub">{suffix}</small>}
    </div>
    {badge && <span className="adb-kpi-badge">{badge}</span>}
    {series && series.length > 1 && <span className="adb-kpi-spark"><Sparkline values={series} tone={tone === "grey" ? "blue" : tone} width={118} height={50} /></span>}
  </div>;
}

export function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="adb-delta flat">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  return <b className={`adb-delta ${good ? "up" : "down"}`}>{value >= 0 ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}{Math.abs(value)}%</b>;
}

/** Underlined section tabs driven by a URL param (or by path when `hrefs` are given). */
export function TabBar({ tabs, active, className = "" }: { tabs: { key: string; label: string; href: string; count?: number | null }[]; active: string; className?: string }) {
  return <nav className={`adb-tabs ${className}`} aria-label="Sections">{tabs.map(t =>
    <Link key={t.key} href={t.href} scroll={false} aria-current={t.key === active ? "page" : undefined} className={t.key === active ? "on" : ""}>
      {t.label}{t.count != null && <b>{t.count.toLocaleString("en-GB")}</b>}
    </Link>)}</nav>;
}

/** Status/priority pill with design colours. */
const pillTone: Record<string, string> = {
  open: "red", high: "red", urgent: "red-solid", failed: "red", down: "red", refunded: "red", hold: "red", restricted: "red", disputed: "purple",
  waiting: "blue", processing: "blue", pending: "amber", medium: "amber", paused: "amber", degraded: "amber", on_hold: "amber", awaiting_info: "amber", monitoring: "purple",
  escalated: "red", in_review: "amber", under_review: "amber", investigating: "purple", info_requested: "blue",
  low: "green", resolved: "green", completed: "green", paid: "green", healthy: "green", active: "green", actioned: "green", approved: "green", succeeded: "green", dismissed: "grey", closed: "green", live: "green", draft: "amber",
  cancelled: "grey", scheduled: "blue", queued: "blue", running: "blue", waiting_approval: "amber", superseded: "grey", terminated: "grey", appealed: "purple",
};
export function Pill({ status, label, dot = false, className = "" }: { status: string; label?: ReactNode; dot?: boolean; className?: string }) {
  return <span className={`adb-pill ${pillTone[status] ?? "grey"} ${dot ? "dot" : ""} ${className}`}>{label ?? titleCase(status)}</span>;
}

export function Pager({ total, page, per, href }: { total: number; page: number; per: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / per));
  const nums = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, 4, 5, 0, pages];
  const from = total ? (page - 1) * per + 1 : 0, to = Math.min(total, page * per);
  return <div className="adb-pager">
    <span className="adb-pager-show">Show <span className="adb-pager-per">{per}<ChevronDown aria-hidden="true" /></span> per page</span>
    <span className="adb-pager-range">{from}–{to} of {total.toLocaleString("en-GB")}</span>
    <nav aria-label="Pages">
      {page > 1 ? <Link href={href(page - 1)} aria-label="Previous page"><ChevronLeft aria-hidden="true" /></Link> : <span className="off"><ChevronLeft aria-hidden="true" /></span>}
      {nums.map((n, i) => n === 0 ? <span key={`e${i}`} className="gap">…</span> : n === page ? <span key={n} className="cur" aria-current="page">{n}</span> : <Link key={n} href={href(n)}>{n}</Link>)}
      {page < pages ? <Link href={href(page + 1)} aria-label="Next page"><ChevronRight aria-hidden="true" /></Link> : <span className="off"><ChevronRight aria-hidden="true" /></span>}
    </nav>
  </div>;
}

export function PeriodLabel({ label }: { label: string }) {
  return <span className="adb-period"><CalendarDays aria-hidden="true" />{label}<ChevronDown aria-hidden="true" /></span>;
}

/** Initials / image avatar that never stretches. */
export function Face({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="adb-face" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
    : <span className="adb-face initials" style={{ width: size, height: size, fontSize: size * .38 }} aria-hidden="true">{letters}</span>;
}

/** Square brand-style mark (organizer logos, partner marks). */
export function Mark({ text, color = "#0d0d63", size = 30, round = true }: { text: string; color?: string; size?: number; round?: boolean }) {
  return <span className="adb-mark" style={{ width: size, height: size, background: color, borderRadius: round ? "50%" : 8, fontSize: text.length > 1 ? size * .36 : size * .5 }} aria-hidden="true">{text}</span>;
}

/** Simple line/area chart for daily series (multi-series), drawn as SVG with an axis. */
export function LineChart({ series, labels, height = 150, width = 520, format = (v: number) => String(v), right, area = true, className = "" }: {
  series: { values: number[]; color: string; fill?: boolean; axis?: "left" | "right" }[]; labels: string[]; height?: number; width?: number; format?: (v: number) => string;
  right?: { format: (v: number) => string }; area?: boolean; className?: string;
}) {
  const pad = { l: 34, r: right ? 38 : 8, t: 8, b: 20 };
  const left = series.filter(s => s.axis !== "right"), rightS = series.filter(s => s.axis === "right");
  const top = (list: typeof series) => { const max = Math.max(1, ...list.flatMap(s => s.values)); const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; };
  const lt = top(left), rt = rightS.length ? top(rightS) : 1;
  const n = Math.max(2, ...series.map(s => s.values.length));
  const x = (i: number) => pad.l + (i / (n - 1)) * (width - pad.l - pad.r);
  const y = (v: number, t: number) => pad.t + (height - pad.t - pad.b) * (1 - v / t);
  const path = (vals: number[], t: number) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v, t).toFixed(1)}`).join("");
  const ticks = [0, 1, 2, 3, 4];
  const every = Math.max(1, Math.round(n / 7));
  return <svg viewBox={`0 0 ${width} ${height}`} className={`adb-line ${className}`} role="img" aria-label="Trend chart" preserveAspectRatio="none">
    {ticks.map(k => <g key={k}><line x1={pad.l} x2={width - pad.r} y1={y((lt / 4) * k, lt)} y2={y((lt / 4) * k, lt)} className="adb-grid" />
      <text x={pad.l - 6} y={y((lt / 4) * k, lt) + 3} textAnchor="end" className="adb-ax">{format((lt / 4) * k)}</text>
      {right && <text x={width - pad.r + 6} y={y((rt / 4) * k, rt) + 3} className="adb-ax">{right.format((rt / 4) * k)}</text>}</g>)}
    {series.map((s, i) => { const t = s.axis === "right" ? rt : lt; const d = path(s.values, t);
      return <g key={i}>{area && s.fill !== false && <path d={`${d}L${x(s.values.length - 1)},${y(0, t)}L${x(0)},${y(0, t)}Z`} fill={s.color} opacity=".08" />}<path d={d} fill="none" stroke={s.color} strokeWidth="1.6" strokeLinejoin="round" /></g>; })}
    {labels.map((l, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 5} textAnchor="middle" className="adb-ax">{l}</text>)}
  </svg>;
}

/** Group/bar chart (optionally stacked) as SVG. */
export function Bars({ data, height = 150, width = 520, format = (v: number) => String(v), stacked = true, labels, gap = 0.35, right, line }: {
  data: { parts: { value: number; color: string }[] }[]; height?: number; width?: number; format?: (v: number) => string; stacked?: boolean; labels: string[]; gap?: number;
  right?: { format: (v: number) => string; /** Right-axis value per left-axis unit (bars drawn on the left scale). */ scale?: number }; line?: { values: number[]; color: string };
}) {
  const pad = { l: 34, r: right ? 38 : 8, t: 8, b: 20 };
  const max = Math.max(1, ...data.map(d => stacked ? d.parts.reduce((a, p) => a + p.value, 0) : Math.max(...d.parts.map(p => p.value))));
  const pw = 10 ** Math.floor(Math.log10(max)), top = Math.ceil(max / pw) * pw;
  const rmax = line ? Math.max(1, ...line.values) : 1, rp = 10 ** Math.floor(Math.log10(rmax)), rtop = Math.ceil(rmax / rp) * rp;
  const bw = (width - pad.l - pad.r) / data.length, inner = bw * (1 - gap);
  const y = (v: number, t = top) => pad.t + (height - pad.t - pad.b) * (1 - v / t);
  const every = Math.max(1, Math.round(data.length / 6));
  return <svg viewBox={`0 0 ${width} ${height}`} className="adb-line" role="img" aria-label="Bar chart" preserveAspectRatio="none">
    {[0, 1, 2, 3, 4].map(k => <g key={k}><line x1={pad.l} x2={width - pad.r} y1={y((top / 4) * k)} y2={y((top / 4) * k)} className="adb-grid" />
      <text x={pad.l - 6} y={y((top / 4) * k) + 3} textAnchor="end" className="adb-ax">{format((top / 4) * k)}</text>
      {right && <text x={width - pad.r + 6} y={y((rtop / 4) * k, rtop) + 3} className="adb-ax">{right.format(right.scale ? (top / 4) * k * right.scale : (rtop / 4) * k)}</text>}</g>)}
    {data.map((d, i) => { let acc = 0; const x0 = pad.l + bw * i + (bw - inner) / 2;
      return <g key={i}>{d.parts.map((p, j) => { if (stacked) { const y1 = y(acc + p.value), y0 = y(acc); acc += p.value; return <rect key={j} x={x0} y={y1} width={inner} height={Math.max(0, y0 - y1)} fill={p.color} />; }
        const w = inner / d.parts.length; return <rect key={j} x={x0 + w * j + w * .08} y={y(p.value)} width={w * .72} height={Math.max(0, y(0) - y(p.value))} fill={p.color} rx="1" />; })}</g>; })}
    {line && <path d={line.values.map((v, i) => `${i ? "L" : "M"}${(pad.l + bw * (i + .5)).toFixed(1)},${y(v, rtop).toFixed(1)}`).join("")} fill="none" stroke={line.color} strokeWidth="1.5" />}
    {labels.map((l, i) => i % every === 0 && <text key={i} x={pad.l + bw * (i + .5)} y={height - 5} textAnchor="middle" className="adb-ax">{l}</text>)}
  </svg>;
}

/** Ring gauge (SLA / risk). */
export function Gauge({ value, max = 100, size = 110, stroke = 10, color = "#ec3a52", track = "#eef1f8", children, arc = 1 }: { value: number; max?: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; arc?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, len = c * arc, frac = Math.max(0, Math.min(1, value / (max || 1)));
  const rot = arc < 1 ? 90 + (360 * (1 - arc)) / 2 : -90;
  return <div className="adb-gauge" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} strokeDasharray={`${len} ${c}`} strokeLinecap="round" transform={`rotate(${rot} ${size / 2} ${size / 2})`} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${len * frac} ${c}`} strokeLinecap="round" transform={`rotate(${rot} ${size / 2} ${size / 2})`} />
    </svg>
    <div className="adb-gauge-c">{children}</div>
  </div>;
}

/** Day buckets for the last `n` days ending now. */
export function dayBuckets<T>(items: T[], at: (t: T) => string, val: (t: T) => number, n: number, end = Date.now()) {
  return buckets(items, at, val, n, n, end);
}
/** `n` equal buckets covering the last `days` days ending now (trend lines use multi-day buckets so they read as trends). */
export function buckets<T>(items: T[], at: (t: T) => string, val: (t: T) => number, days: number, n: number, end = Date.now()) {
  const out = Array.from({ length: n }, () => 0);
  const span = (days * 864e5) / n, start = end - days * 864e5;
  for (const it of items) { const ms = new Date(at(it)).getTime(); if (ms < start || ms > end) continue; const i = Math.min(n - 1, Math.floor((ms - start) / span)); out[i] += val(it); }
  return out;
}

/** Running total of a bucketed series (backlog/volume trend lines). */
export const cumulative = (a: number[]) => a.map((_, i) => a.slice(0, i + 1).reduce((x, y) => x + y, 0));

/** Plain <img> for small, already-optimised local assets (thumbnails, avatars, covers). */
export function Img(props: { src: string; alt?: string; width: number; height: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" loading="lazy" {...props} />;
}
