import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Headphones, ChevronDown, Ban, CircleCheck, Users, CalendarDays, Ticket, ShoppingCart, ShieldCheck, ShieldAlert, ChevronRight, Plus, Monitor, Eye,
  UserRound, KeyRound, Building2, StickyNote, BadgeCheck } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-users.css";
import "@/styles/admin-a-profile.css";
import { Avatar, Thumb, Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, titleCase } from "@/lib/workspace/format";
import { AdminMenu } from "../../_a/client";
import { Status, SectionHead, KVRows, Flag, TimelineItem, LineTabs } from "../../_a/ui";
import { shortRef, str, rpc, hmRange, langName, type SP } from "../../_a/lib";
import { setUserStatus, revokeSessions, addRecordNote } from "../../_a/actions";

export const metadata: Metadata = { title: "User profile" };

type Identity = { email: string; email_confirmed: boolean; phone: string | null; created_at: string; last_sign_in_at: string | null; mfa_factors: number; active_sessions: number };
type Profile = { full_name: string; avatar_url: string; phone: string; home_area: string; country: string; language: string; date_of_birth: string | null; marketing_opt_in: boolean;
  status: string; identity_verified: boolean; last_active_at: string | null; created_at: string };
type Tk = { id: string; status: string; price_paid: number; order_ref: string; created_at: string; tier: { name: string } | null; event: { name: string; starts_at: string | null } | null };
type Audit = { id: number; event: string; metadata: Record<string, unknown>; created_at: string };

const age = (dob: string, now: number) => Math.floor((now - new Date(dob).getTime()) / (365.25 * 864e5));
const auditIcon = (e: string) => e.startsWith("auth.login") ? Monitor : e.includes("viewed") ? Eye : e.startsWith("ticket") ? Ticket : e.startsWith("support") ? Headphones
  : e.includes("password") ? KeyRound : e.startsWith("admin") ? ShieldCheck : UserRound;
function auditText(a: Audit) {
  const m = a.metadata ?? {};
  const map: Record<string, string> = { "auth.login": "User logged in", "auth.registered": "Account created", "auth.mfa_verified": "Verified second factor", "auth.password_reset": "Password reset",
    "event.viewed": "Viewed event", "ticket.purchased": "Ticket purchased", "profile.updated": "Account details updated", "admin.user_restricted": "Restricted by admin",
    "admin.user_active": "Reactivated by admin", "admin.sessions_revoked": "Sessions revoked by admin", "admin.note_added": "Admin note added", "event.created": "Event created" };
  const detail = [m.event, m.order ? `Order #${String(m.order).replace(/^BK-/, "")}` : null, typeof m.amount === "number" ? money(m.amount, "GBP", { cents: true }) : null, m.location,
    Array.isArray(m.fields) ? (m.fields as string[]).map(titleCase).join(", ") : null].filter(Boolean).join(" · ");
  return { title: map[a.event] ?? titleCase(a.event.replace(/\./g, " ")), detail: String(detail) };
}

