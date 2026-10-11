import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Sparkles, FileText, CalendarDays, MapPin, Users } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Card, Chip, Beta } from "@/components/kit";
import { AgentAsk } from "@/components/kit/client";
import { WizardFrame } from "@/components/organizer/wizard";
import { ProposalClientForm, ProposalPricingForm, SendProposalForm } from "@/components/organizer/proposal-forms";
import type { LineItem, OptionItem } from "@/lib/actions/proposals";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Create proposal" };
const STEPS = [{ title: "Client & Event", sub: "Who and what" }, { title: "Offer & Pricing", sub: "Packages, items and terms" }, { title: "Review & Send", sub: "Check and deliver" }];

export default async function NewProposal({ searchParams }: PageProps<"/organizer/proposals/new">) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1)); const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : null;
  const { data: p } = id ? await sb.from("proposals").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle() : { data: null };
  if (id && !p) notFound();
  if (step > 1 && !p) redirect("/organizer/proposals/new?step=1");
  const c = (p?.content ?? {}) as { client?: { contact_name?: string; contact_email?: string }; event_type?: string; date?: string; flexible?: boolean; venue?: string; location?: string; attendance?: string; attendance_type?: string; summary?: string; line_items?: LineItem[]; options?: OptionItem[]; terms?: Record<string, string>; tax_rate?: number; sent_to?: string };
  const { data: leads } = await sb.from("leads").select("id,name,client_name,contact_name,contact_email,event_type,expected_date,location,guests,budget").eq("workspace_id", ctx.workspace.id).not("stage", "in", "(won,lost)").order("created_at", { ascending: false });
  const leadParam = typeof sp.lead === "string" ? sp.lead : "";
  const fromLead = !p && leadParam ? leads?.find(l => l.id === leadParam) : null;
  const taxRate = Number((ctx.workspace.settings as Record<string, unknown>)?.tax_rate ?? 20);
  const hrefFor = (n: number) => (p ? `/organizer/proposals/new?step=${n}&id=${p.id}` : null);
  return <WizardFrame crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Proposals", href: "/organizer/sales?tab=proposals" }, { label: p ? `${p.number} (draft)` : "Create Proposal" }]} title="Create Proposal" sub="Turn your client's requirements into a professional event proposal." steps={STEPS} step={step} hrefFor={hrefFor}
    actions={p && <Chip tone={p.status === "draft" ? "amber" : "green"} lg>{p.number} · {p.status === "draft" ? "Draft saved" : p.status}</Chip>}>
    {step === 1 && <ProposalClientForm id={p?.id ?? null} leads={leads ?? []} initial={p ? { title: p.title, client_name: p.client_name, lead_id: p.lead_id ?? "", contact_name: c.client?.contact_name ?? "", contact_email: c.client?.contact_email ?? "", event_type: c.event_type ?? "Festival", date: c.date ?? "", flexible: !!c.flexible, location: c.location ?? "", venue: c.venue ?? "", attendance: c.attendance ?? "", attendance_type: c.attendance_type ?? "General public", summary: c.summary ?? "" } : fromLead ? { title: fromLead.name, client_name: fromLead.client_name, lead_id: fromLead.id, contact_name: fromLead.contact_name, contact_email: fromLead.contact_email, event_type: fromLead.event_type, date: fromLead.expected_date ?? "", location: fromLead.location, attendance: fromLead.guests, venue: "", attendance_type: "General public", summary: "", flexible: false } : { event_type: "Festival", attendance_type: "General public" }} />}
    {step === 2 && p && (p.status !== "draft" ? <IssuedNotice id={p.id} /> : <ProposalPricingForm id={p.id} taxRate={taxRate} initial={{ line_items: c.line_items ?? [], options: c.options ?? [], deposit_pct: p.deposit_pct, valid_until: p.valid_until ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), terms: c.terms ?? {} }} />)}
    {step === 3 && p && <div className="wz-grid">
      <Card><div className="k-between" style={{ marginBottom: 12 }}><h2 className="wz-h">Brand preview</h2><Link className="k-link" href={`/organizer/proposals/new?step=2&id=${p.id}`}>Edit pricing</Link></div>
        <div className="pr-preview"><div className="pr-prev-head">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/gala-dock-logo.png" alt="Gala·Dock" height={28} /><span className="k-small k-muted">{ctx.workspace.name}</span></div>
          <h3 style={{ fontSize: 22, margin: "14px 0 4px" }}>{p.title}</h3><p className="k-small">Prepared for {p.client_name}{c.client?.contact_name ? ` · ${c.client.contact_name}` : ""}</p>
          <div className="k-row k-wrap k-small" style={{ gap: 16, margin: "12px 0", color: "var(--k-ink-2)" }}><span className="k-row" style={{ gap: 5 }}><CalendarDays size={14} />{c.date ? dateShort(`${c.date}T12:00:00Z`) : "TBC"}</span><span className="k-row" style={{ gap: 5 }}><MapPin size={14} />{c.venue || c.location || "TBC"}</span><span className="k-row" style={{ gap: 5 }}><Users size={14} />{c.attendance || "—"}</span></div>
          {c.summary && <p style={{ fontSize: 13, color: "var(--k-ink-2)", lineHeight: 1.55 }}>{c.summary}</p>}
          <table className="k-table" style={{ marginTop: 14 }}><thead><tr><th>Item</th><th>Description</th><th className="num">Qty</th><th className="num">Total</th></tr></thead><tbody>{(c.line_items ?? []).map((it, i) => <tr key={i}><td style={{ color: "var(--k-ink)" }}>{it[0]}</td><td>{it[1]}</td><td className="num">{it[2]}</td><td className="num">{money(it[2] * it[3])}</td></tr>)}{(c.options ?? []).filter(o => o[3]).map((o, i) => <tr key={`o${i}`}><td style={{ color: "var(--k-ink)" }}>{o[0]} <Chip tone="purple">Option</Chip></td><td>{o[1]}</td><td className="num">1</td><td className="num">{money(o[2])}</td></tr>)}</tbody></table>
          <div className="pr-totals"><div><span>Subtotal</span><b>{money(p.subtotal, "GBP", { decimals: true })}</b></div><div><span>VAT ({c.tax_rate ?? taxRate}%)</span><b>{money(p.tax, "GBP", { decimals: true })}</b></div><div className="grand"><span>Total</span><b>{money(p.total, "GBP", { decimals: true })}</b></div><div><span>Deposit on acceptance ({p.deposit_pct}%)</span><b>{money(Number(p.total) * p.deposit_pct / 100, "GBP", { decimals: true })}</b></div></div>
          {c.terms && <div className="k-col k-small" style={{ gap: 4, marginTop: 14, color: "var(--k-ink-2)" }}>{Object.entries(c.terms).filter(([, v]) => v).map(([k, v]) => <span key={k}><b style={{ textTransform: "capitalize" }}>{k}:</b> {v}</span>)}<span><b>Valid until:</b> {p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—"}</span></div>}</div></Card>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><h2 className="wz-h" style={{ marginBottom: 10 }}>Send</h2><SendProposalForm id={p.id} defaultTo={c.sent_to ?? c.client?.contact_email ?? ""} shareUrl={p.status !== "draft" ? `/proposal/${p.share_token}` : null} locked={p.status !== "draft"} /></Card>
        <Card><h2 className="wz-h" style={{ marginBottom: 8 }}>Acceptance &amp; deposit</h2><ul className="pl-agent-list"><li><CheckCircle2 size={15} className="k-green" />Client accepts the issued version via secure link</li><li><CheckCircle2 size={15} className="k-green" />Name, email, version and time are recorded</li><li><CheckCircle2 size={15} className="k-green" />{p.deposit_pct}% deposit requested on acceptance</li></ul></Card>
        <section className="k-agent"><div className="k-agent-head"><Sparkles size={16} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><p>Ask for a summary, pricing sanity check or a cover message.</p><AgentAsk scope="organizer" placeholder="e.g. Write a short cover note" /></section>
      </div>
    </div>}
  </WizardFrame>;
}
function IssuedNotice({ id }: { id: string }) {
  return <Card><div className="k-notice amber"><FileText size={16} className="k-amber" /><span>This proposal has been issued and is locked. <Link className="k-link" href={`/organizer/sales/proposals/${id}`}>Open it</Link> and choose <b>Revise</b> to start a new version.</span></div></Card>;
}
