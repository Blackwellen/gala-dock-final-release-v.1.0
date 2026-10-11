import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users, CalendarDays, Store, TriangleAlert, Download, Filter, Pencil, ExternalLink, Headphones, Ban, CircleCheck, CalendarPlus, Ticket, ArrowUpCircle, PoundSterling, Activity } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-workspaces.css";
import { Kpi, Avatar, Thumb, Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { AdminMenu, ParamSelect, SearchBox, SelectAll } from "../_a/client";
import { Pager, PillTabs, Status, DrawerClose, SectionHead, KVRows, MiniStat, TimelineItem } from "../_a/ui";
import { shortRef, str, pageOf, qs, rpc, planLabel, type SP } from "../_a/lib";
import { health, loadMetrics, loadOwners, loadPlans, commissionTier, WS_COLS, type Ws, type WsMetric, type Owner, type Plans } from "../_a/workspaces";
import { setWorkspaceStatus } from "../_a/actions";

export const metadata: Metadata = { title: "Workspaces" };

const F = {
  plan: [{ value: "", label: "All plans" }, { value: "starter", label: "Starter" }, { value: "pro", label: "Pro" }, { value: "business", label: "Business" }, { value: "enterprise", label: "Enterprise" }],
  ver: [{ value: "", label: "All statuses" }, { value: "verified", label: "Verified" }, { value: "pending", label: "Pending" }, { value: "unverified", label: "Unverified" }, { value: "rejected", label: "Rejected" }],
  tier: [{ value: "", label: "All tiers" }, { value: "low", label: "Up to 8%" }, { value: "mid", label: "8% – 12%" }, { value: "high", label: "Over 12%" }],
  gmv: [{ value: "", label: "Any" }, { value: "none", label: "No GMV" }, { value: "s", label: "Under £10k" }, { value: "m", label: "£10k – £50k" }, { value: "l", label: "Over £50k" }],
  health: [{ value: "", label: "All statuses" }, { value: "healthy", label: "Healthy" }, { value: "review", label: "Review" }, { value: "at_risk", label: "At risk" }, { value: "suspended", label: "Suspended" }],
  created: [{ value: "", label: "Any date" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last 12 months" }],
};

export default async function WorkspacesPage(props: PageProps<"/admin/workspaces">) {
  const ctx = await requireAdminPermission("workspaces");
  if (!ctx.allowed) return <Restricted area="Workspaces" />;
  const sp = (await props.searchParams) as SP;
  const { db, permissions } = ctx;
  const now = requestTime();
  const kind = ["organizer", "provider", "suspended"].includes(str(sp, "filter")) ? str(sp, "filter") : "all";
  const q = str(sp, "q").trim().toLowerCase().slice(0, 80);
  const { per, page, offset } = pageOf(sp);

  const [all, metrics, overview, { plans }] = await Promise.all([
    rows<Ws>(db.from("workspaces").select(WS_COLS).order("created_at").limit(5000)),
    loadMetrics(db, 30),
    rpc<{ workspaces: { series: number[]; active_prev: number; organizer_prev: number; provider_prev: number } }>(db, "admin_overview", { p_days: 30 }),
    loadPlans(db),
  ]);
  const owners = await loadOwners(db, all.map(w => w.owner_id), permissions.has("users") || permissions.has("support"));
  const filtered = all.filter(w => {
    const m = metrics.get(w.id), h = health(w, m).key, gmv = m?.gmv ?? 0, f = (k: string) => str(sp, k);
    if (kind === "suspended" ? w.status !== "suspended" : kind !== "all" && w.kind !== kind) return false;
    if (q && !`${w.name} ${w.settings?.reference ?? ""} ${w.id} ${owners.get(w.owner_id)?.full_name ?? ""}`.toLowerCase().includes(q)) return false;
    if (f("plan") && w.plan !== f("plan")) return false;
    if (f("ver") && w.verification_status !== f("ver")) return false;
    if (f("tier") && !(f("tier") === "low" ? w.commission_bps <= 800 : f("tier") === "mid" ? w.commission_bps > 800 && w.commission_bps <= 1200 : w.commission_bps > 1200)) return false;
    if (f("gmv") && !(f("gmv") === "none" ? gmv === 0 : f("gmv") === "s" ? gmv > 0 && gmv < 10000 : f("gmv") === "m" ? gmv >= 10000 && gmv <= 50000 : gmv > 50000)) return false;
    if (f("health") && h !== f("health")) return false;
    if (f("created") && new Date(w.created_at).getTime() < now - Number(f("created")) * 864e5) return false;
    return true;
  });
  const list = filtered.slice(offset, offset + per);
  const selId = str(sp, "sel") === "none" ? null : isUuid(str(sp, "sel")) ? str(sp, "sel") : list[0]?.id ?? null;
  const sel = all.find(w => w.id === selId);
  const count = (k: string) => all.filter(w => (k === "suspended" ? w.status === "suspended" : w.kind === k)).length;
  const base = "/admin/workspaces";
  const ov = overview.workspaces;

  return <div className="aa aw">
    <header className="ws-page-head">
      <div><h1>Workspaces</h1><p>Manage organizer and provider workspaces across the Gala Dock platform.</p></div>
      <div className="aa-head-actions">
        <a className="ws-btn outline" href={qs(`${base}/export`, sp, { page: null, sel: null, per: null })}><Download aria-hidden="true" />Export</a>
      </div>
    </header>

    <section className="aa-kpis aw-kpis" aria-label="Workspace metrics">
      <Kpi icon={Users} tone="blue" label="Total Workspaces" value={all.length.toLocaleString("en-GB")} delta={delta(all.length, ov.organizer_prev + ov.provider_prev)} deltaSuffix="vs last 30 days" series={ov.series} />
      <Kpi icon={CalendarDays} tone="purple" label="Organizer Workspaces" value={count("organizer").toLocaleString("en-GB")} delta={delta(count("organizer"), ov.organizer_prev)} deltaSuffix="vs last 30 days" />
      <Kpi icon={Store} tone="green" label="Provider Workspaces" value={count("provider").toLocaleString("en-GB")} delta={delta(count("provider"), ov.provider_prev)} deltaSuffix="vs last 30 days" />
      <Kpi icon={TriangleAlert} tone="red" label="Suspended Workspaces" value={count("suspended").toLocaleString("en-GB")} delta={null} />
    </section>

    <div className="aa-split">
      <div className="aa-listcol">
        <div className="aa-bar"><PillTabs base={base} sp={sp} active={kind} tabs={[{ key: "all", label: "All Workspaces", count: all.length }, { key: "organizer", label: "Organizer", count: count("organizer") },
          { key: "provider", label: "Provider", count: count("provider") }, { key: "suspended", label: "Suspended", count: count("suspended"), tone: "red" }]} /></div>
        <div className="aa-bar">
          <Suspense><SearchBox placeholder="Search by name, owner, workspace ID..." /></Suspense>
          <Link className="ws-btn outline aa-filters-btn" href={qs(base, {}, { filter: kind === "all" ? null : kind })}><Filter aria-hidden="true" />Clear filters</Link>
        </div>
        <Suspense><div className="aa-filters aw-filters">
          <label>Plan<ParamSelect param="plan" label="Plan" value={str(sp, "plan")} options={F.plan} /></label>
          <label>Verification<ParamSelect param="ver" label="Verification" value={str(sp, "ver")} options={F.ver} /></label>
          <label>Commission tier<ParamSelect param="tier" label="Commission tier" value={str(sp, "tier")} options={F.tier} /></label>
          <label>Revenue (GMV)<ParamSelect param="gmv" label="Revenue" value={str(sp, "gmv")} options={F.gmv} /></label>
          <label>Health<ParamSelect param="health" label="Health" value={str(sp, "health")} options={F.health} /></label>
          <label>Created date<ParamSelect param="created" label="Created date" value={str(sp, "created")} options={F.created} /></label>
        </div></Suspense>

        <form className="aa-table-form" action={`${base}/export`} method="get">
          <div className="aa-table-card">
            <div className="aa-bulk"><span>Selected workspaces</span><button type="submit" className="ws-btn outline sm"><Download aria-hidden="true" />Export selected</button></div>
            <div className="aa-table-scroll"><table className="aa-table aw-table">
              <colgroup><col style={{ width: 26 }} /><col style={{ width: 128 }} /><col style={{ width: 70 }} /><col style={{ width: 60 }} /><col style={{ width: 110 }} /><col style={{ width: 82 }} /><col style={{ width: 72 }} /><col style={{ width: 66 }} /><col style={{ width: 60 }} /><col style={{ width: 76 }} /><col style={{ width: 80 }} /><col style={{ width: 46 }} /></colgroup>
              <thead><tr><th className="ck"><SelectAll /></th><th>Workspace</th><th>Type</th><th>Plan</th><th>Owner</th><th>Verification</th><th>GMV (30d)</th><th>Tickets (30d)</th><th>Commission</th><th>Health</th><th>Last activity</th><th className="act">Actions</th></tr></thead>
              <tbody>{list.map(w => {
                const m = metrics.get(w.id), h = health(w, m), o = owners.get(w.owner_id);
                return <tr key={w.id} className={w.id === selId ? "sel" : ""}>
                  <td className="ck"><input type="checkbox" name="id" value={w.id} aria-label={`Select ${w.name}`} /></td>
                  <td><Link className="aa-who" href={qs(base, sp, { sel: w.id })} scroll={false}><Thumb src={w.cover_image || null} w={30} h={30} /><div><b>{w.name}{w.settings?.demo === true || w.settings?.demo === "true" ? <span className="aa-demo">Demo</span> : null}</b><small>{shortRef("ORG", w.id, w.settings?.reference)}</small></div></Link></td>
                  <td><span className={`aa-chip ${w.kind === "organizer" ? "pink" : ""}`}>{titleCase(w.kind)}</span></td>
                  <td>{planLabel(w.plan)}</td>
                  <td>{o ? <span className="aa-who"><Avatar src={o.avatar_url} name={o.full_name} size={24} /><span className="nm">{o.full_name}</span></span> : <span className="aa-muted">—</span>}</td>
                  <td><Status value={w.verification_status} /></td>
                  <td>{money(m?.gmv ?? 0)}</td>
                  <td>{(m?.tickets ?? 0).toLocaleString("en-GB")}</td>
                  <td>{w.commission_bps / 100}%</td>
                  <td><Status value={h.key} label={h.label} /></td>
                  <td>{relative(m?.last_activity, now)}</td>
                  <td className="act"><AdminMenu label={`Actions for ${w.name}`} entries={[
                    { kind: "link", label: "Open workspace", href: `${base}/${w.id}` },
                    ...(o ? [{ kind: "link" as const, label: "View owner", href: `/admin/users/${o.id}` }] : []),
                    w.status === "suspended"
                      ? { kind: "action", label: "Reinstate workspace", action: setWorkspaceStatus, args: [w.id, "active"], reason: true, confirm: { title: `Reinstate ${w.name}?`, body: "Members regain access immediately.", cta: "Reinstate" } }
                      : { kind: "action", label: "Suspend workspace", action: setWorkspaceStatus, args: [w.id, "suspended"], reason: true, danger: true, confirm: { title: `Suspend ${w.name}?`, body: "All members lose access and live listings stop taking bookings until reinstated. The owner can appeal.", cta: "Suspend workspace" } }]} /></td>
                </tr>;
              })}
              {!list.length && <tr><td colSpan={12}><div className="aa-empty">No workspaces match these filters.</div></td></tr>}</tbody>
            </table></div>
          </div>
        </form>
        <Pager base={base} sp={sp} page={page} per={per} total={filtered.length} />
      </div>

      {sel ? <Suspense fallback={<aside className="aa-drawer" aria-busy="true" />}><WorkspaceDrawer w={sel} m={metrics.get(sel.id)} owner={owners.get(sel.owner_id)} sp={sp} plans={plans} canAudit={permissions.has("audit")} canSupport={permissions.has("support")} /></Suspense>
        : <aside className="aa-drawer"><p className="aa-empty">Select a workspace to see its details and performance.</p></aside>}
    </div>
  </div>;
}

async function WorkspaceDrawer({ w, m, owner, sp, plans, canAudit, canSupport }: { w: Ws; m?: WsMetric; owner?: Owner; sp: SP; plans: Plans; canAudit: boolean; canSupport: boolean }) {
  const { db } = await requireAdminPermission("workspaces");
  const now = requestTime();
  const [daily, audit] = await Promise.all([
    rpc<{ day: string; tickets: number; services: number; other: number; ticket_count: number }[]>(db, "admin_workspace_daily", { p_ws: w.id, p_days: 30 }),
    canAudit ? rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string; actor_id: string | null }>(
      db.from("audit_events").select("id,event,metadata,created_at,actor_id").eq("workspace_id", w.id).order("created_at", { ascending: false }).limit(4)) : Promise.resolve([]),
  ]);
  const gmvSeries = daily.map(d => Number(d.tickets) + Number(d.services) + Number(d.other)), tkSeries = daily.map(d => Number(d.ticket_count));
  const fee = (m?.gmv ?? 0) * w.commission_bps / 10000, feePrev = (m?.gmv_prev ?? 0) * w.commission_bps / 10000;
  const h = health(w, m), base = "/admin/workspaces", detail = `${base}/${w.id}`;
  const icon = (e: string) => e.includes("event") ? CalendarPlus : e.includes("ticket") || e.includes("order") ? Ticket : e.includes("plan") ? ArrowUpCircle : e.includes("payout") ? PoundSterling : Activity;

  return <aside className="aa-drawer aw-drawer" aria-label={`${w.name} details`}>
    <div className="aa-drawer-head"><Thumb src={w.cover_image || null} w={76} h={52} /><div><h2>{w.name} <Status value={w.status === "suspended" ? "suspended" : "active"} label={w.status === "suspended" ? "Suspended" : "Active"} /></h2>
      <small>{shortRef("ORG", w.id, w.settings?.reference)}</small></div><DrawerClose href={qs(base, sp, { sel: "none" })} /></div>
    <nav className="aa-dtabs aw-dtabs" aria-label="Workspace sections">
      <span className="t on">Overview</span><Link href={`${detail}?tab=activity`}>Events</Link><Link href={`${detail}?tab=commerce`}>Tickets</Link><Link href={`${detail}?tab=commerce`}>Commerce</Link><Link href={`${detail}?tab=access`}>Team</Link>
      <AdminMenu label="More workspace actions" entries={[{ kind: "link", label: "Open workspace", href: detail }, { kind: "link", label: "Export (CSV)", href: `${base}/export?id=${w.id}` }]} />
    </nav>
    <section className="aw-details">
      <SectionHead title="Workspace details"><Link className="aa-edit" href={detail}><Pencil aria-hidden="true" />Edit</Link></SectionHead>
      <KVRows rows={[
        ["Name", w.name], ["Type", <span key="t" className={`aa-chip ${w.kind === "organizer" ? "pink" : ""}`}>{titleCase(w.kind)}</span>],
        ["Plan", <span key="p" className="aa-blue">{planLabel(w.plan)}{plans[w.plan] ? ` (${money(plans[w.plan]!.monthly)}/month)` : ""}</span>],
        ["Owner", owner ? <span className="aa-who aw-owner"><Avatar src={owner.avatar_url} name={owner.full_name} size={28} /><span><b>{owner.full_name}</b><small>{shortRef("USR", owner.id)}</small></span></span> : "—",
          owner ? <Link className="ws-btn outline sm" href={`/admin/users/${owner.id}`}>View user</Link> : undefined],
        ["Created", day(w.created_at, { day: "numeric", month: "short", year: "numeric" })],
        ["Verification", <Status key="v" value={w.verification_status} />],
        ["Commission tier", commissionTier(w.commission_bps, w.plan, plans)],
        ["Status", <Status key="s" value={h.key === "suspended" ? "suspended" : "active"} label={h.key === "suspended" ? "Suspended" : "Active"} />],
      ]} />
    </section>
    <section>
      <SectionHead title={<>Performance <span>(last 30 days)</span></>} href={detail} label="View analytics" />
      <div className="aa-minis">
        <MiniStat value={money(m?.gmv ?? 0)} label="GMV" delta={delta(m?.gmv ?? 0, m?.gmv_prev ?? 0)} series={gmvSeries} tone="blue" />
        <MiniStat value={(m?.tickets ?? 0).toLocaleString("en-GB")} label="Tickets" delta={delta(m?.tickets ?? 0, m?.tickets_prev ?? 0)} series={tkSeries} tone="purple" />
        <MiniStat value={money(fee)} label="Platform revenue" delta={delta(fee, feePrev)} series={gmvSeries.map(v => v * w.commission_bps / 10000)} tone="green" />
        <MiniStat value={(m?.services_booked ?? 0).toLocaleString("en-GB")} label={w.kind === "organizer" ? "Services booked" : "Jobs booked"} delta={delta(m?.services_booked ?? 0, m?.services_prev ?? 0)} tone="orange"
          series={daily.map(d => Number(d.services))} />
      </div>
    </section>
    <section>
      <SectionHead title="Recent activity" href={canAudit ? `${detail}?tab=activity` : undefined} />
      {!canAudit ? <p className="aa-empty">Activity needs the Audit permission.</p> : audit.length ? <ul className="aa-tls aw-tls">{audit.map(a => <TimelineItem key={a.id} icon={icon(a.event)}
        title={`${titleCase(a.event.replace(/\./g, " "))}${a.metadata?.event ? `: ${a.metadata.event}` : ""}`} meta={relative(a.created_at, now)} />)}</ul> : <p className="aa-empty">No recorded activity.</p>}
    </section>
    <div className="aa-drawer-actions"><div className="row" style={{ ["--n" as string]: 3 }}>
      <Link className="ws-btn primary" href={detail}><ExternalLink aria-hidden="true" />Open workspace</Link>
      {canSupport ? <Link className="ws-btn outline" href={`/admin/support?q=${encodeURIComponent(w.name)}`}><Headphones aria-hidden="true" />Support</Link> : <span />}
      {w.status === "suspended"
        ? <ActionButton action={setWorkspaceStatus} args={[w.id, "active"]} reason variant="outline" confirm={{ title: `Reinstate ${w.name}?`, body: "Members regain access immediately.", cta: "Reinstate" }}><CircleCheck aria-hidden="true" />Reinstate</ActionButton>
        : <ActionButton action={setWorkspaceStatus} args={[w.id, "suspended"]} reason variant="danger" confirm={{ title: `Suspend ${w.name}?`, body: "All members lose access and live listings stop taking bookings until reinstated. The owner can appeal.", cta: "Suspend workspace" }}><Ban aria-hidden="true" />Suspend workspace</ActionButton>}
    </div></div>
  </aside>;
}
