import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { untyped, rows, isUuid } from "@/lib/workspace/db";
import { Crumbs, Card, Chip } from "@/components/kit";
import { SalesNav } from "@/components/organizer/sales-nav";
import { ClientEditor, ClientContacts, MergeClientButton } from "@/components/organizer/crm-client";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Client" };
type Overview = {
  client: { id: string; name: string; kind: string; email: string; phone: string; website: string; notes: string; billing_name: string; billing_email: string; billing_address: string; vat_number: string; status: string; created_at: string };
  contacts: { id: string; name: string; email: string; phone: string; role: string; is_primary: boolean }[];
  leads: { id: string; reference: string; name: string; stage: string; value: number }[];
  proposals: { id: string; number: string; title: string; status: string; version: number; total: number }[];
  events: { id: string; name: string; status: string; starts_at: string | null }[];
  billing: { contracted: number; invoiced: number; paid: number; can_edit: boolean };
  history: { at: string; event: string; metadata: Record<string, unknown> }[];
};

export default async function ClientPage({ params }: PageProps<"/organizer/sales/clients/[id]">) {
  const { id } = await params; if (!isUuid(id)) notFound();
  const ctx = await getOrganizer(); const db = untyped(ctx.supabase);
  const { data } = await db.rpc("client_overview", { p_client: id }); const o = data as Overview | null;
  if (!o || (o.client as unknown as { workspace_id: string }).workspace_id !== ctx.workspace.id) notFound();
  if (o.client.id !== id) redirect(`/organizer/sales/clients/${o.client.id}`);   // merged duplicate → the kept record
  const [contracts, others] = await Promise.all([
    rows<{ id: string; number: string; title: string; status: string; value: number }>(db.from("contracts").select("id,number,title,status,value").eq("client_id", id).order("created_at", { ascending: false })),
    rows<{ id: string; name: string }>(db.from("clients").select("id,name").eq("workspace_id", ctx.workspace.id).eq("status", "active").neq("id", id).order("name_key").limit(300)),
  ]);
  const c = o.client;
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales", href: "/organizer/sales" }, { label: "Clients", href: "/organizer/sales/clients" }, { label: c.name }]} />
    <div className="k-page-head"><div><h1 style={{ fontSize: 28 }}>{c.name} {c.status !== "active" && <Chip tone="gray">{c.status}</Chip>}</h1><p className="sub">{c.kind === "individual" ? "Individual" : "Company"} · client since {dateShort(c.created_at)}</p></div>
      <div className="k-row" style={{ gap: 8 }}><MergeClientButton keepId={c.id} others={others} /><Link className="k-btn outline" href={`/organizer/proposals/new?step=1`}>New proposal</Link></div></div>
    <SalesNav active="clients" />
    <div className="k-grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 14 }}>
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card><h2 className="ov-h" style={{ marginBottom: 10 }}>Events</h2>{o.events.length ? <table className="k-table"><tbody>{o.events.map(e => <tr key={e.id}><td><Link className="k-link" href={`/organizer/events/${e.id}`}>{e.name}</Link></td><td>{e.starts_at ? dateShort(e.starts_at) : "Date TBC"}</td><td><Chip tone="blue">{e.status}</Chip></td></tr>)}</tbody></table> : <p className="k-small k-muted">No events yet.</p>}</Card>
        <Card><h2 className="ov-h" style={{ marginBottom: 10 }}>Leads &amp; proposals</h2><table className="k-table"><tbody>
          {o.leads.map(l => <tr key={l.id}><td><Link className="k-link" href={`/organizer/sales/leads/${l.id}`}>{l.reference}</Link></td><td>{l.name}</td><td><Chip tone={l.stage === "won" ? "green" : l.stage === "lost" ? "red" : "blue"}>{l.stage}</Chip></td><td className="num">{money(l.value)}</td></tr>)}
          {o.proposals.map(p => <tr key={p.id}><td><Link className="k-link" href={`/organizer/sales/proposals/${p.id}`}>{p.number}</Link></td><td>{p.title} · v{p.version}</td><td><Chip tone={["accepted", "converted"].includes(p.status) ? "green" : "gray"}>{p.status}</Chip></td><td className="num">{money(p.total)}</td></tr>)}
          {contracts.map(k => <tr key={k.id}><td><Link className="k-link" href={`/organizer/sales/contracts/${k.id}`}>{k.number}</Link></td><td>{k.title}</td><td><Chip tone={k.status === "signed" ? "green" : "gray"}>{k.status}</Chip></td><td className="num">{money(k.value)}</td></tr>)}
          {!o.leads.length && !o.proposals.length && !contracts.length && <tr><td className="k-small k-muted">Nothing linked yet.</td></tr>}</tbody></table></Card>
        <Card><h2 className="ov-h" style={{ marginBottom: 10 }}>History</h2><ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>{o.history.slice(0, 30).map((h, i) => <li key={i} className="k-between k-small"><span>{String(h.metadata?.title ?? h.event.replace(/[._]/g, " "))}</span><span className="k-muted">{dateShort(h.at)}</span></li>)}{!o.history.length && <li className="k-small k-muted">No history yet.</li>}</ul></Card>
      </div>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Billing</h2><table className="k-table"><tbody><tr><td>Contracted</td><td className="num">{money(o.billing.contracted)}</td></tr><tr><td>Invoiced</td><td className="num">{money(o.billing.invoiced)}</td></tr><tr><td>Paid</td><td className="num">{money(o.billing.paid)}</td></tr></tbody></table></Card>
        <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Contacts</h2><ClientContacts clientId={c.id} contacts={o.contacts} /></Card>
        <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Details</h2><ClientEditor c={c} canBilling={o.billing.can_edit} /></Card>
      </div>
    </div>
  </>;
}
