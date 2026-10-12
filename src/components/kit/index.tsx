// Server-renderable UI primitives. Interactive pieces live in ./client.
import Link from "next/link";
import type { ReactNode, CSSProperties } from "react";
import { ArrowRight, ChevronRight, Sparkles, Check, type LucideIcon } from "lucide-react";
import { initials } from "@/lib/format";

type Tone = "blue" | "purple" | "green" | "amber" | "red" | "pink" | "cyan" | "gray" | "agent";

export function Card({ children, className = "", flush, tight, style, as: As = "section", ...rest }: { children: ReactNode; className?: string; flush?: boolean; tight?: boolean; style?: CSSProperties; as?: "section" | "div" | "article" | "aside"; "aria-label"?: string; id?: string }) {
  return <As className={`k-card ${flush ? "flush" : ""} ${tight ? "tight" : ""} ${className}`} style={style} {...rest}>{children}</As>;
}
export function CardHead({ title, sub, action, href, onClickLabel, children, level = 2 }: { title: ReactNode; sub?: ReactNode; action?: string; href?: string; onClickLabel?: string; children?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  return <div className="k-card-head"><div className="k-grow"><H>{title}</H>{sub && <p>{sub}</p>}</div>{children}{href && <Link className="k-link" href={href}>{action ?? "View all"} <ArrowRight size={13} aria-hidden /></Link>}{onClickLabel && <span className="k-link">{onClickLabel}</span>}</div>;
}
export function Chip({ children, tone, className = "", lg, icon: Icon }: { children: ReactNode; tone?: Tone | "solid-green" | "solid-blue" | "solid-purple" | "outline"; className?: string; lg?: boolean; icon?: LucideIcon }) {
  return <span className={`k-chip ${tone ?? ""} ${lg ? "lg" : ""} ${className}`}>{Icon && <Icon size={11} aria-hidden />}{children}</span>;
}
export const Tag = ({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) => <span className="k-tag">{Icon && <Icon size={11} aria-hidden />}{children}</span>;
export const Beta = () => <span className="k-beta">BETA</span>;
export function Tile({ icon: Icon, tone = "blue", size }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "lg" }) {
  return <span className={`k-tile ${tone} ${size ?? ""}`} aria-hidden><Icon size={size === "sm" ? 14 : size === "lg" ? 21 : 17} /></span>;
}
export function Btn({ children, variant = "primary", size, href, icon: Icon, iconRight: IconR, className = "", block, ...rest }: { children?: ReactNode; variant?: "primary" | "outline" | "ghost" | "soft" | "danger" | "agent" | "green"; size?: "sm" | "lg"; href?: string; icon?: LucideIcon; iconRight?: LucideIcon; className?: string; block?: boolean } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const cls = `k-btn ${variant} ${size ?? ""} ${block ? "block" : ""} ${className}`;
  const inner = <>{Icon && <Icon size={size === "sm" ? 13 : 15} aria-hidden />}{children}{IconR && <IconR size={size === "sm" ? 13 : 15} aria-hidden />}</>;
  if (href) return <Link className={cls} href={href} aria-label={rest["aria-label"]}>{inner}</Link>;
  return <button className={cls} type={rest.type ?? "button"} {...rest}>{inner}</button>;
}
export function Avatar({ src, name, size }: { src?: string | null; name: string; size?: "sm" | "lg" | "xl" }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={`k-avatar ${size ?? ""}`} src={src} alt={name} /> : <span className={`k-avatar ${size ?? ""}`} aria-label={name}>{initials(name)}</span>;
}
export function Avatars({ people, max = 4, more, size = "sm" }: { people: { name: string; avatar?: string | null }[]; max?: number; more?: number; size?: "sm" | "lg" }) {
  const extra = more ?? Math.max(0, people.length - max);
  return <span className="k-avatars">{people.slice(0, max).map((p, i) => <Avatar key={i} src={p.avatar} name={p.name} size={size} />)}{extra > 0 && <span className="more">+{extra}</span>}</span>;
}
export function Bar({ value, tone, thin, label }: { value: number; tone?: "green" | "purple" | "amber" | "red"; thin?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className={`k-bar ${tone ?? ""} ${thin ? "thin" : ""}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}><i style={{ width: `${v}%` }} /></div>;
}
export function StackBar({ parts, height }: { parts: { value: number; color: string; label?: string }[]; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return <div className="k-stack-bar" style={height ? { height } : undefined} role="img" aria-label={parts.map(p => `${p.label ?? ""} ${Math.round((100 * p.value) / total)}%`).join(", ")}>{parts.map((p, i) => <i key={i} style={{ width: `${(100 * p.value) / total}%`, background: p.color }} />)}</div>;
}
export function Ring({ value, size = 64, stroke = 7, color = "var(--k-blue)", track = "#e9edf6", label, sub, fontSize }: { value: number; size?: number; stroke?: number; color?: string; track?: string; label?: ReactNode; sub?: ReactNode; fontSize?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return <span className="k-ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v)}%`}>
    <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} /></svg>
    <span className="lbl" style={{ fontSize: fontSize ?? size / 4.4 }}><span>{label ?? `${Math.round(v)}%`}{sub && <small style={{ display: "block", fontSize: 10, fontWeight: 500, color: "var(--k-muted)" }}>{sub}</small>}</span></span>
  </span>;
}
/** Donut chart: segments with colors; centre label. */
export function Donut({ parts, size = 120, stroke = 16, label, sub }: { parts: { value: number; color: string; label: string }[]; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const lens = parts.map(p => (c * p.value) / total); const offs = lens.map((_, i) => lens.slice(0, i).reduce((s, x) => s + x, 0));
  return <span className="k-ring" style={{ width: size, height: size }} role="img" aria-label={parts.map(p => `${p.label} ${Math.round((100 * p.value) / total)}%`).join(", ")}>
    <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f8" strokeWidth={stroke} />{parts.map((p, i) => { const len = lens[i]!; return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-offs[i]!} />; })}</svg>
    <span className="lbl"><span style={{ fontSize: size / 7.5 }}>{label}{sub && <small style={{ display: "block", fontSize: 10.5, fontWeight: 500, color: "var(--k-muted)" }}>{sub}</small>}</span></span>
  </span>;
}
export function Legend({ items }: { items: { color: string; label: ReactNode; value?: ReactNode; extra?: ReactNode }[] }) {
  return <ul className="k-col" style={{ gap: 7, listStyle: "none", margin: 0, padding: 0, fontSize: 11 }}>{items.map((it, i) => <li key={i} className="k-between"><span className="k-row" style={{ gap: 7 }}><i className="k-dot" style={{ background: it.color }} />{it.label}</span><span className="k-row" style={{ gap: 14 }}>{it.extra && <span className="k-muted">{it.extra}</span>}{it.value != null && <b className="k-tnum" style={{ fontWeight: 600 }}>{it.value}</b>}</span></li>)}</ul>;
}
/** Sparkline / area line chart from numeric series. */
export function Spark({ data, width = 90, height = 34, color = "var(--k-blue)", fill = true, strokeWidth = 2 }: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean; strokeWidth?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const id = `sg${Math.abs(data.reduce((a, b) => a * 31 + b, 7) | 0)}`;
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ overflow: "visible", flexShrink: 0 }}>
    {fill && <><defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".25" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs><path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} /></>}
    <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}
