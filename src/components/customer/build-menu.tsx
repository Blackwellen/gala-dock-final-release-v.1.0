"use client";
import Link from "next/link";
import { MoreHorizontal, Columns3, Download, Printer, Copy } from "lucide-react";
import { Menu, useKitToast } from "@/components/kit/client";

type Row = { category: string; title: string; status: string; role: string; amount: number | null; deposit: number | null };
/** Package actions: compare options, export CSV, copy summary, print. */
export function PackageMenu({ eventId, eventName, rows, cat }: { eventId: string; eventName: string; rows: Row[]; cat: string | null }) {
  const toast = useKitToast();
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
  return <Menu label="Package actions" width={230} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Package actions"><MoreHorizontal size={16} /></button>}>
    {close => <>
      <Link role="menuitem" className="k-menu-item" href={`/account/events/${eventId}/build?compare=${cat ?? "all"}${cat ? `&cat=${cat}` : ""}`} onClick={close}><Columns3 size={14} />Compare options</Link>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); csv(); }}><Download size={14} />Export as CSV</button>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); void summary(); }}><Copy size={14} />Copy package summary</button>
      <button role="menuitem" className="k-menu-item" onClick={() => { close(); window.print(); }}><Printer size={14} />Print package</button>
    </>}
  </Menu>;
}