export default async function UserProfilePage(props: PageProps<"/admin/users/[id]">) {
  const ctx = await requireAdminPermission("users");
  if (!ctx.allowed) return <Restricted area="Users" />;
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = (await props.searchParams) as SP;
  const tab = ["access", "activity", "support"].includes(str(sp, "tab")) ? str(sp, "tab") : "overview";
  const { db, permissions, userId } = ctx;
  const canSupport = permissions.has("support"), canTrust = permissions.has("trust"), canAudit = permissions.has("audit"), canTickets = permissions.has("tickets");
  const now = requestTime();

  const identity = await rpc<Identity>(db, "admin_user_identity", { p_user: id }).catch(() => null);
  if (!identity) notFound();
  const [profile, members, events, tickets, cases, trust, audit, notes] = await Promise.all([
    one<Profile>(db.from("profiles").select("full_name,avatar_url,phone,home_area,country,language,date_of_birth,marketing_opt_in,status,identity_verified,last_active_at,created_at").eq("id", id).maybeSingle()),
    rows<{ role: string; status: string; created_at: string; workspace: { id: string; name: string; kind: string; created_at: string } | null }>(
      db.from("workspace_members").select("role,status,created_at,workspace:workspaces(id,name,kind,created_at)").eq("user_id", id).order("created_at")),
    rows<{ id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; venue_name: string; city: string; cover_image: string }>(
      db.from("events").select("id,name,starts_at,ends_at,status,venue_name,city,cover_image").eq("owner_id", id).order("starts_at", { ascending: false }).limit(50)),
    canTickets ? rows<Tk>(db.from("tickets").select("id,status,price_paid,order_ref,created_at,tier:ticket_tiers(name),event:events(name,starts_at)").eq("holder_id", id).order("created_at", { ascending: false }).limit(500)) : Promise.resolve([] as Tk[]),
    canSupport ? rows<{ id: string; reference: string; subject: string; priority: string; status: string; created_at: string }>(
      db.from("support_cases").select("id,reference,subject,priority,status,created_at").eq("requester_id", id).order("created_at", { ascending: false }).limit(20)) : Promise.resolve([]),
    canTrust ? rows<{ id: string; category: string; risk_score: number; status: string }>(db.from("trust_cases").select("id,category,risk_score,status").eq("subject_type", "user").eq("subject_id", id).in("status", ["open", "in_review"])) : Promise.resolve([]),
    canAudit ? rows<Audit>(db.from("audit_events").select("id,event,metadata,created_at").or(`actor_id.eq.${id},metadata->>user_id.eq.${id}`).order("created_at", { ascending: false }).limit(tab === "activity" ? 50 : 6)) : Promise.resolve([] as Audit[]),
    rows<{ id: number; body: string; author_name: string; created_at: string }>(db.from("admin_record_notes").select("id,body,author_name,created_at").eq("subject_type", "user").eq("subject_id", id).order("created_at", { ascending: false }).limit(5)),
  ]);
  const nm = profile?.full_name || identity.email.split("@")[0]!;
  const restricted = profile?.status === "restricted", self = id === userId;
  const live = tickets.filter(t => !["refunded", "cancelled"].includes(t.status));
  const orderMap = new Map<string, { ref: string; at: string; n: number; total: number; refunded: boolean }>();
  for (const t of tickets) {
    const o = orderMap.get(t.order_ref) ?? { ref: t.order_ref, at: t.created_at, n: 0, total: 0, refunded: true };
    o.n++; o.total += Number(t.price_paid); o.refunded &&= t.status === "refunded"; if (t.created_at > o.at) o.at = t.created_at;
    orderMap.set(t.order_ref, o);
  }
  const orders = [...orderMap.values()].sort((a, b) => b.at.localeCompare(a.at));
  const spend = live.reduce((a, t) => a + Number(t.price_paid), 0);
  const upcoming = events.filter(e => e.starts_at && new Date(e.starts_at).getTime() > now).length;
  const openCases = cases.filter(c => c.status !== "resolved");
  const ws = members.filter(m => m.workspace);
  const lastPw = audit.find(a => a.event === "auth.password_reset");
  const loginLoc = audit.find(a => a.event === "auth.login")?.metadata?.location as string | undefined;
  const base = `/admin/users/${id}`;
  const recentTickets = [...new Map(tickets.map(t => [`${t.event?.name}|${t.tier?.name}`, t])).values()].slice(0, 4);

  const identityPanel = <section className="aa-panel ap-identity">
    <SectionHead title="Identity &amp; contact" />
    <KVRows rows={[
      ["Full name", nm],
      ["Email", identity.email, identity.email_confirmed ? <span className="ap-ok">✓ Verified</span> : <span className="ap-warn">Unverified</span>],
      ["Phone", profile?.phone || identity.phone || "—", profile?.phone ? (profile.identity_verified ? <span className="ap-ok">✓ Verified</span> : <span className="ap-warn">Unverified</span>) : ""],
      ["Date of birth", profile?.date_of_birth ? `${day(profile.date_of_birth, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} (${age(profile.date_of_birth, now)})` : "—"],
      ["Location", profile?.home_area ? <span className="aa-loc"><Flag country={profile.country} />{profile.home_area}</span> : "—"],
      ["Language", langName(profile?.language)],
      ["Marketing", profile?.marketing_opt_in ? "Subscribed" : "Not subscribed"],
    ]} />
  </section>;
  const membershipPanel = <section className="aa-panel ap-members">
    <SectionHead title="Memberships &amp; workspaces" href={ws[0] ? `/admin/workspaces/${ws[0].workspace!.id}` : undefined} />
    {ws.length ? ws.slice(0, tab === "access" ? 10 : 1).map(m => <Link key={m.workspace!.id} className="ap-member" href={`/admin/workspaces/${m.workspace!.id}`}>
      <span className="ico"><Building2 aria-hidden="true" /></span><div><b>{m.workspace!.name}</b><small><em>{titleCase(m.role)}</em> · Joined {day(m.created_at, { day: "numeric", month: "short", year: "numeric" })}</small></div>
      <Status value={m.status === "active" ? "active" : m.status} label={titleCase(m.status)} /></Link>)
      : <div className="ap-member"><span className="ico"><Users aria-hidden="true" /></span><div><b>Personal Workspace</b><small><em>Owner</em> · Created {day(identity.created_at, { day: "numeric", month: "short", year: "numeric" })}</small></div><Status value="active" label="Active" /></div>}
    {tab !== "access" && <Link className="ap-more" href={`${base}?tab=access`}><Plus aria-hidden="true" />View linked organisations ({Math.max(0, ws.length - 1)})</Link>}
  </section>;
  const securityPanel = <section className="aa-panel ap-security">
    <SectionHead title="Security &amp; access" href={`${base}?tab=access`} />
    <dl className="ap-sec">
      <div><dt>Account status</dt><dd>{restricted ? <Status value="restricted" label="Restricted" /> : <Status value="active" label="Active" />}</dd></div>
      <div><dt>Identity verification</dt><dd>{profile?.identity_verified ? <Status value="verified" label="Verified" /> : <Status value="unverified" label="Unverified" />}</dd>
        <dd>{canTrust && <Link className="ws-btn outline sm" href={`/admin/trust?q=${encodeURIComponent(nm)}`}>View details</Link>}</dd></div>
      <div><dt>MFA</dt><dd>{identity.mfa_factors ? <Status value="verified" label="Enabled" /> : <Status value="unverified" label="Not enabled" />}</dd></div>
      <div><dt>Active sessions</dt><dd>{identity.active_sessions}</dd>
        <dd>{!self && identity.active_sessions > 0 && <ActionButton action={revokeSessions} args={[id]} reason variant="outline" className="sm"
          confirm={{ title: `Revoke all of ${nm}'s sessions?`, body: "They will be signed out on every device and must sign in again.", cta: "Revoke all sessions" }}>Revoke all sessions</ActionButton>}</dd></div>
      <div><dt>Last password change</dt><dd>{lastPw ? day(lastPw.created_at, { day: "numeric", month: "short", year: "numeric" }) : canAudit ? "Never changed" : "—"}</dd></div>
      <div><dt>Last login</dt><dd>{relative(identity.last_sign_in_at ?? profile?.last_active_at, now)}{loginLoc ? ` · ${loginLoc}` : ""}</dd></div>
    </dl>
  </section>;
  const timelinePanel = <section className="aa-panel ap-timeline">
    <SectionHead title="Activity timeline" href={tab === "activity" ? undefined : `${base}?tab=activity`} />
    {!canAudit ? <p className="aa-empty">Activity history needs the Audit permission.</p> : audit.length ? <ul className="aa-tls ap-tls">{audit.map(a => {
      const t = auditText(a);
      return <TimelineItem key={a.id} icon={auditIcon(a.event)} title={t.title} meta={<>{relative(a.created_at, now)}{t.detail ? ` · ${t.detail}` : ""}</>} />;
    })}</ul> : <p className="aa-empty">No recorded activity yet.</p>}
    {tab !== "activity" && canAudit && audit.length > 0 && <Link className="ws-btn outline block ap-showmore" href={`${base}?tab=activity`}>Show more</Link>}
  </section>;
  const supportPanel = canSupport ? <section className="aa-panel ap-support">
    <SectionHead title="Support cases" href={`/admin/support?q=${encodeURIComponent(identity.email)}`} />
    {cases.length ? <ul className="ap-cases">{cases.slice(0, tab === "support" ? 20 : 2).map(c => <li key={c.id}><Link href={`/admin/support/${c.id}`}><b>#{c.reference.replace(/^D-/, "")}</b>
      <div><span>{c.subject}</span><small>{day(c.created_at, { day: "numeric", month: "short", year: "numeric" })} · <em className={c.status}>{titleCase(c.status)}</em></small></div>
      <Status value={c.status} dot={false} /></Link></li>)}</ul> : <p className="aa-empty">No support cases.</p>}
  </section> : null;
  const notesPanel = <section className="aa-panel ap-notes">
    <SectionHead title="Admin notes" />
    <ActionForm action={addRecordNote.bind(null, "user", id)} className="aa-note-form" resetOnSuccess>
      <label className="sr-only" htmlFor="ap-note">Internal note</label>
      <input id="ap-note" name="body" placeholder="Add an internal note (visible to admins only)..." maxLength={2000} required minLength={2} />
      <button type="submit" className="ws-btn primary">Add note</button>
    </ActionForm>
    {notes.length ? notes.slice(0, tab === "overview" ? 1 : 5).map(n => <div key={n.id} className="aa-note"><span className="ap-note-ico"><StickyNote aria-hidden="true" /></span>
      <div><small><b>{n.author_name}</b> · {day(n.created_at, { day: "numeric", month: "short", year: "numeric" })}</small><p>{n.body}</p></div></div>) : <p className="aa-empty">No notes yet.</p>}
  </section>;

  return <div className="aa ap">
    <Link className="aa-back" href="/admin/users"><ArrowLeft aria-hidden="true" />Back to Users</Link>
    <header className="aa-hero ap-hero">
      <Avatar src={profile?.avatar_url} name={nm} size={86} />
      <div className="ap-hero-text">
        <h1>{nm} {profile?.identity_verified ? <span className="aa-chip green ap-vchip"><BadgeCheck aria-hidden="true" />Verified</span> : <span className="aa-chip amber">Unverified</span>}
          {restricted && <Status value="restricted" label="Restricted" />}</h1>
        <p className="aa-hero-meta">{shortRef("USR", id)}<span className="sep">•</span>{identity.email}{(profile?.phone || identity.phone) && <><span className="sep">•</span>{profile?.phone || identity.phone}</>}</p>
        <p className="aa-hero-meta">{profile?.home_area && <span className="aa-loc"><Flag country={profile.country} />{profile.home_area}</span>}<span className="sep">•</span>
          Joined {day(identity.created_at, { day: "numeric", month: "short", year: "numeric" })}<span className="sep">•</span>Last active {relative(profile?.last_active_at ?? identity.last_sign_in_at, now)}</p>
      </div>
      <div className="aa-hero-actions">
        <a className="ws-btn outline" href={`mailto:${identity.email}`}><Mail aria-hidden="true" />Message</a>
        {canSupport && <Link className="ws-btn outline" href={`/admin/support?q=${encodeURIComponent(identity.email)}`}><Headphones aria-hidden="true" />Open in Support</Link>}
        <AdminMenu label="More actions" className="ws-btn outline ap-more-btn" trigger={<>More actions<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Access & sessions", href: `${base}?tab=access` },
          { kind: "link", label: "Full activity", href: `${base}?tab=activity` },
          ...(!self && identity.active_sessions > 0 ? [{ kind: "action" as const, label: "Revoke all sessions", action: revokeSessions, args: [id], reason: true, danger: true,
            confirm: { title: `Revoke all of ${nm}'s sessions?`, body: "They will be signed out on every device.", cta: "Revoke sessions" } }] : []),
          { kind: "link", label: "Export this user (CSV)", href: `/admin/users/export?id=${id}` }]} />
        {!self && (restricted
          ? <ActionButton action={setUserStatus} args={[id, "active"]} reason variant="outline" confirm={{ title: `Reactivate ${nm}?`, body: "They will be able to sign in, book and buy tickets again.", cta: "Reactivate" }}><CircleCheck aria-hidden="true" />Reactivate user</ActionButton>
          : <ActionButton action={setUserStatus} args={[id, "restricted"]} reason variant="danger" confirm={{ title: `Restrict ${nm}?`, body: "They will be blocked from transacting. Existing tickets stay valid. The decision is appealable.", cta: "Restrict user" }}><Ban aria-hidden="true" />Restrict user</ActionButton>)}
      </div>
    </header>

    <LineTabs base={base} sp={sp} active={tab} className="ap-tabs" tabs={[{ key: "overview", label: "Overview" }, { key: "access", label: "Access" }, { key: "activity", label: "Activity" }, { key: "support", label: "Support" }]} />

    <section className="ap-kpis" aria-label="Summary">
      <Link href={ws[0] ? `/admin/workspaces/${ws[0].workspace!.id}` : `${base}?tab=access`} className="ap-kpi"><span className="aa-tile blue"><Users aria-hidden="true" /></span><div><small>Workspaces</small><b>{ws.length || 1}</b><em>{ws[0]?.workspace?.name ?? "Personal"} <ChevronRight aria-hidden="true" /></em></div></Link>
      <div className="ap-kpi"><span className="aa-tile purple"><CalendarDays aria-hidden="true" /></span><div><small>Events</small><b>{events.length}</b><em>{upcoming} upcoming</em></div></div>
      <div className="ap-kpi"><span className="aa-tile red"><Ticket aria-hidden="true" /></span><div><small>Tickets</small><b>{tickets.length}</b><em>{tickets.filter(t => t.status === "used").length} used</em></div></div>
      <div className="ap-kpi"><span className="aa-tile red"><ShoppingCart aria-hidden="true" /></span><div><small>Orders</small><b>{orders.length}</b><em>{money(spend)} total spend</em></div></div>
      <div className="ap-kpi"><span className="aa-tile blue"><Headphones aria-hidden="true" /></span><div><small>Support cases</small><b>{cases.length}</b><em className={openCases.length ? "red" : ""}>{openCases.length} open</em></div></div>
      <div className="ap-kpi"><span className={`aa-tile ${trust.length || restricted ? "red" : "green"}`}>{trust.length || restricted ? <ShieldAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}</span>
        <div><small>Trust status</small><b className={trust.length || restricted ? "bad" : "good"}>{restricted ? "Restricted" : trust.length ? "Under review" : "Good standing"}</b><em>{trust.length ? `${trust.length} active flag${trust.length > 1 ? "s" : ""}` : "No active flags"}</em></div></div>
    </section>

    {tab === "overview" && <div className="ap-grid">
      <div className="ap-col">{identityPanel}{membershipPanel}{securityPanel}</div>
      <div className="ap-col">
        <section className="aa-panel ap-events">
          <SectionHead title="Recent events" href={`/admin/events?q=${encodeURIComponent(nm)}`} />
          {events.length ? <ul className="ap-evlist">{events.slice(0, 3).map(e => <li key={e.id}><Thumb src={e.cover_image} w={80} h={50} />
            <div><b>{e.name}</b><small>{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })} · {hmRange(e.starts_at, e.ends_at)}</small><small>{[e.venue_name, e.city].filter(Boolean).join(", ")}</small></div>
            {e.starts_at && new Date(e.starts_at).getTime() > now ? <Status value="active" label="Upcoming" dot={false} /> : <Status value="past" label="Past" dot={false} />}</li>)}</ul>
            : <p className="aa-empty">This user hasn’t created any events.</p>}
        </section>
        <section className="aa-panel ap-tickets">
          <SectionHead title="Recent tickets" href={canTickets ? `/admin/tickets?q=${encodeURIComponent(identity.email)}` : undefined} />
          {!canTickets ? <p className="aa-empty">Ticket history needs the Tickets permission.</p> : recentTickets.length ? <table className="aa-mtable"><thead><tr><th>Event</th><th>Date</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>{recentTickets.map(t => <tr key={t.id}><td>{t.event?.name}</td><td>{day(t.event?.starts_at, { day: "numeric", month: "short", year: "numeric" })}</td><td className="aa-muted">{t.tier?.name}</td>
              <td>{t.status === "valid" ? <Status value="valid" label="Valid" /> : <Status value={t.status} dot={false} />}</td></tr>)}</tbody></table> : <p className="aa-empty">No tickets held.</p>}
        </section>
        <section className="aa-panel ap-orders">
          <SectionHead title="Recent orders" href={canTickets ? `/admin/tickets?tab=orders&q=${encodeURIComponent(identity.email)}` : undefined} />
          {orders.length ? <table className="aa-mtable"><thead><tr><th>Order</th><th>Date</th><th>Items</th><th className="r">Total</th><th>Status</th></tr></thead>
            <tbody>{orders.slice(0, 4).map(o => <tr key={o.ref}><td><b>#{o.ref.replace(/^BK-/, "")}</b></td><td>{day(o.at, { day: "numeric", month: "short", year: "numeric" })}</td><td className="aa-muted">{o.n} x Ticket{o.n > 1 ? "s" : ""}</td>
              <td className="r">{money(o.total, "GBP", { cents: true })}</td><td>{o.refunded ? <Status value="refunded" label="Refunded" /> : <Status value="paid" label="Paid" />}</td></tr>)}</tbody></table>
            : <p className="aa-empty">{canTickets ? "No orders." : "Order history needs the Tickets permission."}</p>}
        </section>
      </div>
      <div className="ap-col">{timelinePanel}{supportPanel}{notesPanel}</div>
    </div>}
    {tab === "access" && <div className="ap-grid two"><div className="ap-col">{securityPanel}{identityPanel}</div><div className="ap-col">{membershipPanel}{notesPanel}</div></div>}
    {tab === "activity" && <div className="ap-grid two"><div className="ap-col">{timelinePanel}</div><div className="ap-col">{notesPanel}</div></div>}
    {tab === "support" && <div className="ap-grid two"><div className="ap-col">{supportPanel ?? <Restricted area="Support" />}</div><div className="ap-col">{notesPanel}</div></div>}
  </div>;
}
