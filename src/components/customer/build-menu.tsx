"use client";
import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal, Columns3, Download, Printer, Copy, History, CreditCard } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { saveBuildVersion, checkoutBuild } from "@/lib/actions/build-engine";
import { money } from "@/lib/format";

type Row = { category: string; title: string; status: string; role: string; amount: number | null; deposit: number | null };
type Version = { version: number; label: string | null; created_at: string };
type Payable = { id: string; title: string; amount: number };
/** Package actions: compare options, save a version (Q15 snapshot), book & pay chosen lines (one payment per provider), export CSV,
 *  copy summary, print. */
export function PackageMenu({ eventId, eventName, rows, cat, versions = [], payable = [] }: { eventId: string; eventName: string; rows: Row[]; cat: string | null; versions?: Version[]; payable?: Payable[] }) {
  const toast = useKitToast(); const { run, pending } = useAction();
  const [dlg, setDlg] = useState<null | "version" | "pay">(null); const [label, setLabel] = useState(""); const [pick, setPick] = useState<string[]>([]);
  const openPay = () => { setPick(payable.map(p => p.id)); setDlg("pay"); };
  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = [["Category", "Provider", "Status", "Role", "Amount (GBP)", "Deposit (GBP)"], ...rows.map(r => [r.category, r.title, r.status, r.role, r.amount ?? "", r.deposit ?? ""])].map(r => r.map(esc).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = `${eventName.replace(/[^\w]+/g, "-").toLowerCase()}-package.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const summary = async () => {
    const total = rows.filter(r => r.role !== "backup").reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const text = `${eventName} — event package\n${rows.filter(r => r.role !== "backup").map(r => `• ${r.title} (${r.category}) — ${r.status}${r.amount != null ? ` · £${Number(r.amount).toLocaleString("en-GB")}` : ""}`).join("\n")}\nEstimated total: £${total.toLocaleString("en-GB")}`;
    try { await navigator.clipboard.writeText(text); toast("Package summary copied"); } catch { toast("Couldn't copy — your browser blocked clipboard access", "error"); }
  };
  return <><Menu label="Package actions" width={230} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Package actions"><MoreHorizontal size={16} /></button>}>
    {close => <>
      <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/build?compare=${cat ?? "all"}${cat ? `&cat=${cat}` : ""}`} onClick={close}><Columns3 size={14} />Compare options</Link>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); setLabel(""); setDlg("version"); }}><History size={14} />Save a version{versions[0] ? <small className="k-muted" style={{ marginLeft: "auto" }}>v{versions[0].version}</small> : null}</button>
      <button role="menuitem" className="k-menu-item" disabled={!payable.length} title={payable.length ? undefined : "Nothing is quoted or held yet"} onClick={() => { close(); openPay(); }}><CreditCard size={14} />Book &amp; pay…</button>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); csv(); }}><Download size={14} />Export as CSV</button>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); void summary(); }}><Copy size={14} />Copy package summary</button>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); window.print(); }}><Printer size={14} />Print package</button>
    </>}
  </Menu>
  <Dialog open={dlg === "version"} onClose={() => setDlg(null)} title="Save a version" sub="A snapshot of your lines and budget. Nothing is booked or changed.">
    <div className="k-col" style={{ gap: 12 }}><label className="k-field"><span>Name (optional)</span><input className="k-input" value={label} onChange={e => setLabel(e.target.value)} maxLength={120} placeholder="e.g. Before final quotes" /></label>
      {versions.length > 0 && <div className="k-xs k-muted">Saved: {versions.slice(0, 4).map(v => `v${v.version}${v.label ? ` ${v.label}` : ""} (${new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`).join(" · ")}</div>}
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className="k-btn primary" disabled={pending} onClick={async () => { const r = await run(() => saveBuildVersion(eventId, label || `Saved ${new Date().toLocaleDateString("en-GB")}`)); if (r.ok) setDlg(null); }}>Save version</button></div></div>
  </Dialog>
  <Dialog open={dlg === "pay"} onClose={() => setDlg(null)} title="Book & pay" sub="Each provider is paid separately on their own account. You'll pay the first deposit now; the rest stay payable from Money.">
    <div className="k-col" style={{ gap: 10 }}>{payable.map(p => <label key={p.id} className="k-check"><input type="checkbox" checked={pick.includes(p.id)} onChange={e => setPick(x => e.target.checked ? [...x, p.id] : x.filter(i => i !== p.id))} /><span className="k-grow">{p.title}</span><b className="k-small">{money(p.amount)}</b></label>)}
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => setDlg(null)}>Cancel</button><button className="k-btn primary" disabled={pending || !pick.length} onClick={async () => { const r = await run(() => checkoutBuild(eventId, pick), { refresh: false }); const url = (r as { data?: string }).data; if (r.ok && url) window.location.assign(url); else if (r.ok) setDlg(null); }}><CreditCard size={14} />Continue to payment</button></div></div>
  </Dialog></>;
}
