import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Users, BadgeCheck, ShieldAlert, CalendarDays, Ticket, Download, Filter, ChevronRight, Building2, Headphones, Mail, CircleCheck, Ban, UserRound, CalendarCheck, Layers } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-users.css";
import { Kpi, Avatar, Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, time } from "@/lib/workspace/format";
import { AdminMenu, SearchBox, SelectAll } from "../_a/client";
import { Pager, PillTabs, Status, DrawerClose, SectionHead, KVRows, Flag } from "../_a/ui";
import { shortRef, str, pageOf, qs, rpc, type SP } from "../_a/lib";
import { setUserStatus } from "../_a/actions";

export const metadata: Metadata = { title: "Users" };

type Dir = { id: string; email: string; full_name: string | null; avatar_url: string | null; status: string; identity_verified: boolean; created_at: string; last_active_at: string | null;
  account_type: string; workspaces: number; workspace_name: string | null; events: number; upcoming_events: number; tickets: number; used_tickets: number; trust_flag: string | null; open_cases: number; total_count: number };
type Stats = { total: number; total_prev: number; verified: number; restricted: number; with_events: number; with_tickets: number };
type Identity = { email: string; email_confirmed: boolean; phone: string | null; created_at: string; last_sign_in_at: string | null; mfa_factors: number; active_sessions: number };

const typeTone: Record<string, string> = { consumer: "", organizer: "purple", provider: "", admin: "grey" };
const name = (u: { full_name: string | null; email: string }) => u.full_name || u.email.split("@")[0]!;
function flagOf(u: Dir) {
  if (u.trust_flag) return <span className="aa-flag red">{u.trust_flag}</span>;
  if (u.open_cases) return <span className="aa-flag amber">Support ({u.open_cases})</span>;
  return <span className="aa-flag">None</span>;
}

