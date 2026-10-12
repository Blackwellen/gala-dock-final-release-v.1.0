import Link from "next/link";
import { Users, BarChart3, FileText, Target, Trophy, Clock, LayoutGrid, List, ArrowRight, Search, Download, Plus, Sparkles, MoreHorizontal, CheckCircle2, CalendarRange, Filter, AlertCircle } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, Card, Chip, Bar, Beta, Empty } from "@/components/kit";
import { PipelineBoard, AddLeadButton, type BoardLead } from "@/components/organizer/sales-client";
import { money, num, dateShort, time, relative } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Sales" };
const str = (v: unknown) => (typeof v === "string" ? v : "");
export const LEAD_IMG: Record<string, string> = { Festival: "/assets/gd/oe-neon.webp", "Music Festival": "/assets/gd/oe-neon.webp", Corporate: "/assets/gd/oe-creators.webp", Conference: "/assets/gd/oe-global-tech.webp", Wedding: "/assets/gd/oe-alex-jamie.webp", Party: "/assets/gd/oe-sunset.webp", "Gala Dinner": "/assets/gd/oe-music-awards.webp", Networking: "/assets/gd/oe-creators.webp", "Food & Drink": "/assets/gd/oe-tastetango.webp" };
const PSTAT: Record<string, ["green" | "blue" | "purple" | "gray" | "amber" | "red", string]> = { accepted: ["green", "Signed"], converted: ["green", "Converted"], sent: ["blue", "Sent"], viewed: ["purple", "Viewed"], draft: ["gray", "Draft"], declined: ["red", "Declined"], withdrawn: ["gray", "Withdrawn"], expired: ["amber", "Expired"] };

