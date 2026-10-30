import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { untyped, rows } from "@/lib/workspace/db";
import { Crumbs, Card, Chip, Empty } from "@/components/kit";
import { SalesNav } from "@/components/organizer/sales-nav";
import { NewClientButton } from "@/components/organizer/crm-client";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Clients" };
type Row = { id: string; name: string; kind: string; email: string; status: string; owner_name: string; created_at: string };

/** Canonical client register (domain 52). Values come from linked proposals/events, not free-text copies. */
export default async function ClientsPage({ searchParams }: PageProps<"/organizer/sales/clients">) {
  const sp = await searchParams; const ctx = await getOrganizer(); const db = untyped(ctx.supabase);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : ""; const showArchived = sp.archived === "1";
  let query = db.from("clients").select("id,name,kind,email,status,owner_name,created_at").eq("workspace_id", ctx.workspace.id).neq("status", "merged").order("name_key").limit(500);
  if (!showArchived) query = query.eq("status", "active");
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const clients = await rows<Row>(query);
  const ids = clients.map(c => c.id);
  const [props, events, leads] = ids.length ? await Promise.all([
    rows<{ client_id: string; status: string; total: number; accepted_total: number | null }>(db.from("proposals").select("client_id,status,total,accepted_total").in("client_id", ids)),
    rows<{ client_id: string; starts_at: string | null }>(db.from("events").select("client_id,starts_at").in("client_id", ids)),
    rows<{ client_id: string; stage: string }>(db.from("leads").select("client_id,stage").in("client_id", ids)),
  ]) : [[], [], []];
  const stat = (id: string) => ({ won: props.filter(p => p.client_id === id && ["accepted", "converted"].includes(p.status)).reduce((s, p) => s + Number(p.accepted_total ?? p.total), 0), events: events.filter(e => e.client_id === id).length, open: leads.filter(l => l.client_id === id && !["won", "lost"].includes(l.stage)).length, next: events.filter(e => e.client_id === id && e.starts_at && e.starts_at > new Date().toISOString()).map(e => e.starts_at!).sort()[0] ?? null });
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales", href: "/organizer/sales" }, { label: "Clients" }]} />
    <div className="k-page-head"><div><h1 style={{ fontSize: 30 }}>Clients</h1><p className="sub">One record per client — leads, proposals, contracts and events link here.</p></div><NewClientButton /></div>
    <SalesNav active="clients" />
    <Card flush>
      <form className="k-row k-wrap" style={{ gap: 8, padding: 14 }} action="/organizer/sales/clients" role="search"><div className="k-input-icon"><Search size={14} /><input className="k-input" name="q" defaultValue={q} placeholder="Search clients…" aria-label="Search clients" style={{ width: 240 }} /></div>
        <label className="k-check"><input type="checkbox" name="archived" value="1" defaultChecked={showArchived} /><span>Include archived</span></label><button className="k-btn ghost">Apply</button></form>
      {clients.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Client</th><th>Type</th><th>Email</th><th>Open leads</th><th>Events</th><th>Next event</th><th className="num">Won value</th><th>Status</th></tr></thead>
        <tbody>{clients.map(c => { const s = stat(c.id); return <tr key={c.id}><td><Link className="k-link" href={`/organizer/sales/clients/${c.id}`}><b>{c.name}</b></Link></td><td>{c.kind === "individual" ? "Individual" : "Company"}</td><td className="k-small">{c.email || "—"}</td><td>{s.open}</td><td>{s.events}</td><td>{s.next ? dateShort(s.next) : "—"}</td><td className="num">{money(s.won)}</td><td><Chip tone={c.status === "active" ? "green" : "gray"}>{c.status}</Chip></td></tr>; })}</tbody></table></div>
        : <div style={{ padding: 20 }}><Empty icon={Building2} title={q ? "No clients match" : "No clients yet"} text="Clients are created when you add a lead or proposal, or here." action={<NewClientButton />} /></div>}
    </Card>
  </>;
}
