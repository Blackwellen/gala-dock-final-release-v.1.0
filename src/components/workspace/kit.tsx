import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUp, ArrowDown, Lock, Inbox, type LucideIcon } from "lucide-react";

/* Server-safe presentational primitives for Provider and Admin. Interactive pieces live in ./actions.tsx. */

export type Tone = "blue" | "purple" | "green" | "orange" | "red" | "pink" | "grey" | "teal" | "amber";
const toneHex: Record<Tone, string> = {
  blue: "#2f6bff", purple: "#8b3dff", green: "#16b67a", orange: "#ff9a1f", red: "#f0445f", pink: "#e8389d", grey: "#98a2c3", teal: "#14b8a6", amber: "#f5a524",
};

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return <header className="ws-page-head">
    <div>
      {back && <Link className="ws-back" href={back.href}>← {back.label}</Link>}
      <h1>{title}</h1>{subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="ws-page-actions">{actions}</div>}
  </header>;
}

export function IconTile({ icon: Icon, tone = "blue", size = 44 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  return <span className={`ws-tile ${tone}`} style={{ width: size, height: size }}><Icon aria-hidden="true" /></span>;
}

/** Smooth sparkline with soft area fill, drawn from real series values. */
export function Sparkline({ values, tone = "blue", width = 92, height = 40 }: { values: number[]; tone?: Tone; width?: number; height?: number }) {
  const series = values.length > 1 ? values : [0, 0];
  const max = Math.max(...series), min = Math.min(...series), span = max - min || 1;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 8)] as const);
  const d = pts.map(([x, y], i) => {
    if (!i) return `M${x.toFixed(1)},${y.toFixed(1)}`;
    const [px, py] = pts[i - 1]!; const cx = (px + x) / 2;
    return `C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("");
  const id = `sg-${tone}-${series.length}-${Math.round(series.reduce((a, b) => a + b, 0))}`;
  return <svg className="ws-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={toneHex[tone]} stopOpacity=".28" /><stop offset="1" stopColor={toneHex[tone]} stopOpacity="0" /></linearGradient></defs>
    <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />
    <path d={d} fill="none" stroke={toneHex[tone]} strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

export function Delta({ value, suffix = "vs last 30 days", invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null) return <small className="ws-delta flat">No prior period</small>;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUp : ArrowDown;
  return <span className="ws-delta-wrap"><b className={`ws-delta ${good ? "up" : "down"}`}><Icon aria-hidden="true" />{Math.abs(value)}%</b>{suffix && <small>{suffix}</small>}</span>;
}

export function Kpi({ icon, tone = "blue", label, value, delta, deltaSuffix, series, invert, href }: {
  icon: LucideIcon; tone?: Tone; label: string; value: ReactNode; delta?: number | null; deltaSuffix?: string; series?: number[]; invert?: boolean; href?: string;
}) {
  const body = <>
    <IconTile icon={icon} tone={tone} />
    <div className="ws-kpi-text"><span>{label}</span><strong>{value}</strong>{delta !== undefined && <Delta value={delta} suffix={deltaSuffix} invert={invert} />}</div>
    {series && <Sparkline values={series} tone={tone} />}
  </>;
  return href ? <Link href={href} className="ws-kpi">{body}</Link> : <div className="ws-kpi">{body}</div>;
}

export function Panel({ title, action, children, className = "", subtitle, id }: { title?: ReactNode; subtitle?: ReactNode; action?: { href: string; label: string } | ReactNode; children: ReactNode; className?: string; id?: string }) {
  const act = action && typeof action === "object" && "href" in (action as object) ? action as { href: string; label: string } : null;
  return <section className={`ws-panel ${className}`} id={id} aria-labelledby={id && title ? `${id}-title` : undefined}>
    {(title || action) && <div className="ws-panel-head">
      <div>{title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>
      {act ? <Link href={act.href} className="ws-link">{act.label} <ArrowRight aria-hidden="true" /></Link> : action as ReactNode}
    </div>}
    {children}
  </section>;
}

/** URL-driven tabs (deep-linkable, work without JS). */
export function Tabs({ tabs, active, base, param = "tab", variant = "underline" }: {
  tabs: { key: string; label: string; count?: number }[]; active: string; base: string; param?: string; variant?: "underline" | "pill" | "segment";
}) {
  return <nav className={`ws-tabs ${variant}`} aria-label="Sections">{tabs.map((t, i) => {
    const href = i === 0 && param === "tab" ? base : `${base}${base.includes("?") ? "&" : "?"}${param}=${t.key}`;
    const on = t.key === active;
    return <Link key={t.key} href={href} aria-current={on ? "page" : undefined} className={on ? "active" : ""} scroll={false}>
      {t.label}{t.count !== undefined && (variant === "pill" ? <b>{t.count.toLocaleString("en-GB")}</b> : ` (${t.count})`)}
    </Link>;
  })}</nav>;
}

export function Chip({ tone = "grey", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`ws-chip ${tone} ${dot ? "dot" : ""}`}>{children}</span>;
}

export function Avatar({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="ws-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
    : <span className="ws-avatar initials" style={{ width: size, height: size, fontSize: size * .38 }} aria-hidden="true">{letters}</span>;
}

export function Thumb({ src, alt = "", w = 44, h = 44 }: { src?: string | null; alt?: string; w?: number; h?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="ws-thumb" src={src} alt={alt} width={w} height={h} style={{ width: w, height: h }} loading="lazy" /> : <span className="ws-thumb blank" style={{ width: w, height: h }} />;
}

export function Ring({ value, size = 36, tone }: { value: number; size?: number; tone?: Tone }) {
  const t: Tone = tone ?? (value >= 85 ? "green" : value >= 70 ? "amber" : "red");
  const r = (size - 5) / 2, c = 2 * Math.PI * r;
  return <span className="ws-ring" style={{ width: size, height: size }} role="img" aria-label={`${value}%`}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#edf0f8" strokeWidth="3.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneHex[t]} strokeWidth="3.5" strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg><b>{value}%</b>
  </span>;
}

export function Meter({ value, max = 100, tone = "blue" }: { value: number; max?: number; tone?: Tone }) {
  return <span className="ws-meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><i style={{ width: `${Math.min(100, (value / (max || 1)) * 100)}%`, background: toneHex[tone] }} /></span>;
}

/** Vertical bar chart with gridlines; values from real aggregates. */
export function BarChart({ data, height = 190, tone = "purple", format = (v: number) => String(v), stacked }: {
  data: { label: string; value: number; parts?: { value: number; tone: Tone }[] }[]; height?: number; tone?: Tone; format?: (v: number) => string; stacked?: boolean;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  const step = niceStep(max / 4); const top = Math.ceil(max / step) * step || 1;
  const ticks = [0, 1, 2, 3, 4].map(i => (top / 4) * i).reverse();
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));
  return <div className="ws-bars" style={{ height }} role="img" aria-label={`Chart: ${data.map(d => `${d.label} ${format(d.value)}`).join(", ")}`}>
    <div className="ws-bars-axis">{ticks.map(t => <span key={t}>{format(t)}</span>)}</div>
    <div className="ws-bars-plot">
      {ticks.map(t => <i key={t} className="grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
      {data.map((d, i) => <div key={i} className="ws-bar-col">
        {stacked && d.parts ? <div className="ws-bar stacked" style={{ height: `${(d.value / top) * 100}%` }}>{d.parts.map((p, j) => <span key={j} style={{ flex: p.value, background: toneHex[p.tone] }} />)}</div>
          : <div className={`ws-bar ${tone}`} style={{ height: `${(d.value / top) * 100}%` }} />}
        {i % labelEvery === 0 && <small>{d.label}</small>}
      </div>)}
    </div>
  </div>;
}
function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw || 1)); const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

export function Donut({ parts, size = 150, thickness = 18, center }: { parts: { label: string; value: number; tone: Tone }[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  const lens = parts.map(p => (p.value / total) * c);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return <div className="ws-donut" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={parts.map(p => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f8" strokeWidth={thickness} />
      {parts.map((p, i) => <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneHex[p.tone]} strokeWidth={thickness}
        strokeDasharray={`${Math.max(0, lens[i]! - 1.5)} ${c}`} strokeDashoffset={-offsets[i]!} transform={`rotate(-90 ${size / 2} ${size / 2})`} />)}
    </svg>
    {center && <div className="ws-donut-center">{center}</div>}
  </div>;
}

export function Legend({ items }: { items: { label: string; value?: ReactNode; extra?: ReactNode; tone: Tone }[] }) {
  return <ul className="ws-legend">{items.map(i => <li key={i.label}><i style={{ background: toneHex[i.tone] }} /><span>{i.label}</span>{i.value !== undefined && <b>{i.value}</b>}{i.extra && <em>{i.extra}</em>}</li>)}</ul>;
}

export function Empty({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: ReactNode; icon?: LucideIcon }) {
  return <div className="ws-empty"><span><Icon aria-hidden="true" /></span><b>{title}</b>{text && <p>{text}</p>}{action}</div>;
}

export function Restricted({ area }: { area: string }) {
  return <div className="ws-restricted"><span><Lock aria-hidden="true" /></span><h1>{area} is restricted</h1>
    <p>Your admin role doesn’t include the permission for this area. Ask a platform owner to grant access; requests are recorded in the audit log.</p>
    <Link className="ws-btn outline" href="/admin">Back to Overview</Link></div>;
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return <dl className="ws-kv">{items.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export const tones = toneHex;