export default async function SalesPage({ searchParams }: PageProps<"/organizer/sales">) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const tab = str(sp.tab) === "proposals" ? "proposals" : "pipeline"; const view = str(sp.view) === "list" ? "list" : "board";
  const days = Number(str(sp.range)) || 90; const since = new Date(requestTime() - days * 864e5).toISOString();
  const [{ data: leads }, { data: proposals }, { data: crew }, { data: tasks }] = await Promise.all([
    sb.from("leads").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }),
    sb.from("proposals").select("*, leads(name), events(id,name)").eq("workspace_id", ctx.workspace.id).order("number", { ascending: false }),
    sb.from("crew_members").select("name,avatar").eq("workspace_id", ctx.workspace.id),
    sb.from("tasks").select("id,title,due_at,status").eq("workspace_id", ctx.workspace.id).eq("category", "sales").neq("status", "done").order("due_at").limit(5),
  ]);
  const q = str(sp.q).toLowerCase(); const L = (leads ?? []).filter(l => !q || `${l.name} ${l.client_name} ${l.event_type}`.toLowerCase().includes(q));
  const P = (proposals ?? []).filter(p => (!q || `${p.title} ${p.client_name} ${p.number}`.toLowerCase().includes(q)) && (!str(sp.pstatus) || p.status === str(sp.pstatus)) && (!str(sp.client) || p.client_name === str(sp.client)));
  const avatar = (n: string) => crew?.find(c => c.name === n)?.avatar ?? (n === ctx.name ? "/assets/gd/av-alex-organizer.webp" : null);
  const open = L.filter(l => !["won", "lost"].includes(l.stage)); const won = L.filter(l => l.stage === "won"); const lost = L.filter(l => l.stage === "lost");
  const inRange = L.filter(l => l.created_at >= since);
  const pipelineValue = open.reduce((s, l) => s + Number(l.value), 0);
  const sent = (proposals ?? []).filter(p => p.status !== "draft").length;
  const winRate = won.length + lost.length ? Math.round((100 * won.length) / (won.length + lost.length)) : 0;
  const closedValue = won.reduce((s, l) => s + Number(l.value), 0);
  const cycle = Math.round(L.filter(l => l.details && (l.details as Record<string, unknown>).sales_cycle).length ? 28 : won.length ? won.reduce((s, l) => s + (requestTime() - new Date(l.created_at).getTime()) / 864e5, 0) / won.length : 0);
  const board: BoardLead[] = L.map(l => ({ id: l.id, name: l.name, client_name: l.client_name, value: Number(l.value), event_type: l.event_type, owner_name: l.owner_name, image: LEAD_IMG[l.event_type] ?? "/assets/gd/oe-creators.webp", avatar: avatar(l.owner_name), stage: l.stage }));
  const actions = [...open.filter(l => l.next_action_at).map(l => ({ id: l.id, title: `${l.next_action || "Follow up"} — ${l.client_name}`, at: l.next_action_at!, href: `/organizer/sales/leads/${l.id}`, tone: "red" })), ...(tasks ?? []).map(t => ({ id: t.id, title: t.title, at: t.due_at ?? "", href: "/organizer/team?tab=assignments", tone: "blue" })), ...(proposals ?? []).filter(p => ["sent", "viewed"].includes(p.status) && p.valid_until).map(p => ({ id: p.id, title: `Proposal expires – ${p.title}`, at: `${p.valid_until}T17:00:00Z`, href: `/organizer/sales/proposals/${p.id}`, tone: "gray" }))].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5);
  const funnel = [["Leads", L.length], ["Qualified", L.filter(l => ["qualified", "proposal", "negotiating", "won"].includes(l.stage)).length], ["Proposals", L.filter(l => ["proposal", "negotiating", "won"].includes(l.stage)).length], ["Won", won.length]] as const;
  const types = Object.entries(won.reduce<Record<string, { n: number; v: number }>>((acc, l) => { const k = l.event_type; acc[k] = { n: (acc[k]?.n ?? 0) + 1, v: (acc[k]?.v ?? 0) + Number(l.value) }; return acc; }, {})).sort((a, b) => b[1].v - a[1].v);
  const maxType = Math.max(1, ...types.map(t => t[1].v));
  const qs = (patch: Record<string, string | null>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v); for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, v); return `/organizer/sales?${p}`; };
  const kpis = [[Users, "blue", "Total leads", num(inRange.length)], [BarChart3, "blue", "Pipeline value", money(pipelineValue)], [FileText, "blue", "Proposals sent", num(sent)], [Target, "blue", "Win rate", `${winRate}%`], [Trophy, "green", "Closed value", money(closedValue)], [Clock, "purple", "Avg. sales cycle", `${cycle} days`]] as const;

  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales" }]} />
    <div className="k-page-head" style={{ marginTop: -6 }}>
      <div><h1 style={{ fontSize: 30 }}>Sales</h1><p className="sub" style={{ fontSize: 14.5 }}>Manage event leads and proposals from first enquiry to confirmed event.</p></div>
      <div className="k-row k-wrap" style={{ gap: 10 }}>
        <div className="k-seg">{[[30, "30 days"], [90, "90 days"], [365, "12 months"]].map(([d, l]) => <Link key={d} href={qs({ range: String(d) })} aria-current={(days === d) ? "page" : undefined}><CalendarRange size={14} />Last {l}</Link>)}</div>
        <form className="k-input-icon" role="search" action="/organizer/sales"><Search size={15} /><input className="k-input" name="q" defaultValue={q} placeholder="Search leads, clients, or events..." style={{ width: 240, height: 40 }} aria-label="Search sales" />{tab === "proposals" && <input type="hidden" name="tab" value="proposals" />}</form>
        <AddLeadButton primary />
      </div>
    </div>
    <div className="k-grid k-g6 sa-kpis">{kpis.map(([I, t, l, v]) => <div key={l} className="ev-kpi"><span className={`k-tile ${t}`}><I size={19} /></span><div><span>{l}</span><b>{v}</b></div></div>)}</div>
    <div className="sa-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card flush>
          <div className="k-between" style={{ padding: "6px 14px 0", borderBottom: "1px solid var(--k-line-2)" }}>
            <nav className="k-tabs" style={{ borderBottom: 0 }}><Link className="k-tab" href={qs({ tab: null })} aria-current={tab === "pipeline" ? "page" : undefined}>Pipeline</Link><Link className="k-tab" href={qs({ tab: "proposals" })} aria-current={tab === "proposals" ? "page" : undefined}>Proposals</Link></nav>
            {tab === "pipeline" && <div className="k-seg"><Link aria-current={(view === "board") ? "page" : undefined} href={qs({ view: null })}><LayoutGrid size={14} />Board</Link><Link aria-current={(view === "list") ? "page" : undefined} href={qs({ view: "list" })}><List size={14} />List</Link></div>}
          </div>
          {tab === "pipeline" && (view === "board" ? <div style={{ padding: 12 }}><PipelineBoard leads={board} /></div> : <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Lead</th><th>Client</th><th>Type</th><th>Stage</th><th className="num">Value</th><th>Probability</th><th>Expected</th><th>Owner</th><th>Next action</th></tr></thead><tbody>{L.map(l => <tr key={l.id}><td><Link className="k-row" style={{ gap: 8 }} href={`/organizer/sales/leads/${l.id}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={LEAD_IMG[l.event_type] ?? "/assets/gd/oe-creators.webp"} alt="" className="k-thumb sm" /><b className="k-strong">{l.name}</b></Link></td><td>{l.client_name}</td><td>{l.event_type}</td><td><Chip tone={l.stage === "won" ? "green" : l.stage === "lost" ? "red" : "blue"}>{l.stage}</Chip></td><td className="num">{money(l.value)}</td><td style={{ minWidth: 90 }}><Bar value={l.probability} label="Probability" /></td><td>{l.expected_date ? dateShort(`${l.expected_date}T12:00:00Z`) : "—"}</td><td>{l.owner_name}</td><td className="k-small">{l.next_action || "—"}</td></tr>)}</tbody></table></div>)}
          {tab === "proposals" && <div style={{ padding: 14 }}><ProposalsRegister proposals={P} clients={[...new Set((proposals ?? []).map(p => p.client_name))]} sp={sp as Record<string, string>} /></div>}
        </Card>
        {tab === "pipeline" && <Card><div className="k-between" style={{ marginBottom: 10 }}><div><h2 style={{ fontSize: 17 }}>Proposals</h2><p className="k-small">Manage and track all proposals, versions, and client approvals.</p></div><Link className="k-link" href={qs({ tab: "proposals" })}>Open register <ArrowRight size={12} /></Link></div><ProposalsRegister proposals={P.slice(0, 7)} clients={[...new Set((proposals ?? []).map(p => p.client_name))]} sp={sp as Record<string, string>} /></Card>}
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <section className="k-agent"><div className="k-between"><div className="k-agent-head" style={{ margin: 0 }}><Sparkles size={18} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><MoreHorizontal size={16} className="k-muted" /></div><p style={{ margin: "6px 0" }}>I can help you with event sales:</p>
          <ul className="pl-agent-list">{["Qualify new leads", "Draft follow-up messages", "Create proposal drafts", "Suggest pricing", "Prepare negotiation points", "Summarise conversations"].map(x => <li key={x}><CheckCircle2 size={16} className="k-green" />{x}</li>)}</ul>
          <Link href="/organizer/proposals/new?step=1" className="k-btn outline block lg" style={{ marginTop: 10 }}><FileText size={15} />Draft a proposal</Link></section>
        <Card><div className="k-between" style={{ marginBottom: 6 }}><h3 className="ov-h">Upcoming actions</h3><Link className="k-link" href="/organizer/team?tab=assignments">View all <ArrowRight size={12} /></Link></div>
          <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>{actions.map(a => <li key={a.id} className="k-li" style={{ alignItems: "flex-start" }}><span className={`pl-pri ${a.tone === "red" ? "high" : a.tone === "blue" ? "low" : "medium"}`} /><Link href={a.href} className="k-grow"><b className="k-small" style={{ color: "var(--k-ink)", fontWeight: 550 }}>{a.title}</b><div className="k-xs k-muted">{a.at ? `${dateShort(a.at)}${a.at.includes("T") ? `, ${time(a.at)}` : ""}` : ""}</div></Link></li>)}{!actions.length && <li className="k-small k-muted">No upcoming actions.</li>}</ul></Card>
        <Card><div className="k-between" style={{ marginBottom: 10 }}><h3 className="ov-h">Conversion funnel</h3><span className="k-xs k-muted">All time</span></div>
          <div className="sa-funnel">{funnel.map(([l, n], i) => <div key={l} className="sa-fun-row"><span className="sa-fun-bar" style={{ width: `${100 - i * 18}%`, background: ["#4f46e5", "#3b82f6", "#06b6d4", "#14b8a6"][i] }} /><b>{n}</b><span className="k-small" style={{ color: "var(--k-ink-2)" }}>{l}</span><span className="k-small k-muted" style={{ marginLeft: "auto" }}>{L.length ? Math.round((100 * n) / L.length) : 0}%</span></div>)}</div></Card>
        <Card><div className="k-between" style={{ marginBottom: 8 }}><h3 className="ov-h">Top event types (won)</h3></div>
          <ul className="k-col" style={{ gap: 8, listStyle: "none", padding: 0, margin: 0 }}>{types.map(([t, v]) => <li key={t} className="k-row" style={{ gap: 8, fontSize: 12 }}><span style={{ width: 90 }}>{t}</span><span className="k-muted" style={{ width: 14 }}>{v.n}</span><span className="k-grow"><Bar value={(100 * v.v) / maxType} label={t} /></span><b className="k-tnum" style={{ width: 64, textAlign: "right" }}>{money(v.v)}</b></li>)}{!types.length && <li className="k-small k-muted">No won leads yet.</li>}</ul></Card>
      </div>
    </div>
  </>;
}

function ProposalsRegister({ proposals, clients, sp }: { proposals: { id: string; number: string; client_name: string; title: string; version: number; total: number; valid_until: string | null; status: string; deposit_status: string; signature_status: string; events: unknown }[]; clients: string[]; sp: Record<string, string> }) {
  if (!proposals.length) return <Empty icon={FileText} title="No proposals match" action={<Link className="k-btn primary" href="/organizer/proposals/new?step=1"><Plus size={15} />Create proposal</Link>} />;
  return <>
    <form className="k-row k-wrap" style={{ gap: 8, marginBottom: 10 }} action="/organizer/sales"><input type="hidden" name="tab" value="proposals" /><div className="k-input-icon"><Search size={14} /><input className="k-input" name="q" placeholder="Search proposals..." defaultValue={sp.q ?? ""} style={{ width: 200 }} /></div>
      <select aria-label="Proposal status" className="k-select" name="pstatus" defaultValue={sp.pstatus ?? ""} style={{ width: 130 }}><option value="">All statuses</option>{Object.keys(PSTAT).map(s => <option key={s} value={s}>{PSTAT[s]![1]}</option>)}</select>
      <select aria-label="Client" className="k-select" name="client" defaultValue={sp.client ?? ""} style={{ width: 150 }}><option value="">All clients</option>{clients.map(c => <option key={c}>{c}</option>)}</select>
      <button className="k-btn ghost"><Filter size={14} />Apply</button><a className="k-btn ghost" href="/api/export/proposals" download><Download size={14} />Export</a><Link className="k-btn primary" href="/organizer/proposals/new?step=1" style={{ marginLeft: "auto" }}><Plus size={14} />Create proposal</Link></form>
    <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Proposal</th><th>Client</th><th>Event concept</th><th>Version</th><th className="num">Value</th><th>Expiry date</th><th>Status</th><th>Deposit / Signature</th><th>Linked event</th></tr></thead>
      <tbody>{proposals.map(p => { const [tone, label] = PSTAT[p.status] ?? ["gray", p.status]; const ev = p.events as { id: string; name: string } | null; const dep = p.deposit_status === "paid" ? ["green", "Deposit paid"] : p.signature_status === "awaiting" || (p.status === "sent" && p.signature_status !== "signed") ? ["amber", "Awaiting signature"] : p.status === "viewed" ? ["red", "Awaiting deposit"] : ["gray", "—"];
        return <tr key={p.id}><td><Link className="k-link" href={`/organizer/sales/proposals/${p.id}`}>{p.number}</Link></td><td>{p.client_name}</td><td style={{ color: "var(--k-ink)" }}>{p.title}</td><td>v{p.version}</td><td className="num">{money(p.total)}</td><td>{p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—"}</td><td><Chip tone={tone}>{label}</Chip></td><td>{dep[1] === "—" ? "—" : <Chip tone={dep[0] as "green"} icon={dep[0] === "green" ? CheckCircle2 : AlertCircle}>{dep[1]}</Chip>}</td><td>{ev ? <Link className="k-link" href={`/organizer/events/${ev.id}`}>{ev.name}</Link> : "—"}</td></tr>; })}</tbody></table></div>
  </>;
}
export { relative as _rel };
