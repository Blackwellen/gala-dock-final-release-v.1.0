import Link from "next/link";
import { Lock } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { InvoiceWizard, type WizardInvoice } from "@/components/organizer/invoice-wizard";

export const metadata = { title: "Create invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  if (!ctx.canMoney) return <div className="k-card mn-lock"><Lock size={22} /><h1>Finance access needed</h1><p>Ask a workspace owner for Finance access to create invoices.</p><Link className="k-btn outline" href="/organizer">Back</Link></div>;
  const step = sp.step === "2" ? 2 : 1;
  const fromId = sp.from && /^[0-9a-f-]{36}$/i.test(sp.from) ? sp.from : null;
  const [{ data: events }, { data: clients }, { data: proposals }, { data: src }] = await Promise.all([
    sb.from("events").select("id,name,starts_at,ends_at,venue_name,location,cover_image,client_name,tags,status").eq("workspace_id", ctx.workspace.id).neq("status", "archived").order("starts_at", { ascending: false }).limit(50),
    sb.from("invoices").select("client_name,client_email,client_address,contact_name").eq("workspace_id", ctx.workspace.id).limit(200),
    sb.from("proposals").select("id,number,title,client_name,total,status,event_id,content").eq("workspace_id", ctx.workspace.id).in("status", ["accepted", "converted", "sent"]).order("created_at", { ascending: false }).limit(20),
    fromId ? sb.from("invoices").select("*,invoice_items(*),invoice_installments(*)").eq("id", fromId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const uniq = [...new Map((clients ?? []).filter(c => c.client_name).map(c => [c.client_name.toLowerCase(), c])).values()];
  const dup = sp.duplicate === "1";
  const s = src as unknown as (WizardInvoice & { id: string; status: string; invoice_items: WizardInvoice["items"]; invoice_installments: { due_date: string; label: string; amount: number }[] }) | null;
  const today = new Date().toISOString().slice(0, 10); const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const initial: WizardInvoice = s ? { id: dup || s.status !== "draft" ? null : s.id, client_name: s.client_name, client_email: s.client_email, client_address: (s.client_address ?? "").split(String.fromCharCode(10)).map(x => x.trim()).filter(Boolean).join(", "), contact_name: s.contact_name, event_id: s.event_id, reference: s.reference, currency: s.currency as WizardInvoice["currency"], issue_date: dup ? today : s.issue_date, due_date: dup ? due : s.due_date ?? due, po: "", notes: s.notes ?? "", items: [...(s.invoice_items ?? [])].sort((a, b) => (a as { sort?: number }).sort! - (b as { sort?: number }).sort!).map(i => ({ description: i.description, detail: i.detail, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate) })), instalments: (s.invoice_installments ?? []).map(x => ({ due_date: x.due_date, label: x.label, amount: Number(x.amount) })) }
    : { id: null, client_name: "", client_email: "", client_address: "", contact_name: "", event_id: sp.event ?? null, reference: "", currency: "GBP", issue_date: today, due_date: due, po: "", notes: "Thank you for your business. Please use the payment link for card or bank transfer.", items: [], instalments: [] };
  return <div className="iw">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Money", href: "/organizer/money" }, { label: "Invoices", href: "/organizer/money?tab=receivables" }, { label: initial.id ? "Edit invoice" : "New Invoice" }]} />
    <InvoiceWizard step={step} initial={initial} workspace={ctx.workspace.name}
      events={(events ?? []).map(e => ({ id: e.id, name: e.name, starts_at: e.starts_at, ends_at: e.ends_at, venue: [e.venue_name, e.location].filter(Boolean).join(", "), image: e.cover_image, client: e.client_name, tags: e.tags ?? [], status: e.status }))}
      clients={uniq.map(c => ({ name: c.client_name, email: c.client_email, address: c.client_address, contact: c.contact_name }))}
      proposals={(proposals ?? []).map(p => ({ id: p.id, label: `${p.number} · ${p.title}`, client: p.client_name, total: Number(p.total), event_id: p.event_id, lines: ((p.content as { lines?: { name?: string; description?: string; qty?: number; price?: number }[] } | null)?.lines ?? []) }))} />
  </div>;
}
