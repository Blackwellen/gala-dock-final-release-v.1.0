import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ArrowRight, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { Sparkline, type Tone } from "@/components/workspace/kit";
import { ParamSelect } from "./client";
import { qs, type SP } from "./lib";

/* Server-safe presentational pieces for the Admin A screens (users, workspaces, events, marketplace, tickets). */

export function Pager({ base, sp, page, per, total }: { base: string; sp: SP; page: number; per: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / per));
  const from = total ? (page - 1) * per + 1 : 0, to = Math.min(total, page * per);
  const nums = [...new Set([1, 2, 3, 4, 5].filter(n => n <= pages).concat(page <= pages ? [page] : []))].sort((a, b) => a - b);
  const href = (n: number) => qs(base, sp, { page: n === 1 ? null : n, sel: null });
  return <nav className="aa-pager" aria-label="Pagination">
    <span className="aa-pager-per">Show <Suspense><ParamSelect param="per" label="Rows per page" value={String(per)} className="aa-select sm"
      options={[{ value: "10", label: "10" }, { value: "25", label: "25" }, { value: "50", label: "50" }]} /></Suspense> per page</span>
    <span className="aa-pager-range">{from.toLocaleString("en-GB")}–{to.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}</span>
    <span className="aa-pager-pages">
      {page > 1 ? <Link href={href(page - 1)} aria-label="Previous page"><ChevronLeft aria-hidden="true" /></Link> : <span className="off"><ChevronLeft aria-hidden="true" /></span>}
      {nums.map(n => n === page ? <span key={n} className="cur" aria-current="page">{n}</span> : <Link key={n} href={href(n)}>{n}</Link>)}
      {pages > 6 && <><span className="gap">…</span><Link href={href(pages)}>{pages.toLocaleString("en-GB")}</Link></>}
      {page < pages ? <Link href={href(page + 1)} aria-label="Next page"><ChevronRight aria-hidden="true" /></Link> : <span className="off"><ChevronRight aria-hidden="true" /></span>}
    </span>
  </nav>;
}

/** Pill filter tabs with counts that keep the other params. */
export function PillTabs({ base, sp, param = "filter", active, tabs }: { base: string; sp: SP; param?: string; active: string; tabs: { key: string; label: string; count?: number; tone?: "red" }[] }) {
  return <nav className="aa-pills" aria-label="Filter">{tabs.map((t, i) => {
    const on = t.key === active;
    return <Link key={t.key} scroll={false} href={qs(base, sp, { [param]: i === 0 ? null : t.key, page: null, sel: null })} aria-current={on ? "page" : undefined} className={on ? "on" : ""}>
      {t.label}{t.count !== undefined && <b className={t.tone ?? ""}>{t.count.toLocaleString("en-GB")}</b>}</Link>;
  })}</nav>;
}

/** Underline tabs that keep the other params. */
export function LineTabs({ base, sp, param = "tab", active, tabs, className = "" }: { base: string; sp: SP; param?: string; active: string; tabs: { key: string; label: string }[]; className?: string }) {
  return <nav className={`aa-line-tabs ${className}`} aria-label="Sections">{tabs.map((t, i) => <Link key={t.key} scroll={false}
    href={qs(base, sp, { [param]: i === 0 ? null : t.key, page: null, sel: null })} aria-current={t.key === active ? "page" : undefined} className={t.key === active ? "on" : ""}>{t.label}</Link>)}</nav>;
}

const statusTone: Record<string, Tone> = {
  active: "green", verified: "green", healthy: "green", approved: "green", paid: "green", valid: "green", confirmed: "green", completed: "grey", used: "grey", resolved: "green", on_sale: "green", published: "green",
  restricted: "red", suspended: "red", at_risk: "red", cancelled: "red", rejected: "red", fraud: "red", refunded: "amber", sold_out: "red", open: "red",
  pending: "amber", review: "amber", unverified: "amber", changes_requested: "amber", waiting: "amber", in_review: "amber", paused: "amber", draft: "grey", live: "red", upcoming: "blue", ready: "blue", scheduled: "blue", past: "grey",
};
export function Status({ value, label, dot = true }: { value: string; label?: string; dot?: boolean }) {
  return <span className={`aa-status ${statusTone[value] ?? "grey"} ${dot ? "dot" : ""}`}>{label ?? value.replaceAll("_", " ").replace(/^\w/, c => c.toUpperCase())}</span>;
}

export function Delta({ value, invert = false, suffix }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null) return <span className="aa-delta flat">{suffix ? "No prior period" : "—"}</span>;
  const good = invert ? value <= 0 : value >= 0, Icon = value >= 0 ? ArrowUp : ArrowDown;
  return <span className={`aa-delta ${good ? "up" : "down"}`}><Icon aria-hidden="true" />{Math.abs(value)}%{suffix && <small>{suffix}</small>}</span>;
}

/** Drawer performance tile: value, label, delta and a sparkline. */
export function MiniStat({ value, label, delta, series, tone = "blue", invert }: { value: ReactNode; label: string; delta?: number | null; series?: number[]; tone?: Tone; invert?: boolean }) {
  return <div className="aa-mini"><div><strong>{value}</strong><span>{label}</span>{delta !== undefined && <Delta value={delta} invert={invert} />}</div>
    {series && <Sparkline values={series} tone={tone} width={70} height={34} />}</div>;
}

export function SectionHead({ title, href, label = "View all", children }: { title: ReactNode; href?: string; label?: string; children?: ReactNode }) {
  return <div className="aa-sec-head"><h3>{title}</h3>{children}{href && <Link href={href} className="aa-link">{label} <ArrowRight aria-hidden="true" /></Link>}</div>;
}

export function DrawerClose({ href }: { href: string }) {
  return <Link href={href} scroll={false} className="aa-x" aria-label="Close details"><X aria-hidden="true" /></Link>;
}

export function TimelineItem({ icon: Icon, title, meta, tone = "blue" }: { icon: LucideIcon; title: ReactNode; meta: ReactNode; tone?: Tone }) {
  return <li className="aa-tl"><span className={`aa-tl-ico ${tone}`}><Icon aria-hidden="true" /></span><div><b>{title}</b><small>{meta}</small></div></li>;
}

export function KVRows({ rows, className = "" }: { rows: [ReactNode, ReactNode, ReactNode?][]; className?: string }) {
  return <dl className={`aa-kv ${className}`}>{rows.map(([k, v, x], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd>{x !== undefined && <dd className="x">{x}</dd>}</div>)}</dl>;
}

/** Small country flag (UK drawn inline — Windows has no flag emoji font); other countries show their ISO code. */
export function Flag({ country }: { country?: string | null }) {
  if (!country) return null;
  if (country.toUpperCase() !== "GB") return <span className="aa-cc">{country.toUpperCase()}</span>;
  return <svg className="aa-flag-gb" viewBox="0 0 60 30" width="16" height="11" aria-label="United Kingdom" role="img">
    <clipPath id="aa-gb"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
    <path d="M0,0 v30 h60 v-30 z" fill="#012169" /><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
    <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#aa-gb)" stroke="#C8102E" strokeWidth="4" />
    <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" /><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
  </svg>;
}
