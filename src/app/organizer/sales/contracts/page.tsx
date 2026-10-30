import Link from "next/link";
import { FileSignature } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { untyped, rows } from "@/lib/workspace/db";
import { Crumbs, Card, Chip, Empty } from "@/components/kit";
import { SalesNav } from "@/components/organizer/sales-nav";
import { NewContractButton } from "@/components/organizer/crm-client";
import { signatureHealth } from "@/lib/contracts/signature-provider";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Contracts" };
const TONE: Record<string, "green" | "blue" | "amber" | "red" | "gray"> = { draft: "gray", sent: "blue", signed: "green", declined: "red", expired: "amber", void: "gray" };

export default async function ContractsPage({ searchParams }: PageProps<"/organizer/sales/contracts">) {
  const sp = await searchParams; const ctx = await getOrganizer(); const db = untyped(ctx.supabase);
  const status = typeof sp.status === "string" && TONE[sp.status] ? sp.status : "";
  let q = db.from("contracts").select("id,number,title,status,value,currency,expires_at,signed_at,created_at,current_version,clients(name),events(id,name)").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }).limit(300);
  if (status) q = q.eq("status", status);
  const [list, clients, proposals, templates] = await Promise.all([
    rows<{ id: string; number: string; title: string; status: string; value: number; currency: string; expires_at: string | null; signed_at: string | null; current_version: number; clients: { name: string } | null; events: { id: string; name: string } | null }>(q),
    rows<{ id: string; name: string }>(db.from("clients").select("id,name").eq("workspace_id", ctx.workspace.id).eq("status", "active").order("name_key").limit(300)),
    rows<{ id: string; number: string; title: string }>(db.from("proposals").select("id,number,title").eq("workspace_id", ctx.workspace.id).in("status", ["accepted", "converted"]).order("number", { ascending: false }).limit(100)),
    rows<{ id: string; name: string }>(db.from("contract_templates").select("id,name").eq("workspace_id", ctx.workspace.id).eq("status", "active").order("name")),
  ]);
  const sig = signatureHealth();
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales", href: "/organizer/sales" }, { label: "Contracts" }]} />
    <div className="k-page-head"><div><h1 style={{ fontSize: 30 }}>Contracts</h1><p className="sub">Versioned client contracts: draft, send, sign, renew. Signed contracts are locked.</p></div><NewContractButton clients={clients} proposals={proposals} templates={templates} /></div>
    <SalesNav active="contracts" />
    {sig.state !== "ok" && <div className="k-notice amber" style={{ marginBottom: 12 }}><span className="k-small">No e-signature provider is connected. Clients sign through a secure link with their typed name; the version fingerprint, email and time are recorded.</span></div>}
    <Card flush>
      <nav className="k-row k-wrap" style={{ gap: 6, padding: 12 }} aria-label="Status filter">{["", "draft", "sent", "signed", "declined", "expired", "void"].map(s => <Link key={s || "all"} className={`k-chip ${status === s ? "solid-blue" : ""}`} href={s ? `/organizer/sales/contracts?status=${s}` : "/organizer/sales/contracts"}>{s || "All"}</Link>)}</nav>
      {list.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Contract</th><th>Title</th><th>Client</th><th>Event</th><th>Version</th><th className="num">Value</th><th>Sign by</th><th>Status</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.id}><td><Link className="k-link" href={`/organizer/sales/contracts/${c.id}`}>{c.number}</Link></td><td>{c.title}</td><td>{c.clients?.name ?? "—"}</td><td>{c.events ? <Link className="k-link" href={`/organizer/events/${c.events.id}`}>{c.events.name}</Link> : "—"}</td><td>v{c.current_version}</td><td className="num">{money(c.value, c.currency)}</td><td>{c.status === "signed" && c.signed_at ? `Signed ${dateShort(c.signed_at)}` : c.expires_at ? dateShort(`${c.expires_at}T12:00:00Z`) : "—"}</td><td><Chip tone={TONE[c.status]}>{c.status}</Chip></td></tr>)}</tbody></table></div>
        : <div style={{ padding: 20 }}><Empty icon={FileSignature} title={status ? `No ${status} contracts` : "No contracts yet"} text="Create one from an accepted proposal so the client and value carry across." /></div>}
    </Card>
  </>;
}