/** Vertical bar chart with optional grouped series and axis labels. */
export function BarChart({ series, labels, height = 150, colors = ["var(--k-blue)", "#a78bfa"], yFormat = (v: number) => String(v), stacked = false, barWidth }: { series: number[][]; labels: string[]; height?: number; colors?: string[]; yFormat?: (v: number) => string; stacked?: boolean; barWidth?: number }) {
  const n = labels.length, sums = labels.map((_, i) => series.reduce((s, ser) => s + (ser[i] ?? 0), 0));
  const max = Math.max(1, ...(stacked ? sums : series.flat())), nice = Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const ticks = [0, .25, .5, .75, 1].map(t => t * nice);
  return <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, fontSize: 10, color: "var(--k-muted)" }} role="img" aria-label="Bar chart">
    <div style={{ display: "flex", flexDirection: "column-reverse", justifyContent: "space-between", height, textAlign: "right" }}>{ticks.map(t => <span key={t} style={{ lineHeight: 1 }}>{yFormat(t)}</span>)}</div>
    <div>
      <div style={{ position: "relative", height, display: "flex", alignItems: "flex-end", gap: 4, borderBottom: "1px solid var(--k-line)" }}>
        {ticks.slice(1).map(t => <i key={t} style={{ position: "absolute", left: 0, right: 0, bottom: `${(t / nice) * 100}%`, borderTop: "1px dashed #eef1f7" }} />)}
        {labels.map((l, i) => <div key={l + i} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: "100%", flexDirection: stacked ? "column-reverse" : "row", position: "relative" }}>
          {series.map((ser, s) => <i key={s} title={`${l}: ${yFormat(ser[i] ?? 0)}`} style={{ display: "block", width: barWidth ?? (stacked ? "60%" : `${Math.max(18, 70 / series.length)}%`), maxWidth: 22, height: `${((ser[i] ?? 0) / nice) * 100}%`, background: colors[s % colors.length], borderRadius: stacked ? 0 : "3px 3px 0 0", alignSelf: stacked ? "center" : undefined }} />)}
        </div>)}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>{labels.map((l, i) => <span key={l + i} style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap" }}>{(n > 12 && i % Math.ceil(n / 6)) ? "" : l}</span>)}</div>
    </div>
  </div>;
}
/** Multi-line chart. */
export function LineChart({ series, labels, height = 150, yFormat = (v: number) => String(v), dashed = [] }: { series: { data: (number | null)[]; color: string; label: string; fill?: boolean }[]; labels: string[]; height?: number; yFormat?: (v: number) => string; dashed?: number[] }) {
  const w = 400, vals = series.flatMap(s => s.data.filter((v): v is number => v != null)), max = Math.max(1, ...vals);
  const nice = Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const ticks = [0, .25, .5, .75, 1].map(t => t * nice);
  const x = (i: number) => (i / Math.max(1, labels.length - 1)) * w, y = (v: number) => height - (v / nice) * height;
  return <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, fontSize: 10, color: "var(--k-muted)" }} role="img" aria-label={series.map(s => s.label).join(", ")}>
    <div style={{ display: "flex", flexDirection: "column-reverse", justifyContent: "space-between", height, textAlign: "right" }}>{ticks.map(t => <span key={t} style={{ lineHeight: 1 }}>{yFormat(t)}</span>)}</div>
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", overflow: "visible" }}>
        {ticks.slice(1).map(t => <line key={t} x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="#eef1f7" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />)}
        {series.map((s, si) => { const pts = s.data.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean) as string[]; if (pts.length < 2) return null; return <g key={si}>{s.fill && <path d={`M${pts.join(" L")} L${x(s.data.length - 1)},${height} L0,${height} Z`} fill={s.color} opacity=".08" />}<polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={dashed.includes(si) ? "5 4" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></g>; })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>{labels.map((l, i) => <span key={i} style={{ whiteSpace: "nowrap", visibility: labels.length > 8 && i % Math.ceil(labels.length / 6) ? "hidden" : "visible" }}>{l}</span>)}</div>
    </div>
  </div>;
}
export function Kpi({ icon, tone = "blue", label, value, sub, delta, spark, sparkColor, iconRight }: { icon?: LucideIcon; tone?: Tone; label: ReactNode; value: ReactNode; sub?: ReactNode; delta?: number | string; spark?: number[]; sparkColor?: string; iconRight?: boolean }) {
  const d = typeof delta === "number" ? delta : undefined;
  return <div className="k-kpi">{icon && !iconRight && <Tile icon={icon} tone={tone} />}<div className="k-grow"><div className="lbl">{label}</div><div className="val">{value}</div>{(sub || delta != null) && <div className="sub">{delta != null && <span className={d != null && d < 0 ? "down" : "up"}>{d != null ? `${d >= 0 ? "↑" : "↓"} ${Math.abs(d)}%` : delta}</span>}{sub}</div>}</div>{spark && <Spark data={spark} color={sparkColor} width={80} height={36} />}{icon && iconRight && <Tile icon={icon} tone={tone} size="lg" />}</div>;
}
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav aria-label="Breadcrumb" className="k-crumbs">{items.map((it, i) => <span key={i} className="k-row" style={{ gap: 8 }}>{i > 0 && <span aria-hidden>/</span>}{it.href && i < items.length - 1 ? <Link href={it.href}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{it.label}</span>}</span>)}</nav>;
}
export function PageHead({ crumbs, title, sub, actions, children }: { crumbs?: { label: string; href?: string }[]; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return <header className="k-col" style={{ gap: 10 }}>{crumbs && <Crumbs items={crumbs} />}<div className="k-page-head"><div className="k-grow"><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{actions && <div className="k-row k-wrap" style={{ gap: 8 }}>{actions}</div>}</div>{children}</header>;
}
/** Link-based tabs (URL is source of truth). */
export function LinkTabs({ tabs, current, className = "", size }: { tabs: { key: string; label: ReactNode; href: string; count?: ReactNode; icon?: LucideIcon }[]; current: string; className?: string; size?: "sm" }) {
  return <nav className={`k-tabs ${size ?? ""} ${className}`} aria-label="Sections">{tabs.map(t => <Link key={t.key} href={t.href} className="k-tab" aria-current={t.key === current ? "page" : undefined} scroll={false}>{t.icon && <t.icon size={15} aria-hidden />}{t.label}{t.count != null && <span className="k-count">{t.count}</span>}</Link>)}</nav>;
}
export function LinkSeg({ items, current, solid }: { items: { key: string; label: ReactNode; href: string; icon?: LucideIcon }[]; current: string; solid?: boolean }) {
  return <div className={`k-seg ${solid ? "solid" : ""}`} role="tablist">{items.map(t => <Link key={t.key} href={t.href} aria-current={(t.key === current) ? "page" : undefined} scroll={false}>{t.icon && <t.icon size={14} aria-hidden />}{t.label}</Link>)}</div>;
}
export function Steps({ steps, current, hrefFor }: { steps: { title: string; sub?: string }[]; current: number; hrefFor?: (n: number) => string }) {
  return <ol className="k-steps" aria-label="Progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>{steps.map((s, i) => { const n = i + 1, state = n < current ? "done" : n === current ? "current" : "todo"; const inner = <><span className="n">{state === "done" ? <Check size={14} /> : n}</span><span><b>{s.title}</b>{s.sub && <small>{s.sub}</small>}</span></>; return <li key={s.title} className="k-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>{hrefFor && n < current ? <Link href={hrefFor(n)} className="k-row" style={{ gap: 10 }}>{inner}</Link> : inner}</li>; })}</ol>;
}
export function VSteps({ steps, current, hrefFor }: { steps: { title: string; sub?: string }[]; current: number; hrefFor?: (n: number) => string }) {
  return <ol className="k-vsteps" aria-label="Progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>{steps.map((s, i) => { const n = i + 1, state = n < current ? "done" : n === current ? "current" : "todo"; const inner = <><span className="n">{state === "done" ? <Check size={13} /> : n}</span><span><b>{s.title}</b>{s.sub && <small>{s.sub}</small>}</span></>; return <li key={s.title} className="k-vstep" data-state={state} aria-current={state === "current" ? "step" : undefined}>{hrefFor && n < current ? <Link href={hrefFor(n)} className="k-row" style={{ gap: 12, alignItems: "flex-start" }}>{inner}</Link> : inner}</li>; })}</ol>;
}
export function Empty({ icon: Icon, title, text, action }: { icon?: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return <div className="k-empty">{Icon && <Tile icon={Icon} tone="blue" size="lg" />}<h3>{title}</h3>{text && <p style={{ maxWidth: 360 }}>{text}</p>}{action}</div>;
}
export function Photo({ src, alt = "", h, w, radius, children, className = "", style }: { src?: string | null; alt?: string; h?: number | string; w?: number | string; radius?: number; children?: ReactNode; className?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={`k-photo ${className}`} style={{ height: h, width: w, borderRadius: radius, ...style }}>{src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : null}{children}</div>;
}
export function DateBox({ mon, day }: { mon: string; day: string }) {
  return <div className="k-datebox" aria-label={`${mon} ${day}`}><div className="m">{mon}</div><div className="d">{day}</div></div>;
}
export function AgentStatic({ title = "Gala Agent", text, cta, href }: { title?: string; text: string; cta?: string; href?: string }) {
  return <div className="k-agent"><div className="k-agent-head"><Sparkles size={16} className="k-spark" aria-hidden /><h3>{title}</h3><Beta /></div><p>{text}</p>{cta && href && <Link href={href} className="k-btn outline sm" style={{ marginTop: 10 }}>{cta}</Link>}</div>;
}
export function RowLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={`k-li ${className}`} style={{ textDecoration: "none" }}>{children}<ChevronRight size={15} className="k-muted" aria-hidden style={{ marginLeft: "auto" }} /></Link>;
}
export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "green" | "red" | "amber" | "blue" | "purple" }) {
  return <div className="k-col" style={{ gap: 2 }}><span className="k-small k-muted">{label}</span><b className={`k-tnum ${tone ? `k-${tone}` : ""}`} style={{ fontSize: 15, fontWeight: 700 }}>{value}</b>{sub && <span className="k-xs k-muted">{sub}</span>}</div>;
}
