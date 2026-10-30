import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Sparkles, FileText } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Card, Chip, Beta } from "@/components/kit";
import { GalaLogo } from "@/components/brand/gala-logo";
import { AgentAsk } from "@/components/kit/client";
import { WizardFrame } from "@/components/organizer/wizard";
import { ProposalClientForm, ProposalServicesForm, ProposalTermsForm, ProposalPresentationForm, ProposalPreview, SendProposalForm } from "@/components/organizer/proposal-forms";
import type { ProposalPresentation } from "@/lib/actions/proposals";
import type { LineItem, OptionItem, ProposalPackage } from "@/lib/actions/proposals";
import { money, dateShort } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Create proposal" };
// ORG-W02 design (Gala Dock Proposal Dashboard): five steps; only step 5 can issue the proposal.
const STEPS = [{ title: "Client & Event", sub: "Who and what" }, { title: "Services & Options", sub: "Venues, suppliers, setup" }, { title: "Pricing & Terms", sub: "Costs and conditions" }, { title: "Presentation", sub: "Design and content" }, { title: "Review & Send", sub: "Check and deliver" }];
const INTRO = ["Turn your client's requirements into a professional event proposal.", "Build the scope: venues, suppliers, setup and optional extras.", "Set the deposit, validity and commercial terms for your proposal.", "Choose how your client sees the proposal.", "Review your proposal, set delivery options and send to your client."];

