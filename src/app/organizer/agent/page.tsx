import Link from "next/link";
import { Settings, ArrowRight, MoreVertical, CheckCircle2, Clock, Loader, BarChart3, CalendarDays, Mail, ClipboardCheck, FileText, Megaphone, Users, Search, Sparkles, XCircle } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, LinkTabs, Beta } from "@/components/kit";
import { AgentComposer, ApprovalButtons, RoutineToggle, NewRoutineButton, NewRunSplit } from "@/components/organizer/agent-client";
import { relative } from "@/lib/format";

export const metadata = { title: "Gala Agent" };
const ST: Record<string, [string, string]> = { completed: ["Completed", "green"], running: ["In progress", "blue"], planning: ["In progress", "blue"], waiting_approval: ["Waiting", "amber"], waiting_external: ["Waiting", "amber"], scheduled: ["Scheduled", "blue"], queued: ["Queued", "gray"], paused: ["Paused", "gray"], failed: ["Failed", "red"], cancelled: ["Cancelled", "gray"] };
const RI = [BarChart3, Mail, ClipboardCheck, BarChart3, CalendarDays];

export default async function AgentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase; const ws = ctx.workspace.id;
  const tab = ["approvals", "routines", "history"].includes(sp.tab ?? "") ? sp.tab! : "work";
  const status = sp.status ?? "";
  const [{ data: runs }, { data: approvals }, { data: routines }, { data: events }] = await Promise.all([
    sb.from("agent_runs").select("id,goal,status,progress,run_type,event_id,waiting_reason,next_wake_at,updated_at,created_at,result,plan,cost_cents").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(200),
    sb.from("agent_approvals").select("id,title,detail,action,amount,impact,status,event_id,created_at,payload").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
    sb.from("agent_routines").select("id,title,detail,schedule,enabled,last_run_at,last_result").eq("workspace_id", ws).order("created_at"),
    sb.from("events").select("id,name,cover_image,starts_at").eq("workspace_id", ws).neq("status", "archived").order("starts_at"),
  ]);
  const R = runs ?? []; const ev = (id: string | null) => (events ?? []).find(e => e.id === id);
  const active = R.filter(r => !["completed", "failed", "cancelled"].includes(r.status) || (r.status === "completed" && Date.parse(r.updated_at) > Date.now() - 2 * 864e5)).filter(r => !status || r.status === status);
  const history = R.filter(r => ["completed", "failed", "cancelled"].includes(r.status));
  const pending = (approvals ?? []).filter(a => a.status === "pending");
  const month = R.filter(r => Date.parse(r.created_at) > Date.now() - 30 * 864e5); const spend = month.reduce((s, r) => s + Number(r.cost_cents ?? 0), 0) / 100; const budget = 100;
  const nextEvent = (events ?? []).find(e => e.starts_at && Date.parse(e.starts_at) > Date.now());
  const suggestions = [[FileText, `Create a full event plan for ${nextEvent?.name ?? "your next event"}`, "red"], [Megaphone, "Draft and schedule a promotion campaign", "red"], [Search, "Find and shortlist 5 suitable suppliers", "purple"], [Users, "Build a staffing plan and check availability", "purple"], [BarChart3, "Analyse ticket sales and suggest next steps", "green"]] as const;
  const href = (p: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ tab: tab === "work" ? undefined : tab, status: sp.status, ...p })) if (v) u.set(k, v); return `/organizer/agent${u.size ? `?${u}` : ""}`; };
  const typeLabel: Record<string, string> = { plan: "Event planning", promotion: "Promotion", suppliers: "Suppliers", staffing: "Team", analysis: "Ticketing", compliance: "Venue" };

  const runRow = (r: typeof R[number]) => { const [sl, tone] = ST[r.status] ?? [r.status, "gray"]; const e = ev(r.event_id); const steps = (r.plan as { title?: string }[] | null) ?? []; return <li key={r.id} className="ag-run">
    {/* eslint-disable-next-line @next/next/no-img-element */}<img src={e?.cover_image || "/assets/gd/oe-neon.webp"} alt="" />
    <span className="ag-rt"><b>{r.goal}</b><small>{typeLabel[r.run_type] ?? r.run_type.replace(/_/g, " ")} · {e?.name ?? "Workspace"}</small></span>
    <span className="ag-rp"><small>Progress</small><span className="ag-pb"><span className="ag-bar"><i className={tone} style={{ width: `${r.progress}%` }} /></span>{r.progress}%</span></span>
    <span className="ag-rn"><small>Next steps</small><span>{r.status === "completed" ? (r.result || "Delivered") : r.waiting_reason || steps[Math.min(steps.length - 1, Math.floor((r.progress / 100) * steps.length))]?.title || "—"}</span></span>
    <span className="ag-rs"><small>{r.next_wake_at ? new Date(r.next_wake_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : relative(r.updated_at)}</small><span className={`ag-st ${tone}`}>{tone === "green" ? <CheckCircle2 size={11} /> : tone === "amber" ? <Clock size={11} /> : tone === "red" ? <XCircle size={11} /> : <Loader size={11} />}{sl}</span></span>
    <Link className="k-icon-btn ag-dots" href={r.event_id ? `/organizer/events/${r.event_id}` : href({ tab: "history" })} aria-label="Open"><MoreVertical size={15} /></Link></li>; };

  return <div className="ag">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Gala Agent" }]} />
    <div className="ag-head"><div className="k-grow"><div className="k-row" style={{ gap: 12 }}><h1>Gala Agent</h1><Beta /></div><p className="sub">Your professional event-management AI partner. Plan, take action and keep everything on track.</p></div>
      <div className="ag-tools"><div className="k-row" style={{ gap: 10 }}><Link className="k-btn outline" href="/organizer/settings?tab=agent"><Settings size={16} />Settings</Link><NewRunSplit events={(events ?? []).map(e => ({ id: e.id, name: e.name }))} /></div>
        <div className="k-card ag-usage"><Sparkles size={20} className="k-blue" /><span>AI usage</span><span className="k-grow"><b>£{spend.toFixed(2)} / £{budget}</b><span className="ag-bar"><i className="blue" style={{ width: `${Math.min(100, (spend / budget) * 100)}%` }} /></span></span><em>{Math.round((spend / budget) * 100)}%</em><Link className="k-btn outline sm" href={href({ tab: "history" })}>View details</Link></div></div></div>
    <LinkTabs current={tab} tabs={[["work", "Work"], ["approvals", `Approvals${pending.length ? ` (${pending.length})` : ""}`], ["routines", "Routines"], ["history", "History"]].map(([k, l]) => ({ key: k, label: l, href: href({ tab: k === "work" ? undefined : k, status: undefined }) }))} />
    {tab === "work" && <div className="ag-r1"><section className="k-card ag-c"><h2>Tell Gala Agent what you want to achieve</h2><AgentComposer events={(events ?? []).map(e => ({ id: e.id, name: e.name }))} preset={sp.goal ?? ""} /></section>
      <section className="k-card ag-c"><div className="k-between"><h2>Suggested actions</h2></div><ul className="ag-sug">{suggestions.map(([I, t, c]) => <li key={t}><Link href={href({ goal: t })}><span className={`ag-si ${c}`}><I size={16} /></span>{t}</Link></li>)}</ul></section></div>}
    <div className={tab === "work" ? "ag-r2" : "ag-solo"}>
      {(tab === "work" || tab === "history") && <section className="k-card ag-c"><div className="k-between"><h2>{tab === "history" ? `History (${history.length})` : `Active work (${active.length})`}</h2>{tab === "work" && <span className="k-row" style={{ gap: 10 }}><Link className="k-link" href={href({ tab: "history" })}>View all <ArrowRight size={13} /></Link><form action="/organizer/agent"><select name="status" defaultValue={status} className="ag-sel" aria-label="Status filter"><option value="">All status</option><option value="running">In progress</option><option value="waiting_approval">Waiting</option><option value="completed">Completed</option></select><button className="k-btn outline sm">Apply</button></form></span>}</div>
        <ul className="ag-runs">{(tab === "history" ? history : active).slice(0, tab === "history" ? 60 : 6).map(runRow)}{!(tab === "history" ? history : active).length && <li className="k-small">No runs yet — tell Gala Agent what you want to achieve.</li>}</ul></section>}
      {(tab === "work" || tab === "approvals") && <section className="k-card ag-c"><div className="k-between"><h2>Approvals ({pending.length})</h2>{tab === "work" && <Link className="k-link" href={href({ tab: "approvals" })}>View all <ArrowRight size={13} /></Link>}</div>
        <ul className="ag-aps">{(tab === "approvals" ? approvals ?? [] : pending.slice(0, 3)).map(a => { const e = ev(a.event_id); return <li key={a.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e?.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span className="ag-at"><b>{a.title}</b><small>{a.detail}</small><span className="ag-chips"><i>{a.action.replace(/_/g, " ")}</i>{e && <i>{e.name}</i>}</span></span><span className="ag-ai"><small>{a.amount ? "Amount" : "Estimated impact"}</small><b>{a.amount ? `£${Number(a.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : a.impact || "—"}</b></span><span className="ag-ad"><small>Requested {relative(a.created_at)}</small>{a.status === "pending" ? <ApprovalButtons id={a.id} /> : <span className={`ag-st ${a.status === "approved" ? "green" : "gray"}`}>{a.status}</span>}</span></li>; })}{!pending.length && tab === "work" && <li className="k-small">Nothing waiting for your approval.</li>}</ul></section>}
      {(tab === "work" || tab === "routines") && <section className="k-card ag-c"><div className="k-between"><h2>Routines ({(routines ?? []).length})</h2><span className="k-row" style={{ gap: 10 }}>{tab === "work" && <Link className="k-link" href={href({ tab: "routines" })}>View all <ArrowRight size={13} /></Link>}<NewRoutineButton /></span></div>
        <ul className="ag-rts">{(routines ?? []).slice(0, tab === "routines" ? 50 : 4).map((r, i) => { const I = RI[i % RI.length]!; return <li key={r.id}><span className={`ag-si ${["blue", "purple", "amber", "green"][i % 4]}`}><I size={17} /></span><span className="k-grow"><b>{r.title}</b><small>{r.schedule} · {r.detail}</small></span><RoutineToggle id={r.id} enabled={r.enabled} title={r.title} /></li>; })}</ul></section>}
      {tab === "work" && <section className="k-card ag-c"><div className="k-between"><h2>Recent history</h2><Link className="k-link" href={href({ tab: "history" })}>View all <ArrowRight size={13} /></Link></div>
        <ul className="ag-hist">{history.slice(0, 5).map(r => <li key={r.id}><span className="ag-si green"><CheckCircle2 size={15} /></span><span className="k-grow"><b>{r.goal}</b><small>{r.result || "Completed"}</small></span><small>{relative(r.updated_at)}</small><span className={`ag-st ${r.status === "completed" ? "green" : "red"}`}>{r.status === "completed" ? "Completed" : r.status}</span></li>)}</ul></section>}
    </div>
  </div>;
}
