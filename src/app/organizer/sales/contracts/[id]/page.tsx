import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { untyped, rows, one, isUuid } from "@/lib/workspace/db";
import { Crumbs, Card, Chip } from "@/components/kit";
import { SalesNav } from "@/components/organizer/sales-nav";
import { ContractEditor, ContractActions } from "@/components/organizer/crm-client";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Contract" };
type C = { id: string; number: string; title: string; status: string; value: number; currency: string; expires_at: string | null; current_version: number; sent_version: number | null; share_token: string | null; share_revoked_at?: string | null; status_reason: string; renewal_of: string | null; signed_at: string | null;
  clients: { id: string; name: string } | null; events: { id: string; name: string } | null; proposals: { id: string; number: string } | null };
type Party = { id: string; role: "organizer" | "client" | "other"; name: string; email: string; organisation: string; signs: boolean; signing_order: number; status: string; signed_at: string | null };

export default async function ContractPage({ params }: PageProps<"/organizer/sales/contracts/[id]">) {
  const { id } = await params; if (!isUuid(id)) notFound();
  const ctx = await getOrganizer(); const db = untyped(ctx.supabase);
  const c = await one<C>(db.from("contracts").select("id,number,title,status,value,currency,expires_at,current_version,sent_version,share_token,share_revoked_at,status_reason,renewal_of,signed_at,clients(id,name),events(id,name),proposals(id,number)").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle());
  if (!c) notFound();
  const [versions, parties, sigs, approvals] = await Promise.all([
    rows<{ version: number; body: string; document_hash: string; created_at: string }>(db.from("contract_versions").select("version,body,document_hash,created_at").eq("contract_id", id).order("version", { ascending: false })),
    rows<Party>(db.from("contract_parties").select("id,role,name,email,organisation,signs,signing_order,status,signed_at").eq("contract_id", id).order("signing_order")),
    rows<{ party_id: string; version: number; typed_name: string; method: string; signed_at: string; document_hash: string }>(db.from("contract_signatures").select("party_id,version,typed_name,method,signed_at,document_hash").eq("contract_id", id).order("signed_at", { ascending: false })),
    rows<{ id: string; version: number; status: string; requested_by: string; reason: string; decision_note: string; created_at: string }>(db.from("contract_approvals").select("id,version,status,requested_by,reason,decision_note,created_at").eq("contract_id", id).order("created_at", { ascending: false })),
  ]);
  const current = versions.find(v => v.version === c.current_version);
  const pending = approvals.find(a => a.status === "pending");
  const canDecide = ["owner", "manager", "finance"].includes(String(ctx.role));
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Sales", href: "/organizer/sales" }, { label: "Contracts", href: "/organizer/sales/contracts" }, { label: c.number }]} />
    <div className="k-page-head"><div><h1 style={{ fontSize: 28 }}>{c.title} <Chip tone={c.status === "signed" ? "green" : c.status === "sent" ? "blue" : "gray"} lg>{c.status}</Chip></h1>
      <p className="sub">{c.number} · v{c.current_version}{c.clients ? <> · <Link className="k-link" href={`/organizer/sales/clients/${c.clients.id}`}>{c.clients.name}</Link></> : null}{c.events ? <> · <Link className="k-link" href={`/organizer/events/${c.events.id}`}>{c.events.name}</Link></> : null}{c.proposals ? <> · from <Link className="k-link" href={`/organizer/sales/proposals/${c.proposals.id}`}>{c.proposals.number}</Link></> : null}</p></div></div>
    <SalesNav active="contracts" />
    {c.status_reason && <div className="k-notice amber" style={{ marginBottom: 12 }}><span className="k-small">{c.status_reason}</span></div>}
    <div className="k-grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 14 }}>
      <Card><ContractEditor id={c.id} status={c.status} body={current?.body ?? ""} parties={parties} /></Card>
      <div className="k-col" style={{ gap: 14 }}>
        <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Actions</h2>
          <ContractActions id={c.id} status={c.status} value={Number(c.value)} shareUrl={c.share_token && !c.share_revoked_at ? `/contract/${c.share_token}` : null} linkRevoked={!!c.share_revoked_at} organizerParties={parties.filter(p => p.role === "organizer" && p.signs).map(p => ({ id: p.id, name: p.name, status: p.status }))} approval={pending ? { id: pending.id, status: pending.status, mine: pending.requested_by === ctx.user.id } : null} canDecide={canDecide} />
          <table className="k-table" style={{ marginTop: 12 }}><tbody><tr><td>Value</td><td className="num">{money(c.value, c.currency)}</td></tr><tr><td>Sign by</td><td className="num">{c.expires_at ? dateShort(`${c.expires_at}T12:00:00Z`) : "—"}</td></tr><tr><td>Sent version</td><td className="num">{c.sent_version ? `v${c.sent_version}` : "—"}</td></tr></tbody></table></Card>
        <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Signatures</h2><ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>{sigs.map((s, i) => <li key={i} className="k-small"><b>{s.typed_name || parties.find(p => p.id === s.party_id)?.name}</b> · v{s.version} · {dateShort(s.signed_at)}<div className="k-xs k-muted" style={{ wordBreak: "break-all" }}>{s.method} · {s.document_hash.slice(0, 16)}…</div></li>)}{!sigs.length && <li className="k-small k-muted">No signatures yet.</li>}</ul></Card>
        <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Versions &amp; approvals</h2><ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>{versions.map(v => <li key={v.version} className="k-between k-small"><span>v{v.version}</span><span className="k-muted">{dateShort(v.created_at)}</span></li>)}{approvals.map(a => <li key={a.id} className="k-between k-small"><span>Approval v{a.version}: {a.status}</span><span className="k-muted">{dateShort(a.created_at)}</span></li>)}</ul></Card>
      </div>
    </div>
  </>;
}
