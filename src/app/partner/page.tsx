import type { Metadata } from "next";
import Link from "next/link";
import { House, Share2, BadgePoundSterling, FileText, Users, CalendarDays, Database, Percent, ChevronRight, ChevronDown, CircleCheck, Download, Headset, ArrowRight, type LucideIcon } from "lucide-react";
import "@/styles/portal-partner.css";
import { Sparkline } from "@/components/workspace/kit";
import { PortalShell, PortalPanel, PortalChip, type ChipTone } from "@/components/portal/shell";
import { AbsoluteUrl, CopyButton, SocialLink } from "@/components/portal/client";
import { BrandGlyph } from "@/components/portal/brand";
import { partnerHero } from "@/components/portal/media";
import { fmt, pctDelta } from "@/components/portal/format";
import { money, num, requestTime } from "@/lib/workspace/format";
import { loadPartner, RESOURCES, type Earning, type Referral, type Statement } from "./_data";
import { SupportForm } from "./support-form";

export const metadata: Metadata = { title: "Partner portal · Gala Dock", robots: { index: false, follow: false } };

const VIEWS = ["overview", "referrals", "earnings", "resources", "support"] as const;
type ViewKey = typeof VIEWS[number];
const PERIODS: Record<string, string> = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days" };
const KIND: Record<Referral["kind"], string> = { organiser: "Event Organiser", venue: "Venue", supplier: "Supplier" };
const REF_TONE: Record<Referral["status"], [string, string]> = { active: ["green", "Active"], trial: ["blue", "Trial"], pending: ["amber", "Pending"], churned: ["grey", "Churned"] };
const STMT: Record<Statement["status"], [ChipTone, string]> = { open: ["amber", "Pending"], pending: ["blue", "Payable"], paid: ["green", "Paid"], on_hold: ["red", "On hold"] };
const DAY = 864e5;

function Kpi({ icon: Icon, tone, label, value, delta, series, spark }: { icon: LucideIcon; tone: string; label: string; value: string; delta: number | null; series: number[]; spark: "blue" | "green" | "purple" | "pink"; }) {
  return <div className="pr-kpi"><span className={`pt-kpi-ic ${tone}`}><Icon aria-hidden="true" /></span>
    <div className="pr-kpi-t"><span>{label}</span><strong>{value}</strong>{delta === null ? <small>No prior period</small> : <><b className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%</b><small>vs previous {series.length} days</small></>}</div>
    <Sparkline values={series} tone={spark} width={88} height={52} /></div>;
}

function RevenueChart({ days }: { days: { t: number; rev: number; com: number }[] }) {
  const W = 500, H = 158, pad = { l: 46, r: 6, t: 8, b: 24 };
  const max = Math.max(500, ...days.map(d => d.rev)), step = max > 1500 ? 500 : max > 600 ? 250 : 100, top = Math.ceil(max / step) * step;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top), bw = (W - pad.l - pad.r) / Math.max(1, days.length);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  const every = Math.max(1, Math.round(days.length / 5));
  return <svg viewBox={`0 0 ${W} ${H}`} className="pr-chart" role="img" aria-label={`Daily eligible revenue and commission over ${days.length} days`}>
    <defs><linearGradient id="pr-rev" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2f7bff" /><stop offset="1" stopColor="#8db6ff" /></linearGradient>
      <linearGradient id="pr-com" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7a2ff0" /><stop offset="1" stopColor="#a874ff" /></linearGradient></defs>
    {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="pr-grid" /><text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" className="pr-ax">£{t.toLocaleString("en-GB")}</text></g>)}
    {days.map((d, i) => { const x = pad.l + bw * i + bw * 0.22, w = Math.max(2, bw * 0.56);
      return <g key={d.t}><title>{`${fmt(d.t, { day: "numeric", month: "short" })}: eligible ${money(d.rev)}, commission ${money(d.com)}`}</title>
        <rect x={x} y={y(d.rev)} width={w} height={Math.max(0, y(0) - y(d.rev))} rx={2} fill="url(#pr-rev)" opacity=".85" />
        <rect x={x} y={y(d.com)} width={w} height={Math.max(0, y(0) - y(d.com))} rx={2} fill="url(#pr-com)" /></g>; })}
    {days.map((d, i) => i % every === 0 && <text key={`l${d.t}`} x={pad.l + bw * (i + 0.5)} y={H - 6} textAnchor="middle" className="pr-ax">{fmt(d.t, { month: "short", day: "numeric" })}</text>)}
  </svg>;
}

