import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { dateShort, time } from "@/lib/format";
import { Head, Pill } from "../../_b/kit";
import { grantCredits } from "./actions";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "AI credits & pricing" };

type Price = { model: string; tier: string; provider: string; currency: string; input_per_mtok: number; cached_input_per_mtok: number; output_per_mtok: number; fx_to_gbp: number; source: string; updated_at: string };
type Pack = { id: string; name: string; credits: number; price_minor: number; currency: string; vat_treatment: string; worst_case_cost_minor: number; target_margin_bps: number; expiry_days: number | null; workspace_kinds: string[]; active: boolean };
type Entry = { id: string; workspace_id: string; kind: string; credits: number; reference: string; expires_at: string | null; created_at: string };
const gbp = (minor: number, cur = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format(minor / 100);

/** AI economics (agent economics spec): price book, credit packs (inactive until finance sign-off) and manual credit adjustments. */
export default async function CreditsPage() {
  const admin = await getAdmin();
  const ops = admin.permissions.has("agent_ops"), commerce = admin.permissions.has("commerce");
  if (!ops && !commerce) return <Restricted area="AI credits & pricing" />;
  const db = untyped(admin.db as never);
  const [{ data: prices }, { data: packs }, { data: ledger }, { data: workspaces }] = await Promise.all([
    db.from("ai_model_prices").select("*").order("tier"),
    db.from("credit_packs").select("*").order("credits"),
    ops ? db.from("ai_credit_ledger").select("id,workspace_id,kind,credits,reference,expires_at,created_at").in("kind", ["grant", "promo", "refund", "reversal"]).order("created_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    db.from("workspaces").select("id,name,kind").in("kind", ["organizer", "provider"]).order("name").limit(500),
  ]);
  const P = (prices ?? []) as Price[], K = (packs ?? []) as Pack[], L = (ledger ?? []) as Entry[], W = (workspaces ?? []) as { id: string; name: string; kind: string }[];
  const wsName = (id: string) => W.find(w => w.id === id)?.name ?? "Workspace";
  return <div className="adb acv">
    <Link className="adb-back" href="/admin/agent-integrations"><ArrowLeft aria-hidden="true" />Agent &amp; Integrations</Link>
    <Head title="AI credits & pricing" subtitle="Model price book, credit packs and manual credit adjustments for organiser and provider workspaces." />

    <section className="adb-panel"><div className="adb-sec-h"><h2>Model price book</h2></div>
      {P.some(p => p.source === "estimate") && <p className="acv-note">Some prices are estimates. Replace them with contract or list prices before activating credit packs.</p>}
      <table className="adb-table"><thead><tr><th>Model</th><th>Tier</th><th>Provider</th><th className="r">Input / 1M tokens</th><th className="r">Cached input</th><th className="r">Output / 1M tokens</th><th className="r">FX → GBP</th><th>Source</th><th>Updated</th></tr></thead>
        <tbody>{P.length ? P.map(p => <tr key={p.model}><td><b>{p.model}</b></td><td>{p.tier}</td><td>{p.provider}</td><td className="r">{p.currency} {Number(p.input_per_mtok).toFixed(2)}</td><td className="r">{p.currency} {Number(p.cached_input_per_mtok).toFixed(2)}</td>
          <td className="r">{p.currency} {Number(p.output_per_mtok).toFixed(2)}</td><td className="r">{Number(p.fx_to_gbp).toFixed(3)}</td><td><Pill status={p.source === "estimate" ? "pending" : "resolved"} label={p.source} /></td><td>{dateShort(p.updated_at)}</td></tr>)
          : <tr><td colSpan={9} className="adb-none">No prices recorded.</td></tr>}</tbody></table></section>

    <section className="adb-panel"><div className="adb-sec-h"><h2>Credit packs</h2></div>
      <p className="acv-hint">Packs are created inactive. Finance activates them after the economics sign-off.</p>
      <table className="adb-table"><thead><tr><th>Pack</th><th className="r">Credits</th><th className="r">Price</th><th>VAT</th><th className="r">Worst-case cost</th><th className="r">Target margin</th><th>Expiry</th><th>For</th><th>Status</th></tr></thead>
        <tbody>{K.length ? K.map(k => <tr key={k.id}><td><b>{k.name}</b></td><td className="r">{Number(k.credits).toLocaleString("en-GB")}</td><td className="r">{gbp(k.price_minor, k.currency)}</td><td>{k.vat_treatment.replace(/_/g, " ")}</td>
          <td className="r">{gbp(k.worst_case_cost_minor, k.currency)}</td><td className="r">{(k.target_margin_bps / 100).toFixed(1)}%</td><td>{k.expiry_days ? `${k.expiry_days} days` : "None"}</td><td>{k.workspace_kinds.join(", ")}</td>
          <td><Pill status={k.active ? "resolved" : "neutral"} label={k.active ? "Active" : "Inactive"} /></td></tr>)
          : <tr><td colSpan={9} className="adb-none">No credit packs defined.</td></tr>}</tbody></table></section>

    {ops && <section className="adb-panel acv-gate"><h2>Adjust a workspace’s credits</h2>
      <p>For goodwill grants, promotions, refunds of failed runs, or reversing a mistaken grant. Every adjustment is recorded in the credit ledger and the audit log.</p>
      <ActionForm action={grantCredits} resetOnSuccess className="acv-grant-form">
        <label>Workspace<select className="adb-select" name="workspace" required defaultValue=""><option value="" disabled>Choose…</option>{W.map(w => <option key={w.id} value={w.id}>{w.name} ({w.kind})</option>)}</select></label>
        <label>Type<select className="adb-select" name="kind" defaultValue="grant"><option value="grant">Grant</option><option value="promo">Promotion</option><option value="refund">Refund</option><option value="reversal">Reversal (negative)</option></select></label>
        <label>Credits<input name="credits" type="number" step="0.001" required placeholder="e.g. 500" /></label>
        <label>Expires <small>(optional)</small><input name="expires" type="date" /></label>
        <label className="wide">Reference<input name="reference" required minLength={3} maxLength={200} placeholder="Ticket, case or reason, e.g. SUP-4421 goodwill" /></label>
        <button type="submit" className="adb-btn primary">Record adjustment</button>
      </ActionForm></section>}

    {ops && <section className="adb-panel"><div className="adb-sec-h"><h2>Recent manual adjustments</h2></div>
      <table className="adb-table"><thead><tr><th>When</th><th>Workspace</th><th>Type</th><th className="r">Credits</th><th>Reference</th><th>Expires</th></tr></thead>
        <tbody>{L.length ? L.map(e => <tr key={e.id}><td>{dateShort(e.created_at)} {time(e.created_at)}</td><td>{wsName(e.workspace_id)}</td><td>{e.kind}</td><td className="r">{Number(e.credits) > 0 ? "+" : ""}{Number(e.credits).toLocaleString("en-GB")}</td>
          <td>{e.reference}</td><td>{e.expires_at ? dateShort(e.expires_at) : "—"}</td></tr>) : <tr><td colSpan={6} className="adb-none">No manual adjustments yet.</td></tr>}</tbody></table></section>}
  </div>;
}
