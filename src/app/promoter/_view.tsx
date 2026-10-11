import Link from "next/link";
import { Megaphone, Images, ChartColumnBig, Coins, CalendarDays, MapPin, Users, ChevronRight, Ticket, Target, Award, Sparkles, UsersRound, Copy, Settings,
  Download, Trophy, Play, type LucideIcon } from "lucide-react";
import "@/styles/portal-promoter.css";
import { Sparkline } from "@/components/workspace/kit";
import { PortalShell, PortalPanel, PortalChip, type ChipTone } from "@/components/portal/shell";
import { CopyButton, AbsoluteUrl, ShareButton, SocialLink } from "@/components/portal/client";
import { BrandGlyph, NETWORK_LABEL, type Network } from "@/components/portal/brand";
import { eventHero } from "@/components/portal/media";
import { dateRange, fmt, pctDelta, statusLabel } from "@/components/portal/format";
import { money, num, requestTime } from "@/lib/workspace/format";
import type { PromoterData, Sale } from "./_data";
import { PayoutMethodForm } from "./payout-form";

const VIEWS = ["campaign", "assets", "sales", "commission"] as const;
type ViewKey = typeof VIEWS[number];
const SALE_TONE: Record<Sale["status"], [ChipTone, string]> = { pending: ["amber", "Pending"], approved: ["green", "Approved"], paid: ["blue", "Paid"], reversed: ["red", "Reversed"] };
const METHOD: Record<string, string> = { bank_transfer: "Bank transfer", paypal: "PayPal", stripe: "Stripe" };
const SHARE: Network[] = ["whatsapp", "facebook", "x", "instagram", "tiktok", "email"];

function Kpi({ icon: Icon, tone, label, value, delta, suffix, series, spark }: { icon: LucideIcon; tone: string; label: string; value: string; delta: number | null; suffix?: string; series: number[]; spark: "blue" | "green" | "purple" | "pink" }) {
  return <div className="pp-kpi">
    <span className={`pt-kpi-ic ${tone}`}><Icon aria-hidden="true" /></span>
    <div className="pp-kpi-t"><span>{label}</span><strong>{value}</strong>
      {delta === null ? <small>No prior period</small> : <><b className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}{suffix ?? "%"}</b><small>vs last 30 days</small></>}</div>
    <Sparkline values={series} tone={spark} width={72} height={44} />
  </div>;
}

