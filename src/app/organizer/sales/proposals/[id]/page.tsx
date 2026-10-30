import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users, ShieldCheck, Plus, MoreHorizontal, ArrowRight, FileText, Download, CircleDollarSign, PenTool, Building2, Wallet, ListChecks, Truck, UserCog, ChevronRight, Sparkles } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, Card, Chip, Avatar, Beta } from "@/components/kit";
import { AgentAsk } from "@/components/kit/client";
import { ProposalHeaderActions, ProposalStatusActions, OptionToggle } from "@/components/organizer/proposal-actions";
import { LEAD_IMG } from "../../page";
import type { LineItem, OptionItem } from "@/lib/actions/proposals";
import { money, dateShort, relative } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Proposal" };
const ICONS = ["#ef4444", "#7c3aed", "#2563eb", "#f97316", "#f59e0b", "#16a34a", "#0ea5e9"];
const FLOW = ["draft", "sent", "viewed", "accepted", "deposit", "converted"] as const;

export default async function ProposalPage({ params, searchParams }: PageProps<"/organizer/sales/proposals/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getOrganizer(); const sb = ctx.supabase;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: p } = await sb.from("proposals").select("*, leads(id,reference,contact_name,contact_email)").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!p) notFound();
  const tab = ["commercial", "activity"].includes(String(sp.tab)) ? String(sp.tab) : "proposal";
  const c = (p.content ?? {}) as { summary?: string; date?: string; venue?: string; location?: string; attendance?: string; attendance_type?: string; hero?: string; line_items?: LineItem[]; options?: OptionItem[]; terms?: Record<string, string>; files?: [string, string][]; event_type?: string; client?: { contact_name?: string; contact_email?: string }; tax_rate?: number };
  const lead = p.leads as unknown as { id: string; reference: string; contact_name: string; contact_email: string } | null;
  const [{ data: versions }, { data: acts }] = await Promise.all([
    sb.from("proposal_versions").select("version,issued_at,snapshot").eq("proposal_id", p.id).order("version", { ascending: false }),
    lead ? sb.from("lead_activities").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const items = c.line_items ?? [], opts = c.options ?? [], taxRate = c.tax_rate ?? Number((ctx.workspace.settings as Record<string, unknown>)?.tax_rate ?? 20);
  const itemsSum = items.reduce((s, i) => s + i[2] * i[3], 0), optSum = opts.filter(o => o[3]).reduce((s, o) => s + o[2], 0);
  const locked = p.status !== "draft";
  const reached = (s: typeof FLOW[number]) => s === "draft" ? true : s === "sent" ? p.status !== "draft" : s === "viewed" ? ["viewed", "accepted", "converted"].includes(p.status) : s === "accepted" ? ["accepted", "converted"].includes(p.status) : s === "deposit" ? p.deposit_status === "paid" : p.status === "converted";
  const daysLeft = p.valid_until ? Math.ceil((new Date(`${p.valid_until}T23:59:59Z`).getTime() - requestTime()) / 864e5) : null;
  const shareUrl = `/proposal/${p.share_token}`;
  const contact = c.client?.contact_name || lead?.contact_name || "";
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales", href: "/organizer/sales" }, { label: "Proposals", href: "/organizer/sales?tab=proposals" }, { label: p.number }]} />
    <div className="ld-head">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.hero ?? LEAD_IMG[c.event_type ?? ""] ?? "/assets/gd/oe-neon.webp"} alt="" className="ld-cover" />
      <div><Chip tone="purple">Proposal</Chip><h1 style={{ fontSize: 28, margin: "6px 0 4px" }}>{p.title}</h1><div className="k-row k-small k-muted k-wrap" style={{ gap: 8 }}><span>{p.number}</span><Chip tone="gray">v{p.version}</Chip><span>•</span><span>Created {dateShort(p.created_at)}</span>{lead && <><span>•</span><Link className="k-link" href={`/organizer/sales/leads/${lead.id}`}>Linked to lead {lead.reference}</Link></>}</div>
        <div className="k-row k-wrap" style={{ gap: 6, marginTop: 10 }}>{[c.event_type, c.attendance_type, c.venue].filter(Boolean).map((t, i) => <Chip key={String(t)} tone={(["purple", "blue", "green"] as const)[i % 3]}>{t}</Chip>)}<Chip tone={p.status === "draft" ? "amber" : p.status === "accepted" || p.status === "converted" ? "green" : "blue"}>{p.status[0]!.toUpperCase() + p.status.slice(1)}</Chip></div></div>
      <div className="k-col" style={{ gap: 14, alignItems: "flex-end" }}>
        <div className="ld-meta" style={{ gridTemplateColumns: "repeat(4, auto)" }}><div><small>Client</small><span className="k-row" style={{ gap: 8 }}><span className="k-tile sm"><Building2 size={14} /></span>{p.client_name}</span></div><div><small>Primary contact</small><span className="k-row" style={{ gap: 8 }}><Avatar name={contact || p.client_name} />{contact || "—"}</span></div><div><small>Total value</small><b style={{ fontSize: 20 }}>{money(p.total)}</b></div><div><small>Valid until</small><span className="k-row" style={{ gap: 6 }}><CalendarDays size={15} />{p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—"}</span>{daysLeft != null && <small style={{ marginTop: 2 }}>({daysLeft >= 0 ? `${daysLeft} days` : "expired"})</small>}</div></div>
        <ProposalHeaderActions id={p.id} status={p.status} shareUrl={shareUrl} linkRevoked={!!(p as { share_revoked_at?: string | null }).share_revoked_at} />
      </div>
    </div>
    <nav className="k-tabs">{(["proposal", "commercial", "activity"] as const).map(t => <Link key={t} className="k-tab" href={`/organizer/sales/proposals/${p.id}${t === "proposal" ? "" : `?tab=${t}`}`} aria-current={tab === t ? "page" : undefined}>{t[0]!.toUpperCase() + t.slice(1)}</Link>)}</nav>
    <div className="ld-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        {tab === "proposal" && <>
          <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Proposal overview</h2><div className="pr-ov">
            <div className="pl-box"><h4>Executive summary</h4><p style={{ fontSize: 12.5, color: "var(--k-ink-2)", lineHeight: 1.55 }}>{c.summary || "No summary yet."}</p></div>
            <div className="pr-facts">{([[CalendarDays, "Event date", c.date ? dateShort(c.date.length > 10 ? c.date : `${c.date}T12:00:00Z`) : "TBC", ""], [MapPin, "Venue", c.venue || c.location || "TBC", c.location ?? ""], [Users, "Expected attendance", c.attendance || "—", c.attendance_type ?? ""], [ShieldCheck, "Proposal valid until", p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—", daysLeft != null && daysLeft >= 0 ? `(${daysLeft} days)` : ""]] as const).map(([I, l, v, s]) => <div key={l}><span className="k-tile sm"><I size={15} /></span><div><small>{l}</small><b>{v}</b>{s && <small>{s}</small>}</div></div>)}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/gd/pw-wedding-side.webp" alt="" className="pr-ov-img" />
          </div></Card>
          <div className="pr-two">
            <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Line items</h2>{!locked && <Link className="k-btn outline sm" href={`/organizer/proposals/new?step=2&id=${p.id}`}><Plus size={13} />Add item</Link>}</div>
              <table className="k-table"><thead><tr><th>#</th><th>Item</th><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Total</th></tr></thead><tbody>{items.map((it, i) => <tr key={i}><td>{i + 1}</td><td><span className="k-row" style={{ gap: 6, color: "var(--k-ink)" }}><i className="k-dot" style={{ background: ICONS[i % 7] }} />{it[0]}</span></td><td>{it[1]}</td><td className="num">{it[2]}</td><td className="num">{money(it[3])}</td><td className="num">{money(it[2] * it[3])}</td></tr>)}</tbody></table>
              {!items.length && <p className="k-small">No line items yet.</p>}</Card>
            <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Options / Add-ons</h2>{!locked && <Link className="k-btn outline sm" href={`/organizer/proposals/new?step=2&id=${p.id}`}><Plus size={13} />Add option</Link>}</div>
              <div className="k-col" style={{ gap: 10 }}>{opts.map((o, i) => <div key={i} className="k-row" style={{ gap: 10, alignItems: "flex-start" }}><OptionToggle id={p.id} index={i} on={o[3]} locked={locked} /><div className="k-grow"><b className="k-small k-strong">{o[0]}</b><div className="k-xs k-muted">{o[1]}</div></div><b className="k-small">{money(o[2])}</b></div>)}{!opts.length && <p className="k-small">No options.</p>}</div></Card>
          </div>
          <div className="pr-three">
            <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Financial summary</h2><Link className="k-link" href={`/organizer/sales/proposals/${p.id}?tab=commercial`}>View detailed breakdown <ArrowRight size={12} /></Link></div>
              <div className="pr-totals"><div><span>Subtotal</span><b>{money(itemsSum)}</b></div><div><span>Options ({opts.filter(o => o[3]).length})</span><b>{money(optSum)}</b></div><div><span>Total (ex. VAT)</span><b>{money(p.subtotal)}</b></div><div><span>VAT ({taxRate}%)</span><b>{money(p.tax)}</b></div><div className="grand"><span>Total (inc. VAT)</span><b>{money(p.total)}</b></div></div></Card>
            <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Key terms</h2>{!locked && <Link className="k-link" href={`/organizer/proposals/new?step=3&id=${p.id}`}>Edit</Link>}</div>
              <dl className="pr-terms">{Object.entries(c.terms ?? {}).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k[0]!.toUpperCase() + k.slice(1)}</dt><dd>{v}</dd></div>)}</dl></Card>
            <Card><div className="k-between" style={{ marginBottom: 8 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Files &amp; attachments</h2></div>
              <div className="k-list">{(c.files ?? []).map(([n, s]) => <div key={n} className="k-li"><span className="k-tile sm red"><FileText size={13} /></span><div className="k-grow"><b className="k-xs k-strong">{n}</b><div className="k-xs k-muted">{s}</div></div><Download size={14} className="k-blue" aria-hidden /></div>)}{!c.files?.length && <p className="k-small">No attachments.</p>}</div></Card>
          </div>
          <Card><div className="k-row" style={{ gap: 10, marginBottom: 10 }}><h2 className="ov-h" style={{ fontSize: 15 }}>Conversion preview</h2><span className="k-xs k-muted">When this proposal is accepted, the following records will be created or updated:</span></div>
            <div className="pr-conv">{([[CalendarDays, "Event", p.title, "Create"], [Wallet, "Budget", money(p.total), "Create"], [ListChecks, "Tasks", "Event setup tasks", "Create"], [Truck, "Suppliers", `${items.length} cost lines`, "Link"], [UserCog, "Team", "Roles from plan", "Create"]] as const).map(([I, l, v, a]) => <div key={l}><span className="k-tile purple"><I size={16} /></span><div className="k-grow"><small>{l}</small><b>{v}</b></div><Chip tone={a === "Link" ? "green" : "green"}>{a}</Chip></div>)}</div></Card>
        </>}
        {tab === "commercial" && <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Commercial breakdown</h2>
          <table className="k-table"><thead><tr><th>Line</th><th className="num">Value</th><th className="num">Share</th></tr></thead><tbody>{items.map((it, i) => <tr key={i}><td>{it[0]}</td><td className="num">{money(it[2] * it[3])}</td><td className="num">{p.subtotal ? Math.round((100 * it[2] * it[3]) / Number(p.subtotal)) : 0}%</td></tr>)}{opts.filter(o => o[3]).map((o, i) => <tr key={`o${i}`}><td>{o[0]} (option)</td><td className="num">{money(o[2])}</td><td className="num">{p.subtotal ? Math.round((100 * o[2]) / Number(p.subtotal)) : 0}%</td></tr>)}</tbody></table>
          <div className="k-grid k-g3" style={{ marginTop: 14 }}><div className="k-kpi"><div><div className="lbl">Deposit ({p.deposit_pct}%)</div><div className="val">{money(Number(p.total) * p.deposit_pct / 100)}</div></div></div><div className="k-kpi"><div><div className="lbl">Balance</div><div className="val">{money(Number(p.total) * (100 - p.deposit_pct) / 100)}</div></div></div><div className="k-kpi"><div><div className="lbl">VAT</div><div className="val">{money(p.tax)}</div></div></div></div>
          <h3 className="ov-h" style={{ margin: "16px 0 8px" }}>Issued versions</h3>
          <table className="k-table"><thead><tr><th>Version</th><th>Issued</th><th className="num">Total</th></tr></thead><tbody>{(versions ?? []).map(v => <tr key={v.version}><td>v{v.version}</td><td>{dateShort(v.issued_at)}</td><td className="num">{money((v.snapshot as { total?: number }).total ?? 0)}</td></tr>)}</tbody></table>
          {!versions?.length && <p className="k-small">Not issued yet. Issued versions are preserved permanently.</p>}</Card>}
        {tab === "activity" && <Card><h2 className="ov-h" style={{ fontSize: 15, marginBottom: 10 }}>Activity</h2><ol className="ld-act">{p.acceptance && <li><span className="k-tile sm green"><PenTool size={13} /></span><div><b className="k-small k-strong">Accepted by {(p.acceptance as { name: string }).name}</b><div className="k-xs k-muted">{(p.acceptance as { email: string }).email} · v{(p.acceptance as { version: number }).version} · {p.accepted_at ? relative(p.accepted_at) : ""}</div></div></li>}
          {(versions ?? []).map(v => <li key={v.version}><span className="k-tile sm"><FileText size={13} /></span><div><b className="k-small k-strong">Version {v.version} issued</b><div className="k-xs k-muted">{relative(v.issued_at)}</div></div></li>)}
          {(acts ?? []).map(a => <li key={a.id}><span className="k-tile sm purple"><FileText size={13} /></span><div><b className="k-small k-strong">{a.title}</b><div className="k-xs k-muted">{a.detail} · {relative(a.created_at)}</div></div></li>)}</ol></Card>}
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><div className="k-between"><h3 className="ov-h">Proposal status</h3><Chip tone={p.status === "draft" ? "amber" : "blue"}>{p.status[0]!.toUpperCase() + p.status.slice(1)}</Chip></div>
          <ol className="pr-flow">{FLOW.map(s => <li key={s} data-on={reached(s)}><i /><div><b>{{ draft: "Draft", sent: "Sent", viewed: "Viewed", accepted: "Accepted", deposit: "Deposit paid", converted: "Converted to event" }[s]}</b>{s === "draft" && <small>{dateShort(p.created_at)}</small>}{s === "accepted" && <small>Requires signature &amp; deposit</small>}</div></li>)}</ol>
          <ProposalStatusActions id={p.id} status={p.status} shareUrl={shareUrl} /></Card>
        <Card><h3 className="ov-h" style={{ marginBottom: 10 }}>Acceptance &amp; payment</h3>
          <div className="k-li" style={{ alignItems: "flex-start" }}><span className="k-tile sm amber"><PenTool size={13} /></span><div className="k-grow"><div className="k-between"><b className="k-small">Signature status</b><Chip tone={p.signature_status === "signed" ? "green" : "amber"}>{p.signature_status === "signed" ? "Signed" : "Not signed"}</Chip></div><div className="k-xs k-muted">{p.signature_status === "signed" ? "Client accepted this version." : "Client has not yet signed this version."}</div></div></div>
          <div className="k-li" style={{ alignItems: "flex-start", marginTop: 10 }}><span className="k-tile sm"><CircleDollarSign size={13} /></span><div className="k-grow"><div className="k-between"><b className="k-small">Deposit requirement</b><Chip tone={p.deposit_status === "paid" ? "green" : "gray"}>{p.deposit_status === "paid" ? "Paid" : "Not paid"}</Chip></div><b>{p.deposit_pct}% ({money(Number(p.total) * p.deposit_pct / 100)})</b><div className="k-xs k-muted">Collected by invoice after acceptance.</div></div></div></Card>
        <section className="k-agent"><div className="k-agent-head"><Sparkles size={16} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><p>Get a proposal summary, adjust pricing or prepare a follow-up.</p><AgentAsk scope="organizer" placeholder="Ask about this proposal..." /></section>
      </div>
    </div>
  </>;
}
export const _i = { MoreHorizontal, ChevronRight };
