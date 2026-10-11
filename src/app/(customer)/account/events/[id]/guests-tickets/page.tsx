import Link from "next/link";
import { Users, Ticket, ClipboardCheck, CheckCircle2, Clock, XCircle, MailCheck, Search, SlidersHorizontal, Mail, Phone, ArrowRight, Tag, TrendingUp, MoreHorizontal, BadgeCheck, UserRoundCheck, CircleUser, ChevronDown } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { CuEventHeader } from "@/components/customer/event-header";
import { GuestToolbar, GuestRowMenu, NewTierButton, CheckInButtons } from "@/components/customer/guests-client";
import { Avatar } from "@/components/kit";
import { money, dayMonth } from "@/lib/format";

export const metadata = { title: "Guests & Tickets" };
const ST: Record<string, [string, string]> = { confirmed: ["Confirmed", "green"], pending: ["Pending", "amber"], declined: ["Declined", "red"], invited: ["Invited", "blue"], draft: ["Not invited", "gray"] };
const TIER_IMG = ["/assets/gd/ev-neon-c.webp", "/assets/gd/v-harper.webp", "/assets/gd/v-riverside-events-centre.webp", "/assets/gd/me-wedding.webp"];

export default async function GuestsTickets({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const tab = (["tickets", "checkin"].includes(sp.tab ?? "") ? sp.tab : "guests") as "guests" | "tickets" | "checkin";
  const f = sp.f ?? "all"; const q = (sp.q ?? "").toLowerCase();
  const [{ data: guests }, { data: tiers }, { count: checked }] = await Promise.all([
    ctx.supabase.from("guests").select("id,name,email,phone,status,plus_one,tickets,dietary,invited_at,checked_in_at").eq("event_id", e.id).order("invited_at", { ascending: true, nullsFirst: false }),
    ctx.supabase.from("ticket_tiers").select("id,name,price,quantity,sold,status,sale_end,kind").eq("event_id", e.id).order("sort"),
    ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "used"),
  ]);
  const G = guests ?? []; const total = G.length;
  const c = (s: string) => G.filter(g => g.status === s).length;
  const rows = G.filter(g => (f === "all" || g.status === f) && (!q || `${g.name} ${g.email}`.toLowerCase().includes(q)));
  const T = tiers ?? []; const cap = T.reduce((s, t) => s + t.quantity, 0), sold = T.reduce((s, t) => s + t.sold, 0), rev = T.reduce((s, t) => s + t.sold * Number(t.price), 0);
  const pct = (n: number) => (total ? Math.round((100 * n) / total) : 0);
  const avatars = ["/assets/gd/av-sophie-malik.webp", "/assets/gd/av-james-carter.webp", "/assets/gd/av-mia-chen.webp", "/assets/gd/av-daniel-kim.webp", "/assets/gd/av-ava-thompson.webp", "/assets/gd/av-liam-patel.webp", "/assets/gd/av-isabella-garcia.webp", "/assets/gd/av-noah-evans.webp"];
  const base = `/account/events/${e.id}/guests-tickets`;
  const qs = (p: Record<string, string | null>) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]); for (const [k, v] of Object.entries(p)) v == null ? u.delete(k) : u.set(k, v); return `${base}?${u}`; };
  const sale = (t: typeof T[number]) => t.status === "sold_out" ? ["Sold out", "red"] : t.sale_end && t.sale_end > new Date().toISOString() && new Date(t.sale_end).getTime() - Date.now() < 30 * 864e5 ? [`Ends ${dayMonth(t.sale_end)}`, "amber"] : t.status === "draft" ? ["Draft", "gray"] : ["On sale", "green"];
  return <div className="ce">
    <CuEventHeader d={d} tab="guests" variant="compact" buildPath />
    <div className="gt-top"><div className="gt-tabs" role="tablist">{([["guests", "Guests", Users], ["tickets", "Tickets", Ticket], ["checkin", "Check-in", ClipboardCheck]] as const).map(([k, l, I]) => <Link key={k} role="tab" aria-selected={tab === k} href={k === "guests" ? base : `${base}?tab=${k}`}><I size={17} />{l}</Link>)}</div>
      <GuestToolbar eventId={e.id} rows={G.map(g => ({ name: g.name, email: g.email, phone: g.phone, status: g.status, plus_one: g.plus_one ? "yes" : "no", tickets: String(g.tickets), dietary: g.dietary }))} /></div>
    <div className="gt-grid">
      <div className="k-col" style={{ gap: 12, minWidth: 0 }}>
        <div className="gt-kpis">
          <div className="gt-kpi"><span className="gt-ic blue"><Users size={22} /></span><span><b>{total}</b><small>Total guests</small></span></div>
          {([["Confirmed", c("confirmed"), "green", CheckCircle2, "#10b981"], ["Pending", c("pending"), "amber", Clock, "#f59e0b"], ["Declined", c("declined"), "red", XCircle, "#ef4444"], ["Invited", c("invited"), "blue", MailCheck, "#2563eb"]] as const).map(([l, n, t, I, col]) => <div key={l} className="gt-kpi"><span className={`gt-ic ${t}`}><I size={22} /></span><span className="k-grow"><b>{n}</b><small>{l}</small><span className="gt-mini"><i style={{ width: `${pct(n)}%`, background: col }} /></span></span><small className="gt-pct">{pct(n)}%</small></div>)}
        </div>
        {tab === "guests" && <section className="ce-card gt-list"><h2 className="ce-h2" style={{ fontSize: 19 }}>Guest list</h2><p className="ce-sub">Invite guests, track RSVPs and manage dietary/accessibility requirements.</p>
          <form className="gt-search" action={base}><Search size={16} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search guests by name or email..." aria-label="Search guests" />{f !== "all" && <input type="hidden" name="f" value={f} />}</form>
          <div className="k-between"><div className="gt-filters">{([["all", `All (${total})`, Users, ""], ["confirmed", `Confirmed (${c("confirmed")})`, CheckCircle2, "#10b981"], ["pending", `Pending (${c("pending")})`, Clock, "#f59e0b"], ["declined", `Declined (${c("declined")})`, XCircle, "#ef4444"], ["invited", `Invited (${c("invited")})`, MailCheck, "#2563eb"]] as const).map(([k, l, I, col]) => <Link key={k} href={qs({ f: k === "all" ? null : k })} aria-pressed={f === k}><span style={{ color: f === k ? "#fff" : col }}><I size={14} /></span>{l}</Link>)}</div><span className="k-btn ghost"><SlidersHorizontal size={14} />More filters</span></div>
          <div className="k-table-wrap"><table className="k-table gt-table"><thead><tr><th style={{ width: 30 }}><input type="checkbox" aria-label="Select all" /></th><th>Name <ChevronDown size={11} /></th><th>Status</th><th>Plus one</th><th>Tickets</th><th>Dietary / Access</th><th>Contact</th><th>Invited <ChevronDown size={11} /></th><th /></tr></thead>
            <tbody>{rows.map((g, i) => { const [sl, st] = ST[g.status] ?? [g.status, "gray"]; return <tr key={g.id}><td><input type="checkbox" aria-label={`Select ${g.name}`} /></td><td><span className="k-row" style={{ gap: 10 }}><Avatar src={avatars[i % avatars.length]} name={g.name} /><span><b className="gt-name">{g.name}</b><small className="gt-email">{g.email}</small></span></span></td><td><span className={`gt-st ${st}`}><i />{sl}</span></td><td>{g.plus_one ? "Yes" : "No"}</td><td>{g.tickets}</td><td>{g.dietary ? <span className="gt-tag">{g.dietary}</span> : <span className="k-muted">No preferences</span>}</td><td><span className="k-row" style={{ gap: 6 }}>{g.email && <a className="gt-ct" href={`mailto:${g.email}`} aria-label={`Email ${g.name}`}><Mail size={14} /></a>}{g.phone && <a className="gt-ct" href={`tel:${g.phone}`} aria-label={`Call ${g.name}`}><Phone size={14} /></a>}{!g.phone && g.plus_one && <span className="gt-ct"><Phone size={14} /></span>}</span></td><td className="k-muted">{g.invited_at ? dayMonth(g.invited_at) : "—"}</td><td><GuestRowMenu eventId={e.id} id={g.id} name={g.name} /></td></tr>; })}</tbody></table></div>
          {!rows.length && <p className="k-small" style={{ padding: 12 }}>No guests match.</p>}</section>}
        {tab === "tickets" && <section className="ce-card"><div className="k-between"><h2 className="ce-h2" style={{ fontSize: 19 }}>Tickets</h2><Link className="k-btn primary" href={`/account/events/${e.id}/tickets/setup?step=1`}>Ticket setup</Link></div><p className="ce-sub">Free or paid tiers with simple release times, order limits and transfers. Inventory is reserved atomically — no overselling.</p>
          <table className="k-table" style={{ marginTop: 12 }}><thead><tr><th>Tier</th><th className="num">Price</th><th className="num">Sold</th><th className="num">Capacity</th><th>Status</th></tr></thead><tbody>{T.map(t => <tr key={t.id}><td style={{ color: "var(--k-ink)" }}>{t.name}</td><td className="num">{Number(t.price) ? money(t.price) : "Free"}</td><td className="num">{t.sold}</td><td className="num">{t.quantity}</td><td><span className={`gt-st ${sale(t)[1]}`}><i />{sale(t)[0]}</span></td></tr>)}</tbody></table></section>}
        {tab === "checkin" && <section className="ce-card"><h2 className="ce-h2" style={{ fontSize: 19 }}>Check-in</h2><p className="ce-sub">Scan QR tickets or look up guests. Duplicate and transferred tickets are rejected.</p><div style={{ marginTop: 12 }}><CheckInButtons eventId={e.id} /></div></section>}
      </div>
      <div className="k-col" style={{ gap: 12 }}>
        <section className="ce-card gt-side"><div className="k-between"><h2 className="ce-h2 sm" style={{ margin: 0, fontSize: 18 }}>Ticket sales</h2><Link className="k-link" href={`${base}?tab=tickets`}>View public event page <ArrowRight size={12} /></Link></div>
          <div className="gt-tk-kpis"><div><span className="gt-ic teal sm"><Tag size={16} /></span><span><b>{cap}</b><small>Total capacity</small></span></div><div><span className="gt-ic teal sm"><TrendingUp size={16} /></span><span className="k-grow"><b>{sold}</b><small>Tickets sold</small><span className="gt-mini"><i style={{ width: `${cap ? (100 * sold) / cap : 0}%`, background: "#10b981" }} /></span></span><small className="gt-pct">{cap ? Math.round((100 * sold) / cap) : 0}%</small></div><div><span><b>{money(rev)}</b><small>Total revenue</small></span><span className="gt-dots"><MoreHorizontal size={16} /></span></div></div>
          <div className="k-col" style={{ gap: 8, marginTop: 10 }}>{T.map((t, i) => { const [sl, st] = sale(t); return <div key={t.id} className="gt-tier">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={TIER_IMG[i % TIER_IMG.length]} alt="" /><span className="gt-tier-n"><b>{t.name}</b><strong>{Number(t.price) ? money(t.price) : "Free"}</strong></span><span className="gt-tier-s"><small><b>{t.sold}</b> / {t.quantity} {t.kind === "comp" ? "claimed" : "sold"}</small><span className="gt-mini"><i style={{ width: `${(100 * t.sold) / t.quantity}%`, background: t.kind === "comp" ? "#7c3aed" : i === 0 ? "#14b8a6" : "#2563eb" }} /></span></span><span className={`gt-sale ${st}`}>{sl}</span><span className="gt-dots"><MoreHorizontal size={15} /></span></div>; })}</div>
          <NewTierButton eventId={e.id} /></section>
        <section className="ce-card gt-side"><div className="k-between"><h2 className="ce-h2 sm" style={{ margin: 0, fontSize: 18 }}>Check-in</h2><Link className="k-link" href={`${base}?tab=checkin`}>View all check-ins <ArrowRight size={12} /></Link></div>
          <div className="gt-tk-kpis"><div><span className="gt-ic green sm"><BadgeCheck size={16} /></span><span><b>{checked ?? 0}</b><small>Checked in</small></span></div><div><span className="gt-ic purple sm"><UserRoundCheck size={16} /></span><span><b>{G.filter(g => g.checked_in_at).length}</b><small>On site now</small></span></div><div><span className="gt-ic amber sm"><CircleUser size={16} /></span><span><b>{Math.max(0, sold - (checked ?? 0))}</b><small>Not arrived</small></span><span className="gt-dots"><MoreHorizontal size={16} /></span></div></div>
          <CheckInButtons eventId={e.id} /></section>
      </div>
    </div>
  </div>;
}
