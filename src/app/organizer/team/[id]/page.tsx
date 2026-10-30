import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Phone, Mail, Briefcase, Users, Crown, Banknote, Languages, CalendarCheck, CalendarDays, Clock, ArrowRight, CheckCircle2, FileText, Upload, Activity } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { Crumbs, LinkTabs } from "@/components/kit";
import { ProfileHeaderActions, QuickActionsCard, NoteForm, ProfileShiftMenu } from "@/components/organizer/team-profile-client";
import { FormDialog } from "@/components/organizer/event/sections/ops-forms-client";
import { inviteLoginForm } from "@/lib/actions/team";
import { KeyRound } from "lucide-react";

export const metadata = { title: "Team member" };
const TZ = "Europe/London";
const SH: Record<string, [string, string]> = { confirmed: ["Confirmed", "green"], pending: ["Pending", "amber"], draft: ["Draft", "gray"], unavailable: ["Unavailable", "gray"], travel: ["Travel", "gray"] };

export default async function TeamProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(); const sb = ctx.supabase;
  const { data: p } = await sb.from("crew_members").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!p) notFound();
  const tab = ["availability", "assignments", "activity"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const now = new Date(); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? new Date(`${sp.week}T12:00:00Z`) : now;
  const mon = new Date(anchor); mon.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7)); mon.setUTCHours(0, 0, 0, 0); const sun = new Date(mon.getTime() + 7 * 864e5);
  const [{ data: shifts }, { data: blocks }, { data: events }, { data: activity }] = await Promise.all([
    sb.from("shifts").select("id,event_id,title,role,starts_at,ends_at,location,status,events(cover_image,venue_name,city)").eq("crew_id", id).order("starts_at"),
    sb.from("availability_blocks").select("id,kind,starts_at,ends_at,note").eq("crew_id", id).gte("ends_at", mon.toISOString()).lt("starts_at", sun.toISOString()),
    sb.from("events").select("id,name,starts_at,ends_at").eq("workspace_id", ctx.workspace.id).gte("starts_at", now.toISOString()).order("starts_at").limit(30),
    sb.from("audit_events").select("event,metadata,created_at").eq("workspace_id", ctx.workspace.id).contains("metadata", { crew_id: id }).order("created_at", { ascending: false }).limit(8),
  ]);
  const S = (shifts ?? []) as unknown as { id: string; event_id: string | null; title: string; role: string; starts_at: string; ends_at: string; location: string; status: string; events: { cover_image: string; venue_name: string; city: string } | null }[];
  const up = S.filter(s => s.starts_at >= now.toISOString() && s.status !== "unavailable");
  const month = S.filter(s => s.starts_at >= monthStart && s.starts_at < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString());
  const hours = Math.round(month.reduce((a, s) => a + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 36e5, 0));
  const nextEv = up.find(s => s.status === "confirmed") ?? up[0];
  const conflict = up.some((s, i) => i > 0 && s.starts_at < up[i - 1]!.ends_at);
  // Q17: notes live in crew_notes (any member may add); legacy details.notes are still shown.
  // Q17 crew ↔ login: linked when crew_members.user_id is set; owners can also see a pending invitation (RLS: owner-only read).
  const isOwner = String(ctx.role) === "owner";
  const { data: inv } = isOwner ? await sb.from("workspace_invites").select("id,created_at,expires_at,role").eq("workspace_id", ctx.workspace.id).eq("crew_id", id).is("accepted_at", null).is("revoked_at", null).is("declined_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
  const linked = !!p.user_id;
  const inviteReason = linked ? "This person already has a login." : !isOwner ? "Only the workspace owner can invite logins." : !p.email ? "Add an email address to this person first (Edit profile)." : inv ? "An invitation is already pending." : null;
  const { data: crewNotes } = await untyped(sb).from("crew_notes").select("author_name,body,created_at").eq("crew_id", id).order("created_at", { ascending: false }).limit(20);
  const d = (p.details ?? {}) as Record<string, unknown>; const notes = [...((crewNotes ?? []) as { author_name: string; body: string; created_at: string }[]).map(n => ({ by: n.author_name || "Team", at: n.created_at, body: n.body })), ...((d.notes as { by: string; at: string; body: string }[] | undefined) ?? [])];
  const files = (d.files as { name: string; size: string; at: string }[] | undefined) ?? [];
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * 864e5));
  const inDay = (day: Date) => [...S.filter(s => s.starts_at < new Date(day.getTime() + 864e5).toISOString() && s.ends_at > day.toISOString()).map(s => ({ k: s.id, label: s.title, sub: `${fmtT(s.starts_at)} – ${fmtT(s.ends_at)}`, tone: s.status === "confirmed" ? "on" : "as" })), ...(blocks ?? []).filter(b => b.starts_at < new Date(day.getTime() + 864e5).toISOString() && b.ends_at > day.toISOString()).map(b => ({ k: b.id, label: b.kind === "travel" ? "Travel" : "Unavailable", sub: b.note, tone: "un" }))];
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  const base = `/organizer/team/${id}`;
  const facts = [[Users, p.member_type === "member" ? "Member" : "External crew", p.member_type === "member" ? "Workspace member with event management permissions" : "Scheduled crew without workspace access"], ...(d.lead ? [[Crown, "Team lead", String(d.lead)]] : []), [MapPin, p.location || "Location not set", String(d.travel ?? "Travel preferences not set")], [Banknote, p.day_rate != null ? `£${Number(p.day_rate).toLocaleString("en-GB")} / day` : "Rate not set", "Default day rate (external events)"], [Languages, String(d.languages ?? "English"), String(d.languages_note ?? "")]] as [typeof Users, string, string][];

  return <div className="tp">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Team", href: "/organizer/team" }, { label: p.name }]} />
    <header className="tp-head">{p.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatar} alt="" /> : <span className="tp-av">{p.name.slice(0, 1)}</span>}
      <div className="k-grow"><div className="k-row" style={{ gap: 12 }}><h1>{p.name}</h1><span className={`tm-st ${p.status === "unavailable" ? "red" : p.status === "deactivated" ? "gray" : "green"}`}>{p.status === "available" ? "Active" : p.status.replace("_", " ")}</span></div><p className="tp-role">{p.role}</p>
        <div className="tp-meta">{p.location && <span><MapPin size={14} />{p.location}</span>}{p.phone && <a href={`tel:${p.phone}`}><Phone size={14} />{p.phone}</a>}{p.email && <a href={`mailto:${p.email}`}><Mail size={14} />{p.email}</a>}{d.travel ? <span><Briefcase size={14} />{String(d.travel)}</span> : null}</div></div>
      <ProfileHeaderActions crew={p.id} name={p.name} email={p.email} events={(events ?? []).map(e => ({ id: e.id, name: e.name, starts_at: e.starts_at, ends_at: e.ends_at }))} /></header>
    <LinkTabs current={tab} tabs={[["overview", "Overview"], ["availability", "Availability"], ["assignments", "Assignments"], ["activity", "Activity"]].map(([k, l]) => ({ key: k, label: l, href: k === "overview" ? base : `${base}?tab=${k}` }))} />
    <div className="tp-r1">
      <section className="k-card tp-bio">{p.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatar} alt="" /> : <span className="tp-av lg">{p.name.slice(0, 1)}</span>}
        <div><h2>{p.name}</h2><p className="tp-role">{p.role}</p><p className="tp-text">{p.bio || "No bio yet."}</p><div className="tp-skills">{(p.skills ?? []).map((s: string) => <span key={s}>{s}</span>)}</div></div></section>
      <section className="k-card tp-facts">{facts.map(([I, t, s]) => <div key={t}><I size={20} /><span><b>{t}</b><small>{s}</small></span></div>)}
        <div className="tp-login"><KeyRound size={20} /><span className="k-grow"><b>{linked ? "Login linked" : inv ? "Invitation pending" : "No login"}</b><small>{linked ? "Signs in to see their shifts, respond and request leave." : inv ? `Sent ${fmtD(inv.created_at)} · expires ${fmtD(inv.expires_at)} · as ${inv.role}` : "Scheduled without workspace access. Invite them to log in to see My shifts."}</small></span>
          {!linked && <FormDialog label={inv ? "Invited" : "Invite to log in"} icon="key" variant="outline" title={`Invite ${p.name} to log in`} sub={`Creates an invitation link for ${p.email || "their email"}. Email delivery isn't configured here — copy the link and share it. Accepting links this profile to their login.`} submitLabel="Create invitation link" disabledReason={inviteReason} action={inviteLoginForm.bind(null, p.id)} fields={[{ name: "role", label: "Workspace role", type: "select", required: true, options: [["member", "Member"], ["manager", "Manager"], ["finance", "Finance"]] }]} />}</div></section>
      <QuickActionsCard crew={p.id} name={p.name} status={p.status} profile={{ role: p.role, location: p.location, phone: p.phone, bio: p.bio, skills: p.skills ?? [] }} events={(events ?? []).map(e => ({ id: e.id, name: e.name, starts_at: e.starts_at, ends_at: e.ends_at }))} />
    </div>
    <div className="tpr-kpis">{([[Users, "Total assignments", S.length, `${up.length} upcoming`], [CalendarCheck, "This month", month.length, `${new Set(month.map(s => s.event_id)).size} events`], [Clock, "Hours this month", `${hours}h`, month.length ? `${Math.round(hours / Math.max(1, new Set(month.map(s => s.event_id)).size))}h avg / event` : "No shifts"], [CalendarDays, "Upcoming events", new Set(up.map(s => s.event_id)).size, nextEv ? `Next: ${nextEv.title}` : "None scheduled"]] as const).map(([I, l, v, s]) => <div key={l} className="k-card tm-kpi"><span><small>{l}</small><b>{v}</b><em>{s}</em></span><span className="tm-ki blue"><I size={20} /></span></div>)}
      <div className="k-card tm-kpi"><span><small>Availability</small><b className={conflict || p.status === "unavailable" ? "k-amber" : "k-green"}><i className={`tp-dot ${conflict || p.status === "unavailable" ? "amber" : ""}`} />{p.status === "unavailable" ? "Unavailable" : conflict ? "Has conflicts" : "Available"}</b><em>{conflict ? "Overlapping shifts — review below" : "No conflicts next 30 days"}</em></span></div></div>
    <div className="tp-r2">
      <section className="k-card tp-asg"><div className="k-between"><h2>Upcoming assignments</h2><Link className="k-link" href={`${base}?tab=assignments`}>View all <ArrowRight size={13} /></Link></div>
        <table className="tm-table"><thead><tr><th>Event</th><th>Role</th><th>Date &amp; time</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(tab === "assignments" ? S : up).slice(0, tab === "assignments" ? 50 : 5).map(s => { const [sl, st] = SH[s.status] ?? [s.status, "gray"]; return <tr key={s.id}><td><span className="tp-ev">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={s.events?.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span><b>{s.title}</b><small>{s.events?.venue_name || s.location}</small></span></span></td><td>{s.role}</td><td><b className="th-d">{fmtD(s.starts_at)}</b><small>{fmtT(s.starts_at)} – {fmtT(s.ends_at)}</small></td><td>{s.events?.city || s.location}</td><td><span className={`tm-st ${st}`}>{st === "green" ? <CheckCircle2 size={12} /> : <Clock size={12} />}{sl}</span></td><td><ProfileShiftMenu id={s.id} status={s.status} eventId={s.event_id} /></td></tr>; })}{!up.length && <tr><td colSpan={6} className="k-small" style={{ padding: 14 }}>No upcoming assignments.</td></tr>}</tbody></table></section>
      <section className="k-card tp-avail"><div className="k-between"><h2>Availability</h2></div>
        <div className="k-between tm-bt"><span className="tm-week"><Link href={`${base}?week=${ymd(new Date(mon.getTime() - 7 * 864e5))}`} aria-label="Previous week">‹</Link><b>{mon.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</b><Link href={`${base}?week=${ymd(new Date(mon.getTime() + 7 * 864e5))}`} aria-label="Next week">›</Link><Link className="tm-this" href={base}>Today</Link></span></div>
        <div className="tp-cal">{days.map(day => <div key={day.toISOString()}><span className="tp-cd"><small>{day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</small><b>{day.getUTCDate()}</b></span>{inDay(day).map(x => <span key={x.k} className={`tp-slot ${x.tone}`}><b>{x.label}</b><small>{x.sub}</small></span>)}{!inDay(day).length && <span className="tp-slot free">Available</span>}</div>)}</div>
        <div className="tp-legend"><span><i className="free" />Available</span><span><i className="as" />Assigned</span><span><i className="on" />Confirmed</span><span><i className="un" />Unavailable</span></div></section>
    </div>
    <div className="tp-r3">
      <section className="k-card tp-act"><div className="k-between"><h2>Recent activity</h2></div><ul>{(activity ?? []).map((a, i) => <li key={i}><span className="tm-ci green"><Activity size={16} /></span><span className="k-grow"><b>{a.event.replace("team.", "").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}</b><small>{String((a.metadata as Record<string, unknown>)?.role ?? "")}</small></span><small>{fmtD(a.created_at)}</small></li>)}{!(activity ?? []).length && <li className="k-small">No activity recorded yet.</li>}</ul></section>
      <section className="k-card tp-notes"><div className="k-between"><h2>Notes</h2></div><NoteForm crew={p.id} /><ul>{notes.slice(0, 4).map((n, i) => <li key={i}><span className="tm-av">{n.by.slice(0, 1)}</span><span className="k-grow"><b>{n.by}</b><p>{n.body}</p></span><small>{fmtD(n.at)}</small></li>)}{!notes.length && <li className="k-small">No notes yet.</li>}</ul></section>
      <section className="k-card tp-files"><div className="k-between"><h2>Files &amp; documents</h2><Link className="k-btn outline sm" href={`/organizer/events?tab=files&crew=${p.id}`}><Upload size={14} />Upload</Link></div><ul>{files.map(f => <li key={f.name}><FileText size={18} className="k-red" /><span className="k-grow"><b>{f.name}</b><small>{f.size}</small></span><small>{f.at}</small></li>)}{!files.length && <li className="k-small">No documents uploaded.</li>}</ul></section>
    </div>
  </div>;
}
