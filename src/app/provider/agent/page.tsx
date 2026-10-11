import type { Metadata } from "next";
import Link from "next/link";
import { Settings2, ChevronDown, Wrench, CalendarRange, Map as MapIcon, Package, FileText, ClipboardList, Users, Truck, Wallet, Star, ArrowRight, ChevronRight, MessageSquareReply, Percent,
  FileCheck2, Timer, CalendarCheck, Lightbulb, CalendarX2, LineChart, TrendingUp, UserCog, Calendar, BellRing, CircleCheck, Sparkles, ShieldAlert } from "lucide-react";
import "@/styles/provider-venue-setup.css";
import "@/styles/provider-team.css";
import "@/styles/provider-agent.css";
import { Chip, Empty } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { money, relative, time, day, requestTime, titleCase } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceItems, workspaceJobs, workspaceListings, reliability } from "@/lib/provider/queries";
import { MenuButton } from "../_components/menu-button";
import { AgentChat } from "./chat";
import { decideApproval, toggleRoutine, controlRun, startRun } from "./actions";

export const metadata: Metadata = { title: "Gala Agent" };
type Run = { id: string; goal: string; status: string; progress: number; scope: string[]; waiting_reason: string; result: string | null; created_at: string; updated_at: string; finished_at: string | null; routine_id: string | null; errors: { message: string }[] | null };
type Approval = { id: string; run_id: string | null; title: string; detail: string; action: string; payload: Record<string, string>; impact: string; amount: number | null; status: string; created_at: string; expires_at: string | null; result: string | null; executed_at: string | null };
type Routine = { id: string; title: string; detail: string; schedule: string; enabled: boolean; next_run_at: string | null; last_run_at: string | null; last_result: string | null; approval_policy: string };
const TOOLS: [string, string, typeof Wrench][] = [["", "All tools", Wrench], ["availability", "Availability", CalendarRange], ["spaces", "Spaces & Map", MapIcon], ["packages", "Packages", Package], ["quotes", "Quotes", FileText],
  ["bookings", "Bookings & BEO", ClipboardList], ["team", "Staffing", Users], ["holds", "Travel & Logistics", Truck], ["money", "Settlement", Wallet], ["reliability", "Reviews", Star]];
const ACTIVE = ["queued", "planning", "running", "waiting_external", "waiting_approval", "scheduled", "paused"];
const ICON: Record<string, typeof Wrench> = { "availability.block": CalendarX2, "listing.pause": ShieldAlert, "listing.unpause": CircleCheck, "hold.release": Timer, "message.reply": MessageSquareReply, "quote.review": FileText };

