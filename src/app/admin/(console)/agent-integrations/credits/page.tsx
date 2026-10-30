import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Restricted } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import { dateShort, time } from "@/lib/format";
import { Head, Pill } from "../../_b/kit";
import { grantCredits, recordProviderInvoice } from "./actions";
import "@/styles/admin-b.css";
import "@/styles/admin-conversations.css";

export const metadata: Metadata = { title: "AI credits & pricing" };

type Price = { model: string; tier: string; provider: string; currency: string; input_per_mtok: number; cached_input_per_mtok: number; output_per_mtok: number; fx_to_gbp: number; source: string; updated_at: string };
type Pack = { id: string; name: string; credits: number; price_minor: number; currency: string; vat_treatment: string; worst_case_cost_minor: number; target_margin_bps: number; expiry_days: number | null; workspace_kinds: string[]; active: boolean };
type Entry = { id: string; workspace_id: string; kind: string; credits: number; reference: string; expires_at: string | null; created_at: string };
const gbp = (minor: number, cur = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format(minor / 100);
type Flag = { code: string; severity: "high" | "medium" | "low"; detail: string };
type Report = { month: string; flags: Flag[]; totals: { cost_minor: number; absorbed_cost_minor: number; allowance_cost_minor: number; pack_revenue_minor: number; overage_revenue_minor: number; calls: number; unbilled_plan_cost_minor: number; by_provider: Record<string, number> };
  workspaces: { workspace_id: string | null; name: string; kind: string | null; plan: string | null; calls: number; cost_minor: number; credits: number; from_allowance: number; from_balance: number; overage: number; pack_revenue_minor: number; overage_revenue_minor: number; margin_bps: number | null }[];
  packs: { name: string; active: boolean; credits: number; price_minor: number; margin_bps: number; target_bps: number }[];
  invoices: { provider: string; amount: number; currency: string; fx_to_gbp: number; reference: string; invoiced_minor: number; metered_minor: number }[]; revenue_per_pack_credit_minor: number };
/** Pence with sub-penny precision (AI cost is fractions of a penny per call). */
const pence = (minor: number) => Math.abs(Number(minor)) < 100 ? `${Number(minor).toFixed(2)}p` : gbp(Math.round(Number(minor)));
const pct = (bps: number | null) => bps == null ? "—" : `${(bps / 100).toFixed(1)}%`;

/** AI economics (agent economics spec): price book, credit packs (inactive until finance sign-off) and manual credit adjustments. */
export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? `${sp.month}-01` : null;
  const admin = await getAdmin();
  const ops = admin.permissions.has("agent_ops"), commerce = admin.permissions.has("commerce");
  if (!ops && !commerce) return <Restricted area="AI credits & pricing" />;
  const db = untyped(admin.db as never);
  const [{ data: prices }, { data: packs }, { data: ledger }, { data: workspaces }, { data: report, error: reportError }] = await Promise.all([
    db.from("ai_model_prices").select("*").order("tier"),
    db.from("credit_packs").select("*").order("credits"),
    ops ? db.from("ai_credit_ledger").select("id,workspace_id,kind,credits,reference,expires_at,created_at").in("kind", ["grant", "promo", "refund", "reversal"]).order("created_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    db.from("workspaces").select("id,name,kind").in("kind", ["organizer", "provider"]).order("name").limit(500),
    db.rpc("ai_profitability_report", { p_month: month }),
  ]);
  const R = report as Report | null;
  const monthKey = (R?.month ?? new Date().toISOString()).slice(0, 7);
  const prev = new Date(`${monthKey}-01T00:00:00Z`); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevMonth = prev.toISOString().slice(0, 7);
  const P = (prices ?? []) as Price[], K = (packs ?? []) as Pack[], L = (ledger ?? []) as Entry[], W = (workspaces ?? []) as { id: string; name: string; kind: string }[];
  const wsName = (id: string) => W.find(w => w.id === id)?.name ?? "Workspace";
  return <div className="adb acv">
    <Link className="adb-back" href="/admin/agent-integrations"><ArrowLeft aria-hidden="true" />Agent &amp; Integrations</Link>
    <Head title="AI credits & pricing" subtitle="Model price book, credit packs and manual credit adjustments for organiser and provider workspaces." />

    <section className="adb-panel" aria-labelledby="pf-h"><div className="adb-sec-h"><h2 id="pf-h">AI profitability — {monthKey}</h2>
        <span><Link className="adb-btn" href={`?month=${prevMonth}`}>Previous month</Link>{month && <Link className="adb-btn" href="?">This month</Link>}</span></div>
      {!R ? <p className="acv-note">The profitability report couldn’t be loaded{reportError ? ` (${reportError.message.slice(0, 80)})` : ""}.</p> : <>
        <p className="acv-hint">Metered provider cost from every AI call, revenue recognised from purchased credits and invoiced overage. Target margin 75% after card fees. A daily job alerts platform admins when a high-severity flag is present.</p>
        <table className="adb-table"><thead><tr><th>Metered cost</th><th>Platform-absorbed</th><th>Plan allowance cost</th><th>Unbilled paid-plan cost</th><th>Pack revenue</th><th>Overage revenue</th><th className="r">Calls</th></tr></thead>
          <tbody><tr><td><b>{pence(R.totals.cost_minor)}</b>{Object.keys(R.totals.by_provider ?? {}).length > 0 && <small> ({Object.entries(R.totals.by_provider).map(([k, v]) => `${k} ${pence(v)}`).join(", ")})</small>}</td>
            <td>{pence(R.totals.absorbed_cost_minor)}</td><td>{pence(R.totals.allowance_cost_minor)}</td><td>{pence(R.totals.unbilled_plan_cost_minor)}</td>
            <td>{pence(R.totals.pack_revenue_minor)}</td><td>{pence(R.totals.overage_revenue_minor)}</td><td className="r">{Number(R.totals.calls).toLocaleString("en-GB")}</td></tr></tbody></table>
        <h3>Flags</h3>
        {R.flags.length ? <ul className="acv-flags">{R.flags.map(f => <li key={f.code}><Pill status={f.severity === "high" ? "failed" : f.severity === "medium" ? "pending" : "neutral"} label={f.severity} /> <b>{f.code.replace(/_/g, " ")}</b> — {f.detail}</li>)}</ul> : <p className="adb-none">No flags this month.</p>}
        <h3>Per-workspace margin</h3>
        <table className="adb-table"><thead><tr><th>Workspace</th><th>Plan</th><th className="r">Calls</th><th className="r">Credits</th><th className="r">From allowance</th><th className="r">From purchased</th><th className="r">Overage</th><th className="r">Cost</th><th className="r">Revenue</th><th className="r">Margin</th></tr></thead>
          <tbody>{R.workspaces.length ? R.workspaces.slice(0, 50).map(w => <tr key={w.workspace_id ?? "absorbed"}><td><b>{w.name}</b>{w.kind ? <small> · {w.kind}</small> : null}</td><td>{w.plan ?? "—"}</td>
            <td className="r">{w.calls}</td><td className="r">{Number(w.credits).toFixed(2)}</td><td className="r">{Number(w.from_allowance).toFixed(2)}</td><td className="r">{Number(w.from_balance).toFixed(2)}</td><td className="r">{Number(w.overage).toFixed(2)}</td>
            <td className="r">{pence(w.cost_minor)}</td><td className="r">{pence(Number(w.pack_revenue_minor) + Number(w.overage_revenue_minor))}</td><td className="r">{pct(w.margin_bps)}</td></tr>)
            : <tr><td colSpan={10} className="adb-none">No AI usage this month.</td></tr>}</tbody></table>
        {R.workspaces.length > 50 && <p className="acv-hint">Showing the 50 highest-cost workspaces of {R.workspaces.length}.</p>}
        <h3>Credit pack margins (worst case, after card fees)</h3>
        <table className="adb-table"><thead><tr><th>Pack</th><th className="r">Credits</th><th className="r">Price</th><th className="r">Margin</th><th className="r">Target</th><th>Activation</th></tr></thead>
          <tbody>{R.packs.map(k => <tr key={k.name}><td><b>{k.name}</b></td><td className="r">{Number(k.credits).toLocaleString("en-GB")}</td><td className="r">{gbp(k.price_minor)}</td><td className="r">{pct(k.margin_bps)}</td><td className="r">{pct(k.target_bps)}</td>
            <td><Pill status={k.margin_bps >= k.target_bps ? "resolved" : "failed"} label={k.margin_bps >= k.target_bps ? "Meets target" : "Below target: guard refuses"} /></td></tr>)}</tbody></table>
        <h3>Provider invoices vs meter</h3>
        <table className="adb-table"><thead><tr><th>Provider</th><th>Reference</th><th className="r">Invoice</th><th className="r">Invoiced (GBP)</th><th className="r">Metered</th></tr></thead>
          <tbody>{R.invoices.length ? R.invoices.map(i => <tr key={i.provider}><td>{i.provider}</td><td>{i.reference}</td><td className="r">{i.currency} {Number(i.amount).toFixed(2)}</td><td className="r">{pence(i.invoiced_minor)}</td><td className="r">{pence(i.metered_minor)}</td></tr>)
            : <tr><td colSpan={5} className="adb-none">No provider invoice recorded for {monthKey}.</td></tr>}</tbody></table>
        {commerce && <ActionForm action={recordProviderInvoice} resetOnSuccess className="acv-grant-form">
          <label>Provider<select className="adb-select" name="provider" required defaultValue="azure_openai"><option value="azure_openai">Azure OpenAI</option><option value="anthropic">Anthropic</option></select></label>
          <label>Month<input name="month" type="month" required defaultValue={monthKey} /></label>
          <label>Amount<input name="amount" type="number" step="0.0001" min="0" required placeholder="e.g. 12.40" /></label>
          <label>Currency<input name="currency" required defaultValue="USD" maxLength={3} pattern="[A-Za-z]{3}" /></label>
          <label>FX to GBP<input name="fx" type="number" step="0.000001" min="0.000001" required defaultValue="0.79" /></label>
          <label className="wide">Invoice number<input name="reference" required minLength={3} maxLength={200} placeholder="Provider invoice reference" /></label>
          <button type="submit" className="adb-btn primary">Record provider invoice</button>
        </ActionForm>}
      </>}
    </section>

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