export default async function PartnerPage(props: PageProps<"/partner">) {
  const sp = await props.searchParams;
  const view: ViewKey = VIEWS.includes(sp.view as ViewKey) ? sp.view as ViewKey : "overview";
  const periodKey = typeof sp.period === "string" && PERIODS[sp.period] ? sp.period : "30";
  const n = Number(periodKey);
  const data = await loadPartner();
  const href = (k: ViewKey, extra = "") => `/partner?${k === "overview" ? "" : `view=${k}&`}period=${periodKey}${extra}`;
  const nav = [
    { href: href("overview"), label: "Overview", icon: House, active: view === "overview" },
    { href: href("referrals"), label: "Referrals", icon: Share2, active: view === "referrals" },
    { href: href("earnings"), label: "Earnings", icon: BadgePoundSterling, active: view === "earnings" },
    { href: href("resources"), label: "Resources", icon: FileText, active: view === "resources" },
  ];
  const first = data.me.name.split(/\s+/)[0];
  const sideFooter = <aside className="pr-support"><span><Headset aria-hidden="true" /></span><h2>Partner Support</h2><p>Need help with your partnership? Get in touch with our team.</p>
    <Link href={href("support")} className="pt-btn outline">Contact Support <ArrowRight aria-hidden="true" /></Link></aside>;
  const shell = { user: { name: data.me.name, detail: data.me.email, avatar: data.me.avatar, signOut: true }, nav, sideFooter,
    portal: { title: "Partner Portal", subtitle: "Gala Dock Partner", thumb: "/assets/gd/oe-neon.webp" }, context: { label: "Partner Portal", thumb: "/assets/gd/oe-neon.webp" },
    searchPlaceholder: "Search referrals, content or resources…" };
  if (!data.partner) return <PortalShell {...shell} links={{ messages: "/partner", notifications: "/partner", help: "/partner" }}>
    <div className="pt-panel pr-none"><h1>You’re not a Gala Dock partner yet</h1><p>Partner accounts are set up by the Gala Dock partnerships team. If you’ve been invited, sign in with the email address the invitation was sent to.</p></div>
  </PortalShell>;

  const { partner: p, referrals, earnings, statements, content } = data;
  const now = requestTime();
  const inRange = (iso: string, a: number, b: number) => { const t = Date.parse(iso); return t >= now - a * DAY && t < now - b * DAY; };
  const cur = (l: Earning[]) => l.filter(e => e.status !== "reversed" && inRange(e.occurred_at, n, 0)), prev = (l: Earning[]) => l.filter(e => e.status !== "reversed" && inRange(e.occurred_at, 2 * n, n));
  const sum = (l: Earning[], k: "eligible_revenue" | "commission") => l.reduce((a, e) => a + Number(e[k]), 0);
  const signups = referrals.filter(r => inRange(r.signed_up_at, n, 0)).length, signupsPrev = referrals.filter(r => inRange(r.signed_up_at, 2 * n, n)).length;
  const active = referrals.filter(r => r.status === "active").length, activeBefore = referrals.filter(r => r.status === "active" && r.activated_at && Date.parse(r.activated_at) < now - n * DAY).length;
  const rev = sum(cur(earnings), "eligible_revenue"), revPrev = sum(prev(earnings), "eligible_revenue");
  const com = sum(cur(earnings), "commission"), comPrev = sum(prev(earnings), "commission");
  const dayStart = (i: number) => now - (n - 1 - i) * DAY;
  const days = Array.from({ length: n }, (_, i) => { const t = dayStart(i), key = fmt(t, { year: "numeric", month: "2-digit", day: "2-digit" });
    const l = earnings.filter(e => e.status !== "reversed" && fmt(e.occurred_at, { year: "numeric", month: "2-digit", day: "2-digit" }) === key);
    return { t, rev: sum(l, "eligible_revenue"), com: sum(l, "commission") }; });
  const cumulative = (xs: number[]) => xs.reduce<number[]>((a, x) => [...a, (a.at(-1) ?? 0) + x], []);
  const signupSeries = cumulative(Array.from({ length: n }, (_, i) => referrals.filter(r => { const t = Date.parse(r.signed_up_at); return t >= dayStart(i) - DAY && t < dayStart(i); }).length));
  const activeSeries = Array.from({ length: n }, (_, i) => referrals.filter(r => r.status === "active" && r.activated_at && Date.parse(r.activated_at) < dayStart(i)).length);
  const pendingCom = earnings.filter(e => e.status === "pending").reduce((a, e) => a + Number(e.commission), 0);
  const nextStmt = statements.filter(s => s.status === "pending" && s.payout_due).sort((a, b) => a.payout_due!.localeCompare(b.payout_due!))[0];
  const inDays = nextStmt ? Math.max(0, Math.ceil((Date.parse(`${nextStmt.payout_due}T12:00:00Z`) - now) / DAY)) : null;
  const link = `/?ref=${encodeURIComponent(p.referral_code ?? "")}`;
  const hour = Number(fmt(now, { hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const rate = (c: { clicks: number; signups: number }) => (c.clicks ? (100 * c.signups) / c.clicks : 0);
  const topContent = [...content].sort((a, b) => rate(b) - rate(a));
  const refTable = (list: Referral[]) => <div className="pt-scroll"><table className="pt-table pr-table"><thead><tr><th>Date</th><th>Name</th><th>Type</th><th>Status</th><th aria-label="Open" /></tr></thead>
    <tbody>{list.map(r => { const [tone, label] = REF_TONE[r.status]; return <tr key={r.id} data-q={`${r.name} ${KIND[r.kind]}`}><td>{fmt(r.signed_up_at)}</td><td>{r.name}</td><td className="m">{KIND[r.kind]}</td>
      <td><span className={`pr-st ${tone}`}>{label}</span></td><td><Link href={href("referrals", `#r-${r.id}`)} aria-label={`Open ${r.name}`}><ChevronRight aria-hidden="true" /></Link></td></tr>; })}</tbody></table>
    {!list.length && <p className="pt-empty">No referrals yet — share your link to get started.</p>}</div>;
  const stmtTable = (list: Statement[]) => <div className="pt-scroll"><table className="pt-table pr-table"><thead><tr><th>Period</th><th>Eligible revenue</th><th>Commission</th><th>Status</th>{view === "earnings" && <><th>Payout</th><th>Reference</th></>}</tr></thead>
    <tbody>{list.map(s => { const [tone, label] = STMT[s.status]; return <tr key={s.id} data-q={fmt(s.period_start, { month: "short", year: "numeric" })}><td>{fmt(s.period_start, { month: "short", year: "numeric" })}</td><td>{money(s.eligible_revenue)}</td>
      <td>{money(s.commission)}</td><td><PortalChip tone={tone} dot>{label}</PortalChip></td>
      {view === "earnings" && <><td>{s.paid_at ? `Paid ${fmt(s.paid_at)}` : s.payout_due ? `Due ${fmt(s.payout_due)}` : "After month end"}</td><td>{s.reference ?? "—"}</td></>}</tr>; })}</tbody></table></div>;
  const resourceList = <ul className="pr-res">{RESOURCES.map(r => <li key={r.slug} data-q={`${r.title} ${r.text}`}><span className={`pr-res-ic ${r.tone}`}><FileText aria-hidden="true" /></span>
    <span><b>{r.title}</b><small>{r.text}</small></span><a href={`/partner/resources/${r.slug}`} aria-label={`Download ${r.title}`} download><Download aria-hidden="true" /></a></li>)}</ul>;

  return <PortalShell {...shell}
    links={{ messages: href("support"), notifications: href("earnings"), notificationsUnread: nextStmt ? 1 : 0, help: href("resources") }}
    create={[{ href: `${href("overview")}#share`, label: "Share my referral link" }, { href: "/partner/qr", label: "Download QR code", external: true }, { href: href("support"), label: "Support request" }]}>
    <div className="pr">
      <header className="pr-head">
        <div><h1>{greeting}, {first}</h1><p>Here’s your partner performance on Gala Dock.</p></div>
        <details className="pr-period pt-pop"><summary><CalendarDays aria-hidden="true" /><span>{PERIODS[periodKey]}</span><ChevronDown aria-hidden="true" /></summary>
          <div className="pt-pop-panel right" role="menu">{Object.entries(PERIODS).map(([k, l]) => <Link key={k} role="menuitemradio" aria-checked={k === periodKey} href={`/partner?${view === "overview" ? "" : `view=${view}&`}period=${k}`}>{l}</Link>)}</div></details>
      </header>
      {p.status !== "active" && <p className="pt-notice amber">Your partnership is {p.status}. New referrals won’t earn commission until it’s active again.</p>}
      <div className="pr-kpis">
        <Kpi icon={Users} tone="blue" label="Referred signups" value={num(signups)} delta={pctDelta(signups, signupsPrev)} series={signupSeries} spark="blue" />
        <Kpi icon={CalendarDays} tone="purple" label="Active customers" value={num(active)} delta={pctDelta(active, activeBefore)} series={activeSeries} spark="purple" />
        <Kpi icon={Database} tone="green" label="Eligible revenue" value={money(rev)} delta={pctDelta(rev, revPrev)} series={cumulative(days.map(d => d.rev))} spark="green" />
        <Kpi icon={Percent} tone="pink" label="Your commission" value={money(com)} delta={pctDelta(com, comPrev)} series={cumulative(days.map(d => d.com))} spark="pink" />
      </div>
      <div className="pr-grid">
        <div className="pr-left">
          {view === "overview" && <>
            <section className="pr-banner" style={{ backgroundImage: `url(${partnerHero})` }} aria-label="Partner programme">
              <div><small>Gala Dock Partner Program</small><h2>Earn with unforgettable events</h2>
                <p>Refer event organisers, venues and suppliers to Gala Dock and earn commission on {p.commission_basis === "subscription_revenue" ? "subscription revenue" : "net platform revenue"}.</p>
                <a className="pr-guide" href="/partner/resources/partner-guide" download>View partner guide <ArrowRight aria-hidden="true" /></a></div>
              <ul>{["Real-time tracking", "Competitive commissions", "Marketing resources", "Dedicated partner support"].map(x => <li key={x}><CircleCheck aria-hidden="true" />{x}</li>)}</ul>
            </section>
            <section className="pt-panel pr-rev" data-q-group="">
              <div className="pr-rev-chart"><div className="pt-panel-head"><h2>Revenue &amp; commission</h2></div>
                <ul className="pr-legend"><li className="b">Eligible revenue</li><li className="p">Your commission</li></ul><RevenueChart days={days} /></div>
              <div className="pr-rev-side"><Link className="pt-link" href={href("earnings")}>View details <ArrowRight aria-hidden="true" /></Link>
                <div className="pr-box"><div><span>Total eligible revenue</span><b>{money(rev)}</b><em className={pctDelta(rev, revPrev)! >= 0 ? "up" : "down"}>{pctDelta(rev, revPrev) === null ? "—" : `${pctDelta(rev, revPrev)! >= 0 ? "↑" : "↓"} ${Math.abs(pctDelta(rev, revPrev)!)}%`}</em></div>
                  <div><span>Total commission</span><b>{money(com)}</b><em className={pctDelta(com, comPrev)! >= 0 ? "up" : "down"}>{pctDelta(com, comPrev) === null ? "—" : `${pctDelta(com, comPrev)! >= 0 ? "↑" : "↓"} ${Math.abs(pctDelta(com, comPrev)!)}%`}</em></div></div>
                <div className="pr-box"><div><span>Pending commission</span><b>{money(pendingCom)}</b><em className="pend">Pending payout</em></div>
                  <div><span>Next payout date</span><b className="ic"><CalendarDays aria-hidden="true" />{nextStmt ? fmt(nextStmt.payout_due) : "—"}</b><em className="plain">{inDays === null ? "No payout scheduled" : inDays === 0 ? "Today" : `In ${inDays} day${inDays === 1 ? "" : "s"}`}</em></div></div>
              </div>
            </section>
            <div className="pr-bottom">
              <PortalPanel title="Recent referrals" action={{ href: href("referrals"), label: "View all" }} className="pr-refs">{refTable(referrals.slice(0, 5))}</PortalPanel>
              <PortalPanel title="Commission history" action={{ href: href("earnings"), label: "View all" }} className="pr-hist">{stmtTable(statements.slice(0, 5))}</PortalPanel>
            </div>
          </>}
          {view === "referrals" && <PortalPanel title={`Referrals (${referrals.length})`} className="pr-refs pr-full"><p className="pr-sub">{active} active · {referrals.filter(r => r.status === "trial").length} on trial · {referrals.filter(r => r.status === "churned").length} churned. Commission accrues on active, paying accounts only.</p>
            <div className="pt-scroll"><table className="pt-table pr-table"><thead><tr><th>Signed up</th><th>Name</th><th>Type</th><th>Status</th><th>Activated</th></tr></thead>
              <tbody>{referrals.map(r => { const [tone, label] = REF_TONE[r.status]; return <tr key={r.id} id={`r-${r.id}`} data-q={`${r.name} ${KIND[r.kind]}`}><td>{fmt(r.signed_up_at)}</td><td>{r.name}</td><td className="m">{KIND[r.kind]}</td><td><span className={`pr-st ${tone}`}>{label}</span></td><td>{r.activated_at ? fmt(r.activated_at) : "—"}</td></tr>; })}</tbody></table></div></PortalPanel>}
          {view === "earnings" && <>
            <section className="pt-panel pr-rev" data-q-group=""><div className="pr-rev-chart"><div className="pt-panel-head"><h2>Revenue &amp; commission · {PERIODS[periodKey].toLowerCase()}</h2></div>
              <ul className="pr-legend"><li className="b">Eligible revenue</li><li className="p">Your commission</li></ul><RevenueChart days={days} /></div>
              <div className="pr-rev-side"><div className="pr-box"><div><span>Commission rate</span><b>{(p.commission_bps / 100).toFixed(p.commission_bps % 100 ? 1 : 0)}%</b><em className="plain">of {p.commission_basis.replaceAll("_", " ")}</em></div>
                <div><span>Pending commission</span><b>{money(pendingCom)}</b><em className="pend">Clears after 14 days</em></div></div></div></section>
            <PortalPanel title="Monthly statements" className="pr-hist pr-full">{stmtTable(statements)}</PortalPanel></>}
          {view === "resources" && <PortalPanel title="Partner resources" className="pr-full"><p className="pr-sub">Everything you need to promote Gala Dock. Files that include links are personalised with your referral code.</p>{resourceList}
            <h3 className="pr-h3">Tracked content</h3><ul className="pr-content">{topContent.map(c => <li key={c.id} data-q={c.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" width={68} height={42} loading="lazy" /><span><b>{c.title}</b><small>{num(c.clicks)} clicks | {num(c.signups)} signups</small></span><PortalChip tone="green">{rate(c).toFixed(1)}%</PortalChip></li>)}</ul></PortalPanel>}
          {view === "support" && <section className="pt-panel pr-full"><h2 className="pr-h2">Contact partner support</h2><p className="pr-sub">Questions about referrals, attribution or payouts. We reply by email, usually within one working day.</p><SupportForm /></section>}
        </div>
        <aside className="pr-right">
          <section className="pt-panel pr-link" id="share" data-q-group="">
            <div className="pt-panel-head"><h2>Your referral link</h2><Link className="pt-link" href={href("resources")}>Customise</Link></div>
            <div className="pr-field"><span><AbsoluteUrl path={link} /></span><CopyButton value={link} label="Copy referral link" /></div>
            <div className="pr-share-row"><div><small>Share on</small><div className="pr-share">
              <SocialLink network="copy" path={link} text="Plan and book events on Gala Dock" label="Copy link"><span className="pr-net link"><BrandGlyph network="link" /></span></SocialLink>
              {(["facebook", "x", "linkedin", "whatsapp", "email"] as const).map(nw => <SocialLink key={nw} network={nw} path={link} text="Plan and book events on Gala Dock" label={`Share on ${nw === "x" ? "X" : nw[0]!.toUpperCase() + nw.slice(1)}`}><span className={`pr-net ${nw}`}><BrandGlyph network={nw} /></span></SocialLink>)}
            </div></div>
              <a className="pr-qr" href="/partner/qr?download=1" download>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/partner/qr" alt="QR code for your referral link" width={44} height={44} /><small>Download QR</small></a></div>
          </section>
          <PortalPanel title="Top performing content" action={{ href: href("resources"), label: "View all" }} className="pr-top">
            <ul className="pr-content">{topContent.slice(0, 3).map(c => <li key={c.id} data-q={c.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" width={68} height={42} loading="lazy" /><span><b>{c.title}</b><small>{num(c.clicks)} clicks | {num(c.signups)} signups</small></span><PortalChip tone="green">{rate(c).toFixed(1)}%</PortalChip></li>)}
              {!content.length && <li className="pt-empty">No tracked content yet.</li>}</ul></PortalPanel>
          <PortalPanel title="Partner resources" action={{ href: href("resources"), label: "View all" }} className="pr-resources">{resourceList}</PortalPanel>
        </aside>
      </div>
    </div>
  </PortalShell>;
}
