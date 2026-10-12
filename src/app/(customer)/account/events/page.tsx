import Link from "next/link";
import { Calendar, Users2, CreditCard, CalendarDays, MapPin, Users, Clock, FileText, Plus, ArrowRight, ChevronRight, Sparkles, Network, Database, Wallet, AlarmClock, Building2, Utensils, ListChecks } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { listMyEvents, type MyEvent, type Summary } from "@/lib/data/customer-events";
import { listWorkspaceAccess } from "@/lib/auth";
import { Beta, Empty } from "@/components/kit";
import { SaveHeart, AgentAsk } from "@/components/kit/client";
import { EventMenu, StatusPill, UpgradeButton, TaskCircle } from "@/components/customer/events-client";
import { dateLong, money, relative, eventTypeLabel } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "My Events" };
const STEPS = ["Details", "Venue", "Providers", "Payments", "Ready"];
const TYPE_BADGE: Record<string, string> = { wedding: "#c8243d", birthday: "#6d28d9", party: "#0f172a", private_dinner: "#9a5800" }; // white text ≥ 4.5:1 (WCAG AA)

export default async function MyEvents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer("/account/events");
  const tab = (["past", "drafts"].includes(sp.tab ?? "") ? sp.tab : "upcoming") as "upcoming" | "past" | "drafts";
  const all = await listMyEvents(ctx); const now = new Date().toISOString();
  const upcoming = all.filter(x => x.e.status !== "draft" && !["completed", "cancelled"].includes(x.e.status) && (!x.e.starts_at || x.e.starts_at >= now));
  const drafts = all.filter(x => x.e.status === "draft"), past = all.filter(x => ["completed", "cancelled"].includes(x.e.status) || (x.e.status !== "draft" && !!x.e.starts_at && x.e.starts_at < now));
  const list = tab === "upcoming" ? [...upcoming, ...drafts] : tab === "past" ? past : drafts;
  const ids = all.map(x => x.e.id);
  const [{ data: tasks }, access, { data: saved }] = await Promise.all([
    ids.length ? ctx.supabase.from("tasks").select("id,title,due_at,status,event_id").in("event_id", ids).neq("status", "done").order("due_at").limit(4) : Promise.resolve({ data: [] }),
    listWorkspaceAccess(ctx.supabase),
    ctx.supabase.from("saved_items").select("item_key").eq("user_id", ctx.user.id),
  ]);
  const savedSet = new Set((saved ?? []).map(s => s.item_key));
  const totalSpend = all.reduce((s, x) => s + x.s.paid, 0), providers = all.reduce((s, x) => s + x.s.confirmed, 0);
  const orgWs = access.filter(w => w.kind === "organizer" && ["owner", "manager"].includes(w.role) && w.member_status === "active").map(w => ({ id: w.id, name: w.name }));
  const complex = upcoming.find(x => x.s.providers >= 4) ?? upcoming[0];
  const evName = new Map(all.map(x => [x.e.id, x.e.name]));
  const taskIcon = (t: string) => /quote/i.test(t) ? FileText : /payment|pay/i.test(t) ? CreditCard : /menu|catering/i.test(t) ? Utensils : /timeline|venue/i.test(t) ? CalendarDays : ListChecks;
  return <div className="me">
    <section className="me-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/gd/hero-myevents.webp" alt="" className="me-hero-bg" />
      <div className="me-hero-text"><h1>My Events</h1><p>Plan, manage and bring your events to life.</p>
        <div className="me-stats"><span><Calendar size={30} strokeWidth={1.6} /><span><b>{all.filter(x => x.e.status !== "cancelled").length}</b><small>Total events</small></span></span><span><Users2 size={30} strokeWidth={1.6} /><span><b>{providers}</b><small>Confirmed providers</small></span></span><span><CreditCard size={30} strokeWidth={1.6} /><span><b>{money(totalSpend)}</b><small>Total spend</small></span></span></div></div>
      <div className="me-agent"><div className="k-row" style={{ gap: 8 }}><Sparkles size={20} className="k-blue" /><b style={{ fontSize: 14 }}>Gala Agent</b><Beta /></div><b className="me-agent-q">Need help with your event?</b><p>I can suggest next steps, find venues, or draft messages to your providers.</p><Link className="k-btn outline block" href="/plan?step=1">Get planning help <ArrowRight size={14} /></Link></div>
    </section>
    <div className="me-tabs-row">
      <div className="me-tabs" role="group" aria-label="Filter events">{([["upcoming", "Upcoming", upcoming.length, CalendarDays], ["past", "Past", past.length, Clock], ["drafts", "Drafts", drafts.length, FileText]] as const).map(([k, l, n, I]) => <Link key={k} aria-current={(tab === k) ? "page" : undefined} href={k === "upcoming" ? "/account/events" : `/account/events?tab=${k}`}><I size={17} />{l} ({n})</Link>)}</div>
      <Link className="k-btn primary lg" href="/plan?step=1"><Plus size={17} />Create Event</Link>
    </div>
    <div className="me-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        {list.length ? list.map(({ e, s }) => <EventRow key={e.id} e={e} s={s} saved={savedSet.has(`event:${e.id}`)} />) : <div className="k-card"><Empty icon={CalendarDays} title={tab === "past" ? "No past events yet" : tab === "drafts" ? "No drafts" : "No upcoming events"} text="Start planning — Gala Agent can suggest venues and services for your budget." action={<Link className="k-btn primary" href="/plan?step=1"><Plus size={15} />Plan an event</Link>} /></div>}
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <section className="me-side me-create"><span className="k-tile lg"><CalendarDays size={22} /></span><div><b>Create a new event</b><p>Start planning a new event. You can keep it private or make it public later.</p><Link className="k-btn outline sm" href="/plan?step=1">Create Event <ArrowRight size={13} /></Link></div></section>
        <section className="me-side"><div className="k-between" style={{ marginBottom: 6 }}><h2 style={{ fontSize: 14.5 }}>Upcoming tasks</h2><Link className="k-link" href={upcoming[0] ? `/account/events/${upcoming[0].e.id}/plan?tab=checklist` : "/account/events"}>View all <ArrowRight size={12} /></Link></div>
          <ul className="me-tasks">{(tasks ?? []).map(t => { const I = taskIcon(t.title); const days = t.due_at ? Math.ceil((new Date(t.due_at).getTime() - requestTime()) / 864e5) : null; return <li key={t.id}><TaskCircle id={t.id} done={false} label={t.title} /><span className="me-task-ic"><I size={15} /></span><Link href={`/account/events/${t.event_id}/plan?tab=checklist`} className="k-grow"><b>{t.title}</b><small>{evName.get(t.event_id!) ?? ""}</small></Link><span className={`me-due ${days != null && days <= 2 ? "soon" : ""}`}>{days == null ? "" : days <= 0 ? "Due today" : days < 7 ? `Due in ${days} days` : `Due in ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? "" : "s"}`}</span><ChevronRight size={14} className="k-muted" /></li>; })}{!tasks?.length && <li className="k-small k-muted">No open tasks.</li>}</ul></section>
        {complex && <section className="me-side me-upgrade"><span className="k-tile lg"><Building2 size={22} /></span><div><b>Need more control?</b><p>This event is getting complex. Switch to <b>Organizer</b> mode for advanced planning tools, team collaboration and full event management.</p><UpgradeButton eventId={complex.e.id} workspaces={orgWs} /></div></section>}
        <section className="me-side"><div className="k-row" style={{ gap: 8, marginBottom: 8 }}><Sparkles size={18} className="k-blue" /><b style={{ fontSize: 14 }}>Gala Agent</b><Beta /></div><AgentAsk scope="customer" placeholder="Ask me anything about your events..." compact /><div className="k-row k-wrap" style={{ gap: 6, marginTop: 10 }}><Link className="me-pill" href="/discover?tab=venues&results=1">Find a venue</Link><Link className="me-pill" href={upcoming[0] ? `/account/events/${upcoming[0].e.id}/build` : "/discover"}>Compare quotes</Link><Link className="me-pill" href={upcoming[0] ? `/account/events/${upcoming[0].e.id}/plan` : "/plan?step=1"}>Suggest a timeline</Link></div></section>
      </div>
    </div>
  </div>;
}