export default async function NewProposal({ searchParams }: PageProps<"/organizer/proposals/new">) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const id = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : null;
  const { data: p } = id ? await sb.from("proposals").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle() : { data: null };
  if (id && !p) notFound();
  const c = (p?.content ?? {}) as { client?: { contact_name?: string; contact_email?: string }; event_type?: string; date?: string; flexible?: boolean; venue?: string; location?: string; attendance?: string; attendance_type?: string; summary?: string; line_items?: LineItem[]; options?: OptionItem[]; packages?: ProposalPackage[]; terms?: Record<string, string>; tax_rate?: number; sent_to?: string; wizard_step?: number; presentation?: ProposalPresentation };
  // Furthest reachable step from what is saved (proposals from the earlier three-step builder have no marker and count as complete).
  const saved = c.wizard_step ?? 4;
  const reach = !p ? 1 : !(c.line_items?.length || c.packages?.length) ? 2 : Math.min(5, Math.max(3, saved + 1));
  const want = Math.min(5, Math.max(1, Number(sp.step) || (p ? reach : 1)));
  if (want > reach) redirect(p ? `/organizer/proposals/new?step=${reach}&id=${p.id}` : "/organizer/proposals/new?step=1");
  const step = want;
  const { data: leads } = await sb.from("leads").select("id,name,client_name,contact_name,contact_email,event_type,expected_date,location,guests,budget,stage").eq("workspace_id", ctx.workspace.id).not("stage", "in", "(won,lost)").order("created_at", { ascending: false });
  // A lead linked to this proposal stays selectable even once it is won.
  if (p?.lead_id && !leads?.some(l => l.id === p.lead_id)) { const { data: linked } = await sb.from("leads").select("id,name,client_name,contact_name,contact_email,event_type,expected_date,location,guests,budget,stage").eq("id", p.lead_id).eq("workspace_id", ctx.workspace.id).maybeSingle(); if (linked) leads?.unshift(linked); }
  const leadParam = typeof sp.lead === "string" ? sp.lead : "";
  const fromLead = !p && leadParam ? leads?.find(l => l.id === leadParam) : null;
  const taxRate = Number((ctx.workspace.settings as Record<string, unknown>)?.tax_rate ?? 20);
  const hrefFor = (n: number) => (p ? `/organizer/proposals/new?step=${n}&id=${p.id}` : null);
  const pres: ProposalPresentation = { template: "modern", color: "#2563EB", cover: "", headline: "", sections: ["overview", "items", "options", "terms", "next_steps"], ...(c.presentation ?? {}) };
  const preview = p ? { workspace: ctx.workspace.name, number: p.number, title: p.title, client: p.client_name, date: c.date ? dateShort(`${c.date}T12:00:00Z`) : "", place: c.venue || c.location || "", attendance: c.attendance ? `${c.attendance} guests` : "", summary: c.summary ?? "", items: c.line_items ?? [], options: c.options ?? [], total: Number(p.total), deposit: p.deposit_pct, terms: c.terms ?? {}, covers: [ctx.workspace.cover_image].filter((x): x is string => typeof x === "string" && x.startsWith("/")) } : null;
  const locked = p && p.status !== "draft";
  return <WizardFrame crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Proposals", href: "/organizer/sales?tab=proposals" }, { label: p ? `${p.number} (draft)` : "Create Proposal" }]} title="Create Proposal" sub={INTRO[step - 1]!} steps={STEPS} step={step} hrefFor={hrefFor}
    actions={p && <Chip tone={p.status === "draft" ? "amber" : "green"} lg>{p.number} · {p.status === "draft" ? "Draft saved" : p.status}</Chip>}>
    {step === 1 && <ProposalClientForm id={p?.id ?? null} leads={leads ?? []} initial={p ? { title: p.title, client_name: p.client_name, lead_id: p.lead_id ?? "", contact_name: c.client?.contact_name ?? "", contact_email: c.client?.contact_email ?? "", event_type: c.event_type ?? "Festival", date: c.date ?? "", flexible: !!c.flexible, location: c.location ?? "", venue: c.venue ?? "", attendance: c.attendance ?? "", attendance_type: c.attendance_type ?? "General public", summary: c.summary ?? "" } : fromLead ? { title: fromLead.name, client_name: fromLead.client_name, lead_id: fromLead.id, contact_name: fromLead.contact_name, contact_email: fromLead.contact_email, event_type: fromLead.event_type, date: fromLead.expected_date ?? "", location: fromLead.location, attendance: fromLead.guests, venue: "", attendance_type: "General public", summary: "", flexible: false } : { event_type: "Festival", attendance_type: "General public" }} />}
    {step === 2 && p && (locked ? <IssuedNotice id={p.id} /> : <ProposalServicesForm id={p.id} taxRate={taxRate} initial={{ line_items: c.line_items ?? [], options: c.options ?? [], packages: c.packages ?? [] }} />)}
    {step === 3 && p && (locked ? <IssuedNotice id={p.id} /> : <ProposalTermsForm id={p.id} taxRate={c.tax_rate ?? taxRate} totals={{ subtotal: Number(p.subtotal), tax: Number(p.tax), total: Number(p.total) }} initial={{ deposit_pct: p.deposit_pct, valid_until: p.valid_until ?? new Date(requestTime() + 30 * 864e5).toISOString().slice(0, 10), terms: c.terms ?? {} }} />)}
    {step === 4 && p && preview && (locked ? <IssuedNotice id={p.id} /> : <ProposalPresentationForm id={p.id} initial={pres} preview={preview} />)}
    {step === 5 && p && preview && <div className="wz-grid">
      <Card><div className="k-between" style={{ marginBottom: 12 }}><h2 className="wz-h">Proposal preview</h2><span className="k-row" style={{ gap: 12 }}><Link className="k-link" href={`/organizer/proposals/new?step=2&id=${p.id}`}>Edit services</Link><Link className="k-link" href={`/organizer/proposals/new?step=3&id=${p.id}`}>Edit terms</Link><Link className="k-link" href={`/organizer/proposals/new?step=4&id=${p.id}`}>Edit presentation</Link></span></div>
        <div className="pr-prev-head"><GalaLogo size={26} className="gd-keep-word" /><span className="k-small k-muted">{ctx.workspace.name} · {p.client_name}{c.client?.contact_name ? ` · ${c.client.contact_name}` : ""}</span></div>
        <ProposalPreview v={pres} p={preview} />
        <div className="pr-totals"><div><span>Subtotal</span><b>{money(p.subtotal, "GBP", { decimals: true })}</b></div><div><span>VAT ({c.tax_rate ?? taxRate}%)</span><b>{money(p.tax, "GBP", { decimals: true })}</b></div><div className="grand"><span>Total</span><b>{money(p.total, "GBP", { decimals: true })}</b></div><div><span>Deposit on acceptance ({p.deposit_pct}%)</span><b>{money(Number(p.total) * p.deposit_pct / 100, "GBP", { decimals: true })}</b></div><div><span>Valid until</span><b>{p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—"}</b></div></div></Card>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><h2 className="wz-h" style={{ marginBottom: 10 }}>Recipient &amp; delivery</h2><SendProposalForm id={p.id} defaultTo={c.sent_to ?? c.client?.contact_email ?? ""} shareUrl={p.status !== "draft" ? `/proposal/${p.share_token}` : null} locked={p.status !== "draft"} /></Card>
        <Card><h2 className="wz-h" style={{ marginBottom: 8 }}>Acceptance &amp; deposit</h2><ul className="pl-agent-list"><li><CheckCircle2 size={15} className="k-green" />Client accepts the issued version via secure link</li><li><CheckCircle2 size={15} className="k-green" />Name, email, version and time are recorded</li><li><CheckCircle2 size={15} className="k-green" />{p.deposit_pct}% deposit requested on acceptance</li></ul></Card>
        <section className="k-agent"><div className="k-agent-head"><Sparkles size={16} className="k-spark" /><h3>Gala Agent</h3><Beta /></div><p>Ask for a summary, pricing sanity check or a cover message.</p><AgentAsk scope="organizer" placeholder="e.g. Write a short cover note" /></section>
        <Link className="k-btn ghost lg" href={`/organizer/proposals/new?step=4&id=${p.id}`}>Back</Link>
      </div>
    </div>}
  </WizardFrame>;
}
function IssuedNotice({ id }: { id: string }) {
  return <Card><div className="k-notice amber"><FileText size={16} className="k-amber" /><span>This proposal has been issued and is locked. <Link className="k-link" href={`/organizer/sales/proposals/${id}`}>Open it</Link> and choose <b>Revise</b> to start a new version.</span></div></Card>;
}