export default async function AgentPage(props: PageProps<"/provider/agent">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const tab = ["work", "approvals", "routines", "history"].includes(str("tab")) ? str("tab") : "work", tool = str("tool");
  const [ctx, items, jobs, listings] = await Promise.all([getProvider(), workspaceItems(), workspaceJobs(), workspaceListings()]);
  const ws = ctx.workspace.id;
  const [runs, approvals, routines] = await Promise.all([
    rows<Run>(ctx.db.from("agent_runs").select("id,goal,status,progress,scope,waiting_reason,result,created_at,updated_at,finished_at,routine_id,errors").eq("workspace_id", ws).eq("surface", "provider").order("updated_at", { ascending: false }).limit(60)),
    rows<Approval>(ctx.db.from("agent_approvals").select("id,run_id,title,detail,action,payload,impact,amount,status,created_at,expires_at,result,executed_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(60)),
    rows<Routine>(ctx.db.from("agent_routines").select("id,title,detail,schedule,enabled,next_run_at,last_run_at,last_result,approval_policy").eq("workspace_id", ws).order("created_at")),
  ]);
  const now = requestTime(), D = 864e5;
  const pending = approvals.filter(a => a.status === "pending" && (!a.expires_at || new Date(a.expires_at).getTime() > now));
  const active = runs.filter(r => ACTIVE.includes(r.status) && (!tool || (r.scope ?? []).includes(tool)));
  const rel = reliability(items, jobs, now);
  const recentItems = items.filter(i => new Date(i.updated_at).getTime() > now - 30 * D);
  const handled = recentItems.filter(i => !["sent", "awaiting"].includes(i.status)).length;
  const quoted = items.filter(i => i.quote && Object.keys(i.quote).length), converted = quoted.filter(i => ["confirmed", "held", "fulfilled"].includes(i.status)).length;
  // Avg response: answered requests in the last 30 days, time from creation to first provider action (outliers over 7 days excluded).
  const respH = (() => { const r = recentItems.filter(i => !["sent", "awaiting", "expired"].includes(i.status)).map(i => (new Date(i.updated_at).getTime() - new Date(i.created_at).getTime()) / 36e5).filter(h => h >= 0 && h <= 168);
    return r.length ? r.reduce((a, h) => a + h, 0) / r.length : null; })();
  const upcoming = [...pending.slice(0, 2).map(a => ({ k: a.id, icon: ICON[a.action] ?? FileCheck2, title: a.title, when: `Waiting since ${relative(a.created_at, now)}`, href: "/provider/agent?tab=approvals" })),
    ...routines.filter(r => r.enabled && r.next_run_at).sort((a, b) => a.next_run_at!.localeCompare(b.next_run_at!)).slice(0, 4).map(r => ({ k: r.id, icon: Calendar, title: r.title, when: `${day(r.next_run_at, { weekday: "short", day: "numeric", month: "short" })}, ${time(r.next_run_at)}`, href: "/provider/agent?tab=routines" }))].slice(0, 4);
  const weekendDemand = items.filter(i => i.event?.starts_at && [0, 5, 6].includes(new Date(i.event.starts_at).getUTCDay())).length;
  const midweekFree = (() => { let n = 0; for (let k = 1; k <= 28; k++) { const d = new Date(now + k * D); if ([2, 3].includes(d.getUTCDay()) && !jobs.some(j => j.starts_at.slice(0, 10) === d.toISOString().slice(0, 10))) n++; } return n; })();
  const pkgConv = items.filter(i => i.package).length;
  const insights = [
    { t: weekendDemand >= 3 ? "High weekend demand" : "Weekend demand", d: `${weekendDemand} open or recent request${weekendDemand === 1 ? " is" : "s are"} for Fri–Sun dates.`, cta: "Review pricing", goal: "Review my weekend pricing against recent demand and suggest changes" },
    { t: "Underutilised weekday slots", d: `${midweekFree} Tuesday/Wednesday dates in the next 4 weeks have no bookings.`, cta: "Review calendar", href: "/provider/calendar?view=month" },
    { t: "Packages drive requests", d: `${pkgConv} request${pkgConv === 1 ? "" : "s"} named one of your packages.`, cta: "Create more packages", href: "/provider/packages/new?step=1" },
  ];
  const statusChip = (r: Run) => r.status === "waiting_approval" ? <Chip tone="amber" dot>Needs approval</Chip> : r.status === "waiting_external" ? <Chip tone="grey" dot>{r.waiting_reason || "Waiting"}</Chip>
    : r.status === "paused" ? <Chip tone="grey" dot>Paused</Chip> : r.progress >= 85 ? <Chip tone="green" dot>Almost done</Chip> : r.status === "queued" ? <Chip tone="blue" dot>Queued</Chip> : <Chip tone="blue" dot>In progress</Chip>;
  const rIcon = (r: Run) => /respon|enquir/i.test(r.goal) ? MessageSquareReply : /confirm|pre-event|remind/i.test(r.goal) ? BellRing : /availab|calendar/i.test(r.goal) ? CalendarCheck : /staff|supplier|team/i.test(r.goal) ? Users : Sparkles;
  const base = "/provider/agent";

  return <div className="pa">
    <header className="ws-page-head pa-head"><div><h1>Gala Agent</h1><p>Your AI teammate for commercial response, planning and delivery.</p></div>
      <div className="ws-page-actions"><span className={`pa-state${routines.some(r => r.enabled) ? "" : " off"}`}><i />{routines.some(r => r.enabled) ? "Agent active" : "Agent idle"}</span>
        <MenuButton label="Configure" className="ws-btn outline pa-config" trigger={<><Settings2 aria-hidden="true" />Configure<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Routines", href: `${base}?tab=routines` }, { kind: "link", label: "Approval history", href: `${base}?tab=history` }, { kind: "link", label: "Workspace settings", href: "/provider/settings" }]} /></div></header>
    <nav className="ws-tabs underline pa-tabs" aria-label="Sections">{([["work", "Work"], ["approvals", "Approvals"], ["routines", "Routines"], ["history", "History"]] as const).map(([k, l]) =>
      <Link key={k} href={k === "work" ? base : `${base}?tab=${k}`} className={tab === k ? "active" : ""} aria-current={tab === k ? "page" : undefined}>{l}{k === "approvals" && pending.length > 0 && <b className="pa-count">{pending.length}</b>}</Link>)}</nav>

    {tab === "work" && <>
      <nav className="pa-tools" aria-label="Filter by tool">{TOOLS.map(([k, l, I]) => <Link key={l} href={k ? `${base}?tool=${k}` : base} className={tool === k ? "on" : ""}><I aria-hidden="true" />{l}</Link>)}</nav>
      <div className="pa-grid">
        <AgentChat initialGoal={str("goal")} />
        <div className="pa-mid">
          <section className="ws-panel pa-runs"><div className="ws-panel-head"><h2>Active runs</h2><Link className="ws-link" href={`${base}?tab=history`}>View all <ArrowRight aria-hidden="true" /></Link></div>
            {active.length ? <ul>{active.slice(0, 4).map(r => { const I = rIcon(r); return <li key={r.id}><span className="pa-ric"><I aria-hidden="true" /></span>
              <span className="pa-rtxt"><b>{r.goal.split(":")[0].slice(0, 60)}</b><small>{r.waiting_reason || r.goal.split(":").slice(1).join(":").trim().slice(0, 70) || "Working…"}</small><span className="pa-bar"><i style={{ width: `${r.progress}%` }} /></span></span>
              <span className="pa-rmeta">{statusChip(r)}<small>{r.progress}%</small><small>Started {time(r.created_at)}</small></span>
              {r.status === "paused" ? <ActionButton action={controlRun} args={[r.id, "resume"]} variant="ghost">Resume</ActionButton> : <ActionButton action={controlRun} args={[r.id, "pause"]} variant="ghost">Pause</ActionButton>}</li>; })}</ul>
              : <Empty icon={Sparkles} title="No active runs" text="Start one from the chat or a quick tool below." />}</section>
          <section className="ws-panel pa-appr"><div className="ws-panel-head"><h2>Needs your approval {pending.length > 0 && <b className="pa-count">{pending.length}</b>}</h2><Link className="ws-link" href={`${base}?tab=approvals`}>View all <ArrowRight aria-hidden="true" /></Link></div>
            {pending.length ? <ul>{pending.slice(0, 3).map(a => { const I = ICON[a.action] ?? FileCheck2; return <li key={a.id}><span className="pa-aic"><I aria-hidden="true" /></span><span className="pa-rtxt"><b>{a.title}</b><small>{a.detail.slice(0, 80)}</small><small>{relative(a.created_at, now)}</small></span>
              <b className="pa-amt">{a.amount ? money(a.amount) : a.impact.slice(0, 18)}</b><span className="pa-acts"><ActionButton action={decideApproval} args={[a.id, true]} variant="outline">Approve</ActionButton><ActionButton action={decideApproval} args={[a.id, false]} variant="ghost">Decline</ActionButton></span></li>; })}</ul>
              : <p className="pv-none"><CircleCheck aria-hidden="true" /> Nothing waiting — Gala Agent never changes your data without approval.</p>}</section>
        </div>
        <div className="pa-side">
          <section className="ws-panel pa-perf"><h2>Agent performance <small>(last 30 days)</small></h2><div>
            <div><span className="ic b"><MessageSquareReply aria-hidden="true" /></span><b>{handled}</b><small>Enquiries handled</small></div>
            <div><span className="ic g"><Percent aria-hidden="true" /></span><b>{rel.responseRate}%</b><small>Response within SLA</small></div>
            <div><span className="ic g"><FileCheck2 aria-hidden="true" /></span><b>{converted}</b><small>Quotes converted</small></div>
            <div><span className="ic p"><Timer aria-hidden="true" /></span><b>{respH === null ? "—" : `${respH.toFixed(1)} hrs`}</b><small>Avg response time</small></div></div></section>
          <section className="ws-panel pa-next"><div className="ws-panel-head"><h2>Upcoming agent actions</h2><Link className="ws-link" href={`${base}?tab=routines`}>View all <ArrowRight aria-hidden="true" /></Link></div>
            <ul>{upcoming.map(u => <li key={u.k}><Link href={u.href}><span className="ic"><u.icon aria-hidden="true" /></span><span><b>{u.title}</b><small>{u.when}</small></span><ChevronRight aria-hidden="true" /></Link></li>)}{!upcoming.length && <li className="pv-none">Nothing scheduled.</li>}</ul></section>
          <section className="ws-panel pa-rout"><div className="ws-panel-head"><h2>Configured routines</h2><Link className="ws-link" href={`${base}?tab=routines`}>View all <ArrowRight aria-hidden="true" /></Link></div>
            <ul>{routines.slice(0, 4).map(r => <li key={r.id}><span className="ic"><CalendarCheck aria-hidden="true" /></span><span><b>{r.title}</b><small>{r.detail.slice(0, 50)}</small></span>
              <ActionButton action={toggleRoutine} args={[r.id, !r.enabled]} variant="ghost" className={`pa-sw${r.enabled ? " on" : ""}`}><i aria-hidden="true" /><span className="sr-only">{r.enabled ? "Turn off" : "Turn on"}</span></ActionButton></li>)}</ul></section>
        </div>
      </div>
      <div className="pa-bottom">
        <section className="ws-panel pa-quick"><h2>Quick tools</h2><ul>{([[CalendarCheck, "Check availability", "Check availability across my spaces for the next 4 weeks and flag conflicts"], [FileText, "Create quote", "Draft quotes for open requests that ask for one"],
          [CalendarX2, "Block availability", "Suggest dates I should block for maintenance based on my calendar"], [LineChart, "Optimise pricing", "Review my pricing against recent demand and suggest changes"], [UserCog, "Plan staffing", "Check staffing for bookings in the next 2 weeks and flag gaps"],
          [ClipboardList, "Generate BEO", "List bookings in the next 14 days missing BEO details"], [TrendingUp, "Review performance", "Summarise my performance this month: enquiries, response, conversions, revenue"]] as const).map(([I, l, goal]) =>
          <li key={l}><ActionButton action={startRun} args={[goal]} variant="ghost" className="pa-tool"><I aria-hidden="true" /><span>{l}</span></ActionButton></li>)}
          <li><Link href="/provider/calendar" className="pa-tool"><Calendar aria-hidden="true" /><span>Open calendar</span></Link></li></ul></section>
        <section className="ws-panel pa-ins"><div className="ws-panel-head"><h2><Lightbulb aria-hidden="true" />Agent insights<small>Based on your data</small></h2></div>
          <ul>{insights.map(i => <li key={i.t}><b>{i.t}</b><p>{i.d}</p>{i.goal ? <ActionButton action={startRun} args={[i.goal]} variant="outline">{i.cta}</ActionButton> : <Link className="ws-btn outline sm" href={i.href!}>{i.cta}</Link>}</li>)}</ul></section>
      </div>
    </>}

    {tab === "approvals" && <section className="ws-panel pa-list"><h2>Approvals</h2><p className="pa-sub">Gala Agent only proposes. Approving runs the action with your permissions; declining changes nothing.</p>
      <table className="ws-table"><thead><tr><th>Proposal</th><th>Action</th><th>Impact</th><th>Created</th><th>Status</th><th aria-label="Decide" /></tr></thead>
        <tbody>{approvals.map(a => <tr key={a.id}><td><b>{a.title}</b><small className="pa-d">{a.detail}</small></td><td>{titleCase(a.action.replace(".", " "))}</td><td>{a.amount ? money(a.amount) : a.impact}</td><td>{relative(a.created_at, now)}</td>
          <td>{a.status === "pending" ? <Chip tone="amber" dot>Pending</Chip> : a.status === "approved" ? <Chip tone="green" dot>{a.result ?? "Approved"}</Chip> : <Chip tone="grey" dot>{titleCase(a.status)}</Chip>}</td>
          <td>{a.status === "pending" && <span className="pa-acts"><ActionButton action={decideApproval} args={[a.id, true]} variant="primary">Approve</ActionButton><ActionButton action={decideApproval} args={[a.id, false]} variant="ghost">Decline</ActionButton></span>}</td></tr>)}</tbody></table>
      {!approvals.length && <Empty icon={FileCheck2} title="No proposals yet" text="Ask Gala Agent in the chat — anything it suggests appears here for approval." />}</section>}

    {tab === "routines" && <section className="ws-panel pa-list"><h2>Routines</h2><p className="pa-sub">Routines create agent runs on schedule. Runs only read your data and propose actions for approval.</p>
      <table className="ws-table"><thead><tr><th>Routine</th><th>Schedule</th><th>Next run</th><th>Last run</th><th>Approval</th><th>On</th></tr></thead>
        <tbody>{routines.map(r => <tr key={r.id}><td><b>{r.title}</b><small className="pa-d">{r.detail}</small></td><td>{r.schedule}</td><td>{r.enabled && r.next_run_at ? `${day(r.next_run_at, { day: "numeric", month: "short" })}, ${time(r.next_run_at)}` : "—"}</td>
          <td>{r.last_run_at ? relative(r.last_run_at, now) : "Never"}{r.last_result ? <small className="pa-d">{r.last_result}</small> : null}</td><td>{titleCase(r.approval_policy ?? "required")}</td>
          <td><ActionButton action={toggleRoutine} args={[r.id, !r.enabled]} variant="ghost" className={`pa-sw${r.enabled ? " on" : ""}`}><i aria-hidden="true" /><span className="sr-only">{r.enabled ? "Turn off" : "Turn on"}</span></ActionButton></td></tr>)}</tbody></table></section>}

    {tab === "history" && <section className="ws-panel pa-list"><h2>Run history</h2>
      <table className="ws-table"><thead><tr><th>Goal</th><th>Status</th><th>Result</th><th>Started</th><th aria-label="Controls" /></tr></thead>
        <tbody>{runs.map(r => <tr key={r.id}><td><b>{r.goal.slice(0, 80)}</b>{r.routine_id && <small className="pa-d">From a routine</small>}</td><td>{statusChip(r)}</td>
          <td><small className="pa-d">{r.status === "failed" ? (r.errors?.[0]?.message ?? "Failed") : (r.result ?? r.waiting_reason ?? "").slice(0, 140) || "—"}</small></td><td>{relative(r.created_at, now)}</td>
          <td>{ACTIVE.includes(r.status) && <ActionButton action={controlRun} args={[r.id, "cancel"]} variant="ghost" confirm={{ title: "Cancel this run?", body: "Any proposals it made that are still pending will expire.", cta: "Cancel run" }}>Cancel</ActionButton>}</td></tr>)}</tbody></table>
      {!runs.length && <Empty icon={Sparkles} title="No runs yet" />}</section>}
    {listings.length === 0 && <p className="pv-none">Add a listing so Gala Agent has something to work with.</p>}
  </div>;
}