export default async function UsersPage(props: PageProps<"/admin/users">) {
  const ctx = await requireAdminPermission("users");
  if (!ctx.allowed) return <Restricted area="Users" />;
  const sp = (await props.searchParams) as SP;
  const { db, permissions, userId } = ctx;
  const filter = ["restricted", "verified"].includes(str(sp, "filter")) ? str(sp, "filter") : "all";
  const q = str(sp, "q").slice(0, 80);
  const { per, page, offset } = pageOf(sp);
  const now = requestTime();

  const [stats, list, overview] = await Promise.all([
    rpc<Stats>(db, "admin_user_stats"),
    rpc<Dir[]>(db, "admin_user_directory", { p_search: q, p_filter: filter, p_limit: per, p_offset: offset }),
    rpc<{ users?: { cumulative: number[]; signups: number[] } }>(db, "admin_overview", { p_days: 30 }),
  ]);
  const total = list[0]?.total_count ?? 0;
  const selId = str(sp, "sel") === "none" ? null : isUuid(str(sp, "sel")) ? str(sp, "sel") : list[0]?.id ?? null;
  const base = "/admin/users";

  return <div className="aa aa-users">
    <header className="ws-page-head">
      <div><h1>Users</h1><p>Search and manage consumer and individual identities across the platform.</p></div>
      <div className="aa-head-actions">
        <a className="ws-btn outline" href={qs(`${base}/export`, { q, filter: filter === "all" ? "" : filter })}><Download aria-hidden="true" />Export</a>
        <Link className="ws-btn outline" href="/admin/support"><Headphones aria-hidden="true" />Support queue</Link>
      </div>
    </header>

    <section className="aa-kpis aa-users-kpis" aria-label="User metrics">
      <Kpi icon={Users} tone="blue" label="Total Users" value={stats.total.toLocaleString("en-GB")} delta={delta(stats.total, stats.total_prev)} deltaSuffix="vs last 30 days" series={overview.users?.cumulative} />
      <Kpi icon={BadgeCheck} tone="green" label="Verified Users" value={stats.verified.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={ShieldAlert} tone="purple" label="Restricted Users" value={stats.restricted.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={CalendarDays} tone="purple" label="Users with Events" value={stats.with_events.toLocaleString("en-GB")} delta={null} />
      <Kpi icon={Ticket} tone="orange" label="Users with Tickets" value={stats.with_tickets.toLocaleString("en-GB")} delta={null} />
    </section>

    <div className="aa-split">
      <div className="aa-listcol">
        <div className="aa-bar">
          <PillTabs base={base} sp={sp} active={filter} tabs={[{ key: "all", label: "All Users", count: stats.total }, { key: "restricted", label: "Restricted", count: stats.restricted }, { key: "verified", label: "Verified", count: stats.verified }]} />
          <Suspense><SearchBox placeholder="Search by name, email, phone or user ID..." /></Suspense>
          <AdminMenu label="Filters" className="ws-btn outline aa-filters-btn" trigger={<><Filter aria-hidden="true" />Filters</>} entries={[
            { kind: "link", label: "All users", href: qs(base, sp, { filter: null, page: null, sel: null }) },
            { kind: "link", label: "Restricted only", href: qs(base, sp, { filter: "restricted", page: null, sel: null }) },
            { kind: "link", label: "Verified only", href: qs(base, sp, { filter: "verified", page: null, sel: null }) },
            { kind: "link", label: "Clear search", href: qs(base, sp, { q: null, page: null, sel: null }) }]} />
        </div>

        <form className="aa-table-form" action={`${base}/export`} method="get">
          <div className="aa-table-card">
            <div className="aa-bulk"><span>Selected users</span><button type="submit" className="ws-btn outline sm"><Download aria-hidden="true" />Export selected</button></div>
            <div className="aa-table-scroll"><table className="aa-table">
              <colgroup><col style={{ width: 34 }} /><col style={{ width: "21%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10.5%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8%" }} /><col style={{ width: "7%" }} /><col style={{ width: "12%" }} /><col style={{ width: "9.5%" }} /><col style={{ width: "10%" }} /><col style={{ width: 62 }} /></colgroup>
              <thead><tr><th className="ck"><SelectAll /></th><th>User</th><th>Type</th><th>Identity</th><th>Workspaces</th><th>Events</th><th>Tickets</th><th>Trust / Flags</th><th>Last active</th><th>Status</th><th className="act">Actions</th></tr></thead>
              <tbody>{list.map(u => <tr key={u.id} className={u.id === selId ? "sel" : ""}>
                <td className="ck"><input type="checkbox" name="id" value={u.id} aria-label={`Select ${name(u)}`} /></td>
                <td><Link className="aa-who" href={qs(base, sp, { sel: u.id })} scroll={false}><Avatar src={u.avatar_url} name={name(u)} size={36} />
                  <div><b>{name(u)}</b><small>{u.email}</small><small>{shortRef("USR", u.id)}</small></div></Link></td>
                <td><span className={`aa-chip ${typeTone[u.account_type] ?? ""}`}>{u.account_type[0]!.toUpperCase() + u.account_type.slice(1)}</span></td>
                <td>{u.identity_verified ? <Status value="verified" label="Verified" /> : <Status value="unverified" label="Unverified" />}</td>
                <td>{u.workspaces || 1}<small>{u.workspace_name ?? "Personal"}</small></td>
                <td>{u.events}<small>{u.events ? `${u.upcoming_events} upcoming` : ""}</small></td>
                <td>{u.tickets}<small>{u.tickets ? `${u.used_tickets} used` : "—"}</small></td>
                <td>{flagOf(u)}</td>
                <td>{relative(u.last_active_at, now)}</td>
                <td>{u.status === "restricted" ? <Status value="restricted" label="Restricted" /> : <Status value="active" label="Active" />}</td>
                <td className="act"><AdminMenu label={`Actions for ${name(u)}`} entries={[
                  { kind: "link", label: "Open full profile", href: `${base}/${u.id}` },
                  { kind: "link", label: "Email user", href: `mailto:${u.email}`, external: true },
                  ...(permissions.has("support") ? [{ kind: "link" as const, label: "Open in Support", href: `/admin/support?q=${encodeURIComponent(u.email)}` }] : []),
                  ...(u.id === userId ? [] : u.status === "restricted"
                    ? [{ kind: "action" as const, label: "Reactivate user", action: setUserStatus, args: [u.id, "active"], reason: true, confirm: { title: `Reactivate ${name(u)}?`, body: "They will be able to sign in, book and buy tickets again.", cta: "Reactivate" } }]
                    : [{ kind: "action" as const, label: "Restrict user", action: setUserStatus, args: [u.id, "restricted"], danger: true, reason: true, confirm: { title: `Restrict ${name(u)}?`, body: "They will be blocked from transacting. Existing tickets stay valid.", cta: "Restrict user" } }])]} /></td>
              </tr>)}
              {!list.length && <tr><td colSpan={11}><div className="aa-empty">No users match these filters.</div></td></tr>}</tbody>
            </table></div>
          </div>
        </form>
        <Pager base={base} sp={sp} page={page} per={per} total={total} />
      </div>

      {selId ? <Suspense fallback={<aside className="aa-drawer" aria-busy="true" />}><UserDrawer id={selId} sp={sp} row={list.find(r => r.id === selId)} canSupport={permissions.has("support")} canTrust={permissions.has("trust")} self={selId === userId} /></Suspense>
        : <aside className="aa-drawer aa-drawer-empty"><p className="aa-empty">Select a user to see their identity, workspaces and activity.</p></aside>}
    </div>
  </div>;
}

async function UserDrawer({ id, sp, row, canSupport, canTrust, self }: { id: string; sp: SP; row?: Dir; canSupport: boolean; canTrust: boolean; self: boolean }) {
  const { db } = await requireAdminPermission("users");
  const now = requestTime();
  const [identity, profile, members, tickets, events, cases, trust] = await Promise.all([
    rpc<Identity>(db, "admin_user_identity", { p_user: id }).catch(() => null),
    one<{ full_name: string; avatar_url: string; phone: string; home_area: string; country: string; status: string; identity_verified: boolean; last_active_at: string | null; created_at: string }>(
      db.from("profiles").select("full_name,avatar_url,phone,home_area,country,status,identity_verified,last_active_at,created_at").eq("id", id).maybeSingle()),
    rows<{ role: string; status: string; created_at: string; workspace: { id: string; name: string; kind: string } | null }>(
      db.from("workspace_members").select("role,status,created_at,workspace:workspaces(id,name,kind)").eq("user_id", id).order("created_at")),
    rows<{ id: string; status: string; price_paid: number; order_ref: string; created_at: string; event: { name: string } | null }>(
      db.from("tickets").select("id,status,price_paid,order_ref,created_at,event:events(name)").eq("holder_id", id).order("created_at", { ascending: false }).limit(500)),
    rows<{ id: string; name: string; starts_at: string | null; status: string }>(db.from("events").select("id,name,starts_at,status").eq("owner_id", id).order("starts_at", { ascending: false }).limit(50)),
    canSupport ? rows<{ id: string; reference: string; subject: string; priority: string; status: string; created_at: string }>(
      db.from("support_cases").select("id,reference,subject,priority,status,created_at").eq("requester_id", id).order("created_at", { ascending: false }).limit(3)) : Promise.resolve([]),
    canTrust ? rows<{ id: string; category: string; risk_score: number }>(db.from("trust_cases").select("id,category,risk_score").eq("subject_type", "user").eq("subject_id", id).in("status", ["open", "in_review"])) : Promise.resolve([]),
  ]);
  if (!profile && !identity) return <aside className="aa-drawer"><p className="aa-empty">That user no longer exists.</p></aside>;
  const nm = profile?.full_name || identity?.email?.split("@")[0] || "User";
  const live = tickets.filter(t => !["refunded", "cancelled"].includes(t.status));
  const spend = live.reduce((a, t) => a + Number(t.price_paid), 0), orders = new Set(live.map(t => t.order_ref)).size;
  const upcoming = events.filter(e => e.starts_at && new Date(e.starts_at).getTime() > now).length;
  const dtab = ["events", "tickets"].includes(str(sp, "dtab")) ? str(sp, "dtab") : "overview";
  const base = "/admin/users", restricted = profile?.status === "restricted";
  const joined = identity?.created_at ?? profile?.created_at;
  const supportCase = cases.find(c => c.status !== "resolved") ?? cases[0];
  const ws = members.filter(m => m.workspace);

  return <aside className="aa-drawer aa-user-drawer" aria-label={`${nm} details`}>
    <div className="aa-drawer-head"><Avatar src={profile?.avatar_url} name={nm} size={44} /><div><h2>{nm}</h2><small>{shortRef("USR", id)}</small></div>
      <DrawerClose href={qs(base, sp, { sel: "none", dtab: null })} /></div>
    <nav className="aa-dtabs" aria-label="User sections">
      <Link href={qs(base, sp, { sel: id, dtab: null })} scroll={false} className={dtab === "overview" ? "on" : ""}>Overview</Link>
      <Link href={qs(base, sp, { sel: id, dtab: "events" })} scroll={false} className={dtab === "events" ? "on" : ""}>Events ({events.length})</Link>
      <Link href={qs(base, sp, { sel: id, dtab: "tickets" })} scroll={false} className={dtab === "tickets" ? "on" : ""}>Tickets ({tickets.length})</Link>
      <AdminMenu label="More user actions" entries={[{ kind: "link", label: "Open full profile", href: `${base}/${id}` }, ...(identity?.email ? [{ kind: "link" as const, label: "Copy email (mailto)", href: `mailto:${identity.email}`, external: true }] : [])]} />
    </nav>

    {dtab === "overview" && <>
      <section>
        <SectionHead title="Identity" />
        <KVRows rows={[
          ["Email", identity?.email ?? "—", identity?.email_confirmed ? <Status value="verified" label="Verified" /> : <Status value="unverified" label="Unverified" />],
          ["Phone", profile?.phone || identity?.phone || "—", profile?.phone ? (profile.identity_verified ? <Status value="verified" label="Verified" /> : <Status value="unverified" label="Unverified" />) : ""],
          ["Joined", joined ? `${day(joined, { day: "numeric", month: "short", year: "numeric" })}, ${time(joined)}` : "—"],
          ["Last active", relative(profile?.last_active_at ?? identity?.last_sign_in_at, now)],
          ["Location", profile?.home_area ? <span className="aa-loc"><Flag country={profile.country} />{profile.home_area}</span> : "—"],
        ]} />
      </section>
      <section>
        <SectionHead title="Workspaces"><span className="aa-muted aa-small">{ws.length || 1} workspace{ws.length > 1 ? "s" : ""}</span></SectionHead>
        <div className="aa-wscards">{ws.length ? ws.slice(0, 2).map(m => <Link key={m.workspace!.id} className="aa-wscard" href={`/admin/workspaces/${m.workspace!.id}`}>
          <span className="ico"><Building2 aria-hidden="true" /></span><div><b>{m.workspace!.name}</b><span className="aa-chip green">{m.role[0]!.toUpperCase() + m.role.slice(1)}</span></div>
          <small>Since {day(m.created_at, { month: "short", year: "numeric" })}</small><ChevronRight aria-hidden="true" /></Link>)
          : <div className="aa-wscard"><span className="ico"><Users aria-hidden="true" /></span><div><b>Personal</b><span className="aa-chip green">Owner</span></div><small>Since {day(joined, { month: "short", year: "numeric" })}</small></div>}</div>
      </section>
      <section>
        <SectionHead title="Activity summary" />
        <div className="aa-acts">
          <div><span className="ico blue"><CalendarCheck aria-hidden="true" /></span><b>{events.length}</b><small>Events</small><small>{upcoming} upcoming</small></div>
          <div><span className="ico purple"><Ticket aria-hidden="true" /></span><b>{tickets.length}</b><small>Tickets</small><small>{tickets.filter(t => t.status === "used").length} used</small></div>
          <div><span className="ico blue"><Layers aria-hidden="true" /></span><b>{money(spend)}</b><small>Total spend</small><small>{orders} orders</small></div>
        </div>
      </section>
      <section>
        <SectionHead title="Trust &amp; flags" />
        {trust.length || row?.trust_flag ? <p className="aa-flagline bad"><ShieldAlert aria-hidden="true" />{trust.length ? trust.map(t => `${t.category} (risk ${t.risk_score})`).join(", ") : row?.trust_flag}</p>
          : <p className="aa-flagline"><CircleCheck aria-hidden="true" />No active flags</p>}
        <KVRows className="aa-checks" rows={[
          ["Identity verified", profile?.identity_verified ? <Status value="verified" label="Yes" /> : <Status value="unverified" label="No" />],
          ["Multi-factor", identity?.mfa_factors ? <Status value="verified" label="Yes" /> : <Status value="unverified" label="No" />],
          ["Account in good standing", restricted ? <Status value="restricted" label="No" /> : <Status value="verified" label="Yes" />],
        ]} />
      </section>
      {canSupport && <section>
        <SectionHead title="Support" href={`/admin/support?q=${encodeURIComponent(identity?.email ?? nm)}`} />
        {supportCase ? <Link className="aa-wscard" href={`/admin/support/${supportCase.id}`}><span className="ico"><Headphones aria-hidden="true" /></span>
          <div><b>#{supportCase.reference} {supportCase.subject}</b><small>{relative(supportCase.created_at, now)} · {supportCase.priority[0]!.toUpperCase() + supportCase.priority.slice(1)} priority</small></div>
          <Status value={supportCase.status} dot={false} /></Link> : <p className="aa-empty">No support cases.</p>}
      </section>}
    </>}

    {dtab === "events" && <ul className="aa-dlist">{events.length ? events.map(e => <li key={e.id}><b>{e.name}</b><small>{day(e.starts_at, { day: "numeric", month: "short", year: "numeric" })}</small><Status value={e.status} dot={false} /></li>)
      : <li className="aa-empty">No events created by this user.</li>}</ul>}
    {dtab === "tickets" && <ul className="aa-dlist">{tickets.length ? tickets.slice(0, 30).map(t => <li key={t.id}><b>{t.event?.name ?? "Event"}</b><small>#{t.order_ref} · {money(t.price_paid, "GBP", { cents: true })}</small><Status value={t.status} dot={false} /></li>)
      : <li className="aa-empty">No tickets held.</li>}</ul>}

    <div className="aa-drawer-actions">
      <SectionHead title="Actions" />
      <div className="row" style={{ "--n": 2 } as CSSProperties}>
        <Link className="ws-btn outline" href={`${base}/${id}`}><UserRound aria-hidden="true" />Open full profile</Link>
        {identity?.email ? <a className="ws-btn outline" href={`mailto:${identity.email}`}><Mail aria-hidden="true" />Send message</a> : <span />}
        {!self && (restricted
          ? <ActionButton action={setUserStatus} args={[id, "active"]} reason variant="outline" confirm={{ title: `Reactivate ${nm}?`, body: "They will be able to sign in, book and buy tickets again.", cta: "Reactivate" }}><CircleCheck aria-hidden="true" />Reactivate user</ActionButton>
          : <ActionButton action={setUserStatus} args={[id, "restricted"]} reason variant="danger" confirm={{ title: `Restrict ${nm}?`, body: "They will be blocked from transacting. Existing tickets stay valid. The decision is appealable.", cta: "Restrict user" }}><Ban aria-hidden="true" />Restrict user</ActionButton>)}
        <AdminMenu label="More actions" className="ws-btn outline aa-more" trigger={<>More actions</>} entries={[
          { kind: "link", label: "View full activity", href: `${base}/${id}?tab=activity` },
          { kind: "link", label: "Access & sessions", href: `${base}/${id}?tab=access` }]} />
      </div>
    </div>
  </aside>;
}
