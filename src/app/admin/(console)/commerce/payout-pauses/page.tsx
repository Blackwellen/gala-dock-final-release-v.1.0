import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { requireAdminPermission } from "@/lib/admin/context";
import { dateShort, time } from "@/lib/format";
import { Head } from "../../_b/kit";
import { PauseForm, LiftForm, basisLabel } from "./forms";
import "@/styles/admin-b.css";
import "@/styles/admin-disputes.css";

export const metadata: Metadata = { title: "Payout pauses" };
const stamp = (iso: string | null) => iso ? `${dateShort(iso)} ${time(iso)}` : "—";

/** DEC-107 payout pauses: active and past pauses, with basis, reference, who and when. The RPCs enforce aal2 + basis + audit. */
export default async function PayoutPausesPage() {
  const { db, allowed } = await requireAdminPermission("commerce");
  if (!allowed) return <Restricted area="Payout pauses" />;
  const [{ data: pauses }, { data: sellers }] = await Promise.all([
    db.from("payout_pauses" as never).select("id,workspace_id,basis,reference,note,created_by,created_at,lifted_at,lift_note").order("created_at", { ascending: false }).limit(200),
    db.from("connect_accounts" as never).select("workspace_id,workspaces(name)").not("stripe_account_id", "is", null).limit(500),
  ]);
  type P = { id: string; workspace_id: string; basis: string; reference: string; note: string | null; created_at: string; lifted_at: string | null; lift_note: string | null };
  const list = (pauses ?? []) as unknown as P[];
  const opts = ((sellers ?? []) as unknown as { workspace_id: string; workspaces: { name: string } | null }[]).map(s => ({ id: s.workspace_id, name: s.workspaces?.name ?? s.workspace_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = new Map(opts.map(o => [o.id, o.name]));
  const active = list.filter(p => !p.lifted_at), past = list.filter(p => p.lifted_at);
  const rows = (ps: P[], live: boolean) => ps.map(p => <tr key={p.id}><td><b>{names.get(p.workspace_id) ?? p.workspace_id.slice(0, 8)}</b></td><td>{basisLabel(p.basis)}</td><td>{p.reference}</td>
    <td>{stamp(p.created_at)}</td><td>{live ? <LiftForm id={p.id} /> : `${stamp(p.lifted_at)} · ${p.lift_note ?? ""}`}</td></tr>);
  return <div className="adb add">
    <Head title="Payout pauses" subtitle="Pause a seller’s payouts only on a legal basis in the Payment Terms, with a reference. Every pause and lift is audited and the seller is told." />
    <section className="adb-panel" aria-labelledby="pp-active"><h2 id="pp-active">Active pauses ({active.length})</h2>
      <table className="adb-table"><thead><tr><th>Seller</th><th>Basis</th><th>Reference</th><th>Paused</th><th>Lift</th></tr></thead>
        <tbody>{active.length ? rows(active, true) : <tr><td colSpan={5} className="add-muted">No active pauses.</td></tr>}</tbody></table></section>
    <section className="adb-panel" aria-labelledby="pp-new"><h2 id="pp-new">Pause a seller’s payouts</h2><PauseForm sellers={opts} /></section>
    {past.length > 0 && <section className="adb-panel" aria-labelledby="pp-past"><h2 id="pp-past">Lifted</h2>
      <table className="adb-table"><thead><tr><th>Seller</th><th>Basis</th><th>Reference</th><th>Paused</th><th>Lifted</th></tr></thead><tbody>{rows(past, false)}</tbody></table></section>}
  </div>;
}