function EventRow({ e, s, saved }: { e: MyEvent; s: Summary; saved: boolean }) {
  const draft = e.status === "draft";
  const gallery = s.gallery.slice(0, 3); const more = Math.max(0, s.gallery.length - 3) + (s.gallery.length ? 9 : 0);
  return <article className={`me-card ${draft ? "draft" : ""}`}>
    <Link href={`/account/events/${e.id}`} className="me-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover_image || "/assets/gd/me-garden.webp"} alt="" /><span className="me-badge" style={{ background: draft ? "#fff" : TYPE_BADGE[e.event_type] ?? "#2563eb", color: draft ? "var(--k-ink)" : "#fff" }}>{draft ? "Draft" : eventTypeLabel(e.event_type)}</span>
      {!draft && gallery.length > 0 && <span className="me-thumbs">{gallery.map((g, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={g} alt="" />)}<span className="me-more">+{more}</span></span>}</Link>
    <SaveHeart itemKey={`event:${e.id}`} saved={saved} className="me-heart" label={e.name} size={17} />
    <div className="me-body">
      <div className="k-between" style={{ alignItems: "flex-start" }}><div><Link href={`/account/events/${e.id}`}><h3 className="me-name">{e.name}</h3></Link><div className="me-meta"><span><CalendarDays size={14} />{dateLong(e.starts_at)}</span><span><MapPin size={14} />{e.venue_name || "Not set"}</span><span><Users size={14} />{e.guest_count} guests</span></div></div><div className="k-row" style={{ gap: 10 }}><StatusPill status={e.status} /><EventMenu id={e.id} name={e.name} status={e.status} /></div></div>
      <ol className={`me-steps ${draft ? "sm" : ""}`}>{STEPS.map((l, i) => { const n = i + 1, state = s.steps[i] ? "done" : n === s.stage ? "cur" : "todo"; return <li key={l} data-state={state}><span>{state === "done" ? "✓" : n}</span><small>{l}</small></li>; })}</ol>
      {draft ? <div className="me-draft-acts"><Link className="k-btn outline lg" href={`/plan?step=1&event=${e.id}`}>Continue Planning</Link><Link className="k-icon-btn lg-sq" href={`/account/events/${e.id}`} aria-label="More">⋯</Link></div> : <>
        <div className="me-kpis">{([[Network, "Providers", `${s.confirmed} / ${s.providers} confirmed`, `/account/events/${e.id}/build`], [Database, "Package cost", money(s.pkg), `/account/events/${e.id}/money`], [Wallet, "Amount paid", money(s.paid), `/account/events/${e.id}/money?tab=payments`], [AlarmClock, "Amount due", money(s.due), `/account/events/${e.id}/money?tab=payments`]] as const).map(([I, l, v, h], i) => <Link key={l} href={h} className="me-kpi"><span className={`me-kpi-ic c${i}`}><I size={18} /></span><span className="k-grow"><small>{l}</small><b>{v}</b></span><ChevronRight size={15} className="k-muted" /></Link>)}</div>
        <div className="me-foot"><Link href={s.next.href} className="me-next"><CalendarDays size={16} /><span><b>Next action:</b> {s.next.label}</span><ChevronRight size={15} /></Link><Link className="k-btn outline lg" href={`/account/events/${e.id}`}>View Details</Link><Link className="k-btn primary lg" href={s.next.label.toLowerCase().includes("pay") ? `/account/events/${e.id}/money?tab=payments` : `/account/events/${e.id}/build`}>{s.next.label.toLowerCase().includes("pay") ? "Make a Payment" : "Continue Planning"} <ArrowRight size={15} /></Link></div></>}
    </div>
  </article>;
}
export const _r = relative;