export function PromoterView({ data, view: rawView, basePath }: { data: PromoterData; view: string | undefined; basePath: string }) {
  const view: ViewKey = VIEWS.includes(rawView as ViewKey) ? rawView as ViewKey : "campaign";
  const href = (k: ViewKey) => (k === "campaign" ? basePath : `${basePath}?view=${k}`);
  const { me, current, campaigns } = data;
  const nav = [
    { href: href("campaign"), label: "Campaign", icon: Megaphone, active: view === "campaign" },
    { href: href("assets"), label: "Assets", icon: Images, active: view === "assets" },
    { href: href("sales"), label: "Sales", icon: ChartColumnBig, active: view === "sales" },
    { href: href("commission"), label: "Commission", icon: Coins, active: view === "commission" },
  ];
  const shellBase = { user: { name: me.name, detail: me.email, avatar: me.avatar, signOut: true }, searchPlaceholder: "Search sales, channels or assets…", nav };
  if (!current) return <PortalShell {...shellBase} portal={{ title: "Promoter Portal", subtitle: "No active campaign", thumb: "/brand/gala-dock-mark.png" }}
    context={{ label: "Promoter Portal", thumb: "/brand/gala-dock-mark.png" }} links={{ messages: "/promoter", notifications: "/promoter", help: "/help" }}>
    <div className="pp-empty pt-panel"><Megaphone aria-hidden="true" /><h1>No campaigns yet</h1><p>When an organiser adds you as a promoter for an event, your referral link, sales and commission will appear here.</p></div>
  </PortalShell>;

  const { promoter: p, event: e, sales, payouts, assets, clicks, tiers, board } = current;
  const now = requestTime(), DAY = 864e5;
  const live = sales.filter(s => s.status !== "reversed");
  const inWin = (t: number, a: number, b: number) => t >= now - a * DAY && t < now - b * DAY;
  const s30 = live.filter(s => inWin(Date.parse(s.sold_at), 30, 0)), s60 = live.filter(s => inWin(Date.parse(s.sold_at), 60, 30));
  const dayKey = (t: number) => fmt(t, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-");
  const days = Array.from({ length: 30 }, (_, i) => dayKey(now - (29 - i) * DAY));
  const prevDays = new Set(Array.from({ length: 30 }, (_, i) => dayKey(now - (59 - i) * DAY)));
  const curDays = new Set(days);
  const c30 = clicks.filter(c => curDays.has(c.day)), c60 = clicks.filter(c => prevDays.has(c.day));
  const sum = <T,>(l: T[], f: (x: T) => number) => l.reduce((a, x) => a + f(x), 0);
  const tickets = sum(s30, s => s.quantity), ticketsPrev = sum(s60, s => s.quantity);
  const comm = sum(s30, s => Number(s.commission)), commPrev = sum(s60, s => Number(s.commission));
  const clk = sum(c30, c => c.clicks), clkPrev = sum(c60, c => c.clicks);
  const conv = clk ? (100 * tickets) / clk : 0, convPrev = clkPrev ? (100 * ticketsPrev) / clkPrev : 0;
  const perDay = (f: (d: string) => number) => days.map(f);
  const salesOn = (d: string) => s30.filter(s => dayKey(Date.parse(s.sold_at)) === d);
  const clicksOn = (d: string) => sum(c30.filter(c => c.day === d), c => c.clicks);
  // Cumulative series read as momentum; daily values are too spiky at this scale.
  const cumulative = (xs: number[]) => xs.reduce<number[]>((a, x) => [...a, (a.at(-1) ?? 0) + x], []);
  // Running conversion (cumulative tickets / cumulative clicks) — a smooth trend rather than noisy daily ratios.
  const cumT = cumulative(perDay(d => sum(salesOn(d), s => s.quantity))), cumC = cumulative(perDay(clicksOn));
  const convSeries = cumT.map((t, i) => (cumC[i] ? t / cumC[i]! : 0));
  const pending = sum(live.filter(s => s.status === "pending"), s => Number(s.commission)), approved = sum(live.filter(s => s.status === "approved"), s => Number(s.commission));
  const earned = sum(live, s => Number(s.commission));
  const nextPayout = [...payouts].filter(x => x.status !== "paid" && x.status !== "failed").sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
  const channels = (["instagram", "tiktok", "facebook", "x", "email", "whatsapp", "direct", "other"] as Network[]).map(ch => {
    const cl = sum(c30.filter(c => c.channel === ch), c => c.clicks), sl = sum(s30.filter(s => s.channel === ch), s => s.quantity);
    return { ch, cl, sl, rate: cl ? (100 * sl) / cl : 0 };
  }).filter(c => c.cl || c.sl).sort((a, b) => b.cl - a.cl);
  const assetStats = assets.map(a => ({ ...a, cl: sum(c30.filter(c => c.asset_id === a.id), c => c.clicks), sl: sum(s30.filter(s => s.asset_id === a.id), s => s.quantity) })).sort((a, b) => b.cl - a.cl);
  const thumb = e.cover_image || "/assets/gd/oe-neon.webp";
  const hero = eventHero(e.slug, "promoter", e.settings?.hero_image || thumb);
  const link = `/r/${p.code}`;
  const shareText = `${e.name} — get your tickets`;
  const releases = [...new Map(tiers.filter(t => t.sale_start && t.status !== "hidden").map(t => [t.release_name || t.name, t.sale_start!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const dates = [...releases.map(([r, at], i) => ({ at, label: i === 0 ? `${r === "Phase 1" ? "Early bird" : r} sales live` : `${r === "Phase 2" ? "General release" : r}` })),
    ...(e.starts_at ? [{ at: e.starts_at, label: "Event day" }] : [])].slice(0, 4);
  const nextIdx = dates.findIndex(d => Date.parse(d.at) > now);
  const recent = sales.slice(0, 5);
  const salesTable = (list: Sale[]) => <div className="pt-scroll"><table className="pt-table pp-sales"><thead><tr><th>Date</th><th>Ticket type</th><th>Qty</th><th>Amount</th><th>Commission</th><th>Status</th></tr></thead>
    <tbody>{list.map(s => { const [tone, label] = SALE_TONE[s.status]; return <tr key={s.id} data-q={`${s.tier_name} ${NETWORK_LABEL[s.channel] ?? s.channel}`}><td>{fmt(s.sold_at)}</td><td>{s.tier_name}</td><td>{s.quantity}</td>
      <td>{money(s.amount, "GBP", { cents: true })}</td><td>{money(s.commission, "GBP", { cents: true })}</td><td><PortalChip tone={tone} dot>{label}</PortalChip></td></tr>; })}</tbody></table>
    {!list.length && <p className="pt-empty">No sales through your link yet — share it to get started.</p>}</div>;
  const channelList = <ul className="pp-channels">{channels.map(c => <li key={c.ch} data-q={NETWORK_LABEL[c.ch]}><span className={`pp-net ${c.ch}`}><BrandGlyph network={c.ch} /></span><b>{NETWORK_LABEL[c.ch]}</b>
    <span>{num(c.cl)} clicks</span><span>{num(c.sl)} sales</span><em>{c.rate.toFixed(1)}%</em></li>)}{!channels.length && <li className="pt-empty">No clicks yet.</li>}</ul>;
  const assetList = (n: number) => <ul className="pp-assets">{assetStats.slice(0, n).map(a => <li key={a.id} data-q={a.title}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={a.image} alt="" width={55} height={42} loading="lazy" /><span><b>{a.title}</b><small>{num(a.cl)} clicks | {num(a.sl)} sales</small></span></li>)}
    {!assetStats.length && <li className="pt-empty">The organiser hasn’t shared assets yet.</li>}</ul>;
  const commissionCard = <PortalPanel title="Commission summary" action={view === "commission" ? undefined : { href: href("commission"), label: "View details" }} className="pp-comm">
    <ul className="pp-comm-l"><li><i className="b" />Eligible commission<b>{money(pending + approved, "GBP", { cents: true })}</b></li><li><i className="o" />Pending (to be confirmed)<b>{money(pending, "GBP", { cents: true })}</b></li>
      <li><i className="g" />Approved (payable)<b>{money(approved, "GBP", { cents: true })}</b></li><li className="tot">Total earned<b>{money(earned, "GBP", { cents: true })}</b></li></ul>
    {p.payout_method ? <p className="pp-method">Payout method: <b>{METHOD[p.payout_method] ?? p.payout_method}</b></p>
      : <Link href={`${href("commission")}#payout`} className="pt-btn primary pp-setup">Set up payout method <ChevronRight aria-hidden="true" /></Link>}
    <div className="pp-payout"><div className="pp-payout-h"><h3>Payout status</h3>{nextPayout ? <PortalChip tone={nextPayout.status === "scheduled" ? "blue" : "amber"}>✦ {nextPayout.status === "scheduled" ? "Scheduled" : nextPayout.status === "processing" ? "Processing" : "Pending"}</PortalChip> : <PortalChip tone="grey">None due</PortalChip>}</div>
      <ul><li><i />Next payout date<span>{nextPayout ? fmt(nextPayout.scheduled_for) : "—"}</span></li><li><i />Payout method<span>{p.payout_method ? METHOD[p.payout_method] : "Not set up"}</span></li></ul>
      <Link href={`${href("commission")}#payout`} className="pp-manage"><Settings aria-hidden="true" />Manage payout settings</Link></div>
  </PortalPanel>;

  return <PortalShell {...shellBase}
    portal={{ title: "Promoter Portal", subtitle: e.name, thumb }}
    context={{ label: e.name, thumb, menu: campaigns.map(c => ({ href: `/promoter/${c.promoter.id}`, label: c.event?.name ?? c.promoter.code, active: c.promoter.id === p.id })) }}
    links={{ messages: href("sales"), notifications: href("commission"), notificationsUnread: nextPayout && !p.payout_method ? 1 : 0, help: "/help" }}
    create={[{ href: `${href("campaign")}#share`, label: "Share my link" }, { href: href("assets"), label: "Campaign post from an asset" }]}>
    <div className="pp">
      <header className="pt-head">
        <div className="pt-head-main">
          <h1>{e.name}{p.status === "active" ? <PortalChip tone="green" dot>Active Campaign</PortalChip> : <PortalChip tone="amber" dot>{p.status === "pending" ? "Awaiting approval" : "Paused"}</PortalChip>}</h1>
          <div className="pt-meta">
            <span><CalendarDays aria-hidden="true" />{dateRange(e.starts_at, e.ends_at)}</span>
            <span><MapPin aria-hidden="true" />{[e.venue_name, e.city].filter(Boolean).join(", ") || e.location}</span>
            <span><Users aria-hidden="true" />{statusLabel(e.status)}</span>
            {!!e.tags.length && <span className="pt-tags">{e.tags.slice(0, 3).map(t => <i key={t}>{t}</i>)}</span>}
          </div>
        </div>
        <div className="pt-head-actions">
          {e.slug && e.visibility === "public" && <Link href={`/events/${e.slug}`} className="pt-btn outline">View event page <ChevronRight aria-hidden="true" /></Link>}
          <ShareButton path={link} title={e.name} text={shareText} label="Share campaign" primary />
        </div>
      </header>

      <div className="pp-grid">
        <div className="pp-left">
          {view === "campaign" && <>
            <section className={hero.className} style={{ backgroundImage: `url(${hero.src})` }} aria-label="Campaign">
              <small>Promoter portal</small><h2>{e.name}</h2><p>Share. Sell. Earn. Help us bring an unforgettable event to life.</p>
              {e.settings?.video_url && <a className="pt-hero-btn" href={e.settings.video_url} target="_blank" rel="noopener noreferrer"><Play aria-hidden="true" />Watch event video</a>}
            </section>
            <div className="pp-kpis">
              <Kpi icon={Ticket} tone="purple" label="My ticket sales" value={num(tickets)} delta={pctDelta(tickets, ticketsPrev)} series={cumulative(perDay(d => sum(salesOn(d), s => s.quantity)))} spark="purple" />
              <Kpi icon={Coins} tone="green" label="My commission" value={money(comm, "GBP", { cents: true })} delta={pctDelta(comm, commPrev)} series={cumulative(perDay(d => sum(salesOn(d), s => Number(s.commission))))} spark="green" />
              <Kpi icon={Users} tone="blue" label="Link clicks" value={num(clk)} delta={pctDelta(clk, clkPrev)} series={cumulative(perDay(clicksOn))} spark="blue" />
              <Kpi icon={Target} tone="purple" label="Conversion rate" value={`${conv.toFixed(1)}%`} delta={clkPrev ? +(conv - convPrev).toFixed(1) : null} suffix=" pts" series={convSeries} spark="pink" />
            </div>
            <section className="pt-panel pp-overview" data-q-group="">
              <div className="pp-ov-main">
                <h2>Campaign overview</h2>
                <div className="pp-ov-body">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={hero.src} alt="" width={104} height={94} />
                  <div className="pp-ov-facts"><b>{e.name}</b><span><CalendarDays aria-hidden="true" />{dateRange(e.starts_at, e.ends_at)}</span><span><MapPin aria-hidden="true" />{[e.venue_name, e.city].filter(Boolean).join(", ")}</span>
                    <span><UsersRound aria-hidden="true" />{e.tags.slice(0, 3).join(" • ")}</span></div>
                  <div className="pp-ov-desc"><p>{e.description}</p>{e.slug && e.visibility === "public" && <Link href={`/events/${e.slug}`} className="pt-btn outline">View event page <ChevronRight aria-hidden="true" /></Link>}</div>
                </div>
                <h2 className="pp-goals-h">Campaign goals</h2>
                <ul className="pp-goals">
                  <li><span className="amber"><Award aria-hidden="true" /></span><span><b>Sell more tickets</b><small>Help us reach a full crowd</small></span></li>
                  <li><span className="purple"><Sparkles aria-hidden="true" /></span><span><b>Increase brand awareness</b><small>Reach new audiences</small></span></li>
                  <li><span className="blue"><UsersRound aria-hidden="true" /></span><span><b>Grow the community</b><small>Build excitement online</small></span></li>
                </ul>
              </div>
              <div className="pp-dates"><div className="pt-panel-head"><h2>Important dates</h2><Link className="pt-link" href={`/events/${e.slug ?? ""}`}>View timeline <ChevronRight aria-hidden="true" /></Link></div>
                <ol>{dates.map((d, i) => <li key={d.label} className={i < nextIdx || nextIdx === -1 ? "past" : i === nextIdx ? "next" : "later"}><CalendarDays aria-hidden="true" /><b>{fmt(d.at, { month: "short", day: "numeric" })}</b><i /><span>{d.label}</span></li>)}</ol></div>
            </section>
            <div className="pp-bottom">
              <PortalPanel title="Recent sales" action={{ href: href("sales"), label: "View all" }} className="pp-recent">{salesTable(recent)}</PortalPanel>
              <PortalPanel title="Top performing channels" action={{ href: href("sales"), label: "View all" }} className="pp-ch">{channelList}</PortalPanel>
            </div>
          </>}
          {view === "assets" && <PortalPanel title={`Campaign assets (${assets.length})`} className="pp-asset-grid">
            <p className="pp-sub">Shared by the organiser for {e.name}. Each asset has its own tracked link so you can see what works.</p>
            <ul>{assetStats.map(a => <li key={a.id} data-q={`${a.title} ${a.caption}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt="" loading="lazy" />
              <div><b>{a.title}</b><small>{num(a.cl)} clicks · {num(a.sl)} sales (30 days)</small>{a.caption && <p>{a.caption}</p>}
                <div className="pp-asset-act"><a className="pt-btn outline" href={a.url} download><Download aria-hidden="true" />Download</a>
                  <CopyButton value={`${link}?a=${a.id}`} label={`Copy tracked link for ${a.title}`} className="pt-btn outline"><Copy aria-hidden="true" />Copy link</CopyButton>
                  {a.caption && <CopyButton value={a.caption} label="Copy caption" className="pt-btn outline">Copy caption</CopyButton>}</div></div></li>)}</ul>
            {!assets.length && <p className="pt-empty">The organiser hasn’t shared assets yet.</p>}
          </PortalPanel>}
          {view === "sales" && <>
            <PortalPanel title={`All sales (${sales.length})`} className="pp-recent">{salesTable(sales)}</PortalPanel>
            <div className="pp-bottom"><PortalPanel title="Channels (last 30 days)" className="pp-ch">{channelList}</PortalPanel>
              <PortalPanel title="Leaderboard" className="pp-board"><ol>{board.map(b => <li key={`${b.rank}-${b.name}`} className={b.is_you ? "you" : ""}><span className="rk">{b.rank <= 3 ? <Trophy aria-hidden="true" /> : null}{b.rank}</span>
                <b>{b.name}{b.is_you ? " (you)" : ""}</b><span>{num(b.tickets_sold)} tickets</span></li>)}</ol></PortalPanel></div>
          </>}
          {view === "commission" && <>
            <PortalPanel title="Payouts" className="pp-recent"><div className="pt-scroll"><table className="pt-table"><thead><tr><th>Scheduled</th><th>Amount</th><th>Status</th><th>Paid</th><th>Reference</th></tr></thead>
              <tbody>{payouts.map(x => <tr key={x.id}><td>{fmt(x.scheduled_for)}</td><td>{money(x.amount, "GBP", { cents: true })}</td>
                <td><PortalChip tone={x.status === "paid" ? "green" : x.status === "failed" ? "red" : "amber"} dot>{x.status === "on_hold" ? "On hold — payout method needed" : x.status[0]!.toUpperCase() + x.status.slice(1)}</PortalChip></td>
                <td>{x.paid_at ? fmt(x.paid_at) : "—"}</td><td>{x.reference ?? "—"}</td></tr>)}</tbody></table>{!payouts.length && <p className="pt-empty">No payouts yet.</p>}</div></PortalPanel>
            <section className="pt-panel pp-method-form" id="payout"><h2>Payout method</h2>
              <p className="pp-sub">Commission is {Number(p.commission_pct)}% of ticket revenue through your link. Sales become payable after the refund window; the organiser’s payment provider collects your bank details securely — Gala Dock never asks for them here.</p>
              <PayoutMethodForm promoterId={p.id} current={p.payout_method} /></section>
          </>}
        </div>

        <aside className="pp-right">
          <section className="pt-panel pp-ref" id="share" data-q-group="">
            <div className="pt-panel-head"><h2>Your referral link</h2><Link href={`${href("assets")}`} className="pt-link pp-cust">Customise</Link></div>
            <div className="pp-field"><span><AbsoluteUrl path={link} /></span><CopyButton value={link} label="Copy referral link" /></div>
            <h2 className="pp-code-h">Referral code</h2>
            <div className="pp-field"><span className="code">{p.code}</span><CopyButton value={p.code} label="Copy referral code" /></div>
            <div className="pp-share">{SHARE.map(n => <SocialLink key={n} network={n === "instagram" || n === "tiktok" ? "copy" : n === "x" ? "x" : n as "whatsapp" | "facebook" | "email"} path={`${link}?c=${n}`} text={shareText} label={`Share on ${NETWORK_LABEL[n]}`}>
              <span className={`pp-net ${n}`}><BrandGlyph network={n} /></span></SocialLink>)}<ShareButton path={link} title={e.name} text={shareText} /></div>
          </section>
          {commissionCard}
          <PortalPanel title="Top performing assets" action={{ href: href("assets"), label: "View all" }} className="pp-top-assets">{assetList(4)}</PortalPanel>
        </aside>
      </div>
    </div>
  </PortalShell>;
}
