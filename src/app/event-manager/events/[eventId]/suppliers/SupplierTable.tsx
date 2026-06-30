"use client";

import { useState, useCallback } from "react";
import { Pencil, Check, X, Loader2, CheckCircle2, Clock, AlertCircle, XCircle, Mail, Phone } from "lucide-react";
import { updateEventSupplierField } from "./actions";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  confirmed:   { label: "Confirmed",   className: "bg-success-100 text-success-700 border-success-200" },
  shortlisted: { label: "Shortlisted", className: "bg-blue-100 text-blue-700 border-blue-200" },
  contacted:   { label: "Contacted",   className: "bg-warning-100 text-warning-700 border-warning-200" },
  declined:    { label: "Declined",    className: "bg-danger-100 text-danger-700 border-danger-200" },
  cancelled:   { label: "Cancelled",   className: "bg-surface-100 text-surface-500 border-surface-200" },
};

function statusStyle(s: string | null) {
  return STATUS_STYLES[(s ?? "shortlisted").toLowerCase()] ?? STATUS_STYLES.shortlisted;
}

function StatusIcon({ status }: { status: string | null }) {
  const s = (status ?? "shortlisted").toLowerCase();
  if (s === "confirmed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === "declined" || s === "cancelled") return <XCircle className="h-3.5 w-3.5" />;
  if (s === "contacted") return <Clock className="h-3.5 w-3.5" />;
  return <AlertCircle className="h-3.5 w-3.5" />;
}

export interface SupplierRow {
  id: string;
  role_on_event: string | null;
  status: string | null;
  notes: string | null;
  suppliers: {
    id: string;
    name: string | null;
    primary_email: string | null;
    primary_phone: string | null;
    category: string | null;
  } | null;
}

function SupplierRowComp({ row, eventId }: { row: SupplierRow; eventId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    role_on_event: row.role_on_event ?? "",
    status:        row.status ?? "shortlisted",
    notes:         row.notes ?? "",
  });

  const openEdit = useCallback(() => {
    setDraft({
      role_on_event: row.role_on_event ?? "",
      status:        row.status ?? "shortlisted",
      notes:         row.notes ?? "",
    });
    setError(null);
    setExpanded(true);
  }, [row]);

  const cancel = useCallback(() => { setExpanded(false); setError(null); }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    for (const [field, value] of Object.entries(draft) as Array<[string, string]>) {
      const result = await updateEventSupplierField(eventId, row.id, field, value);
      if (result?.error) { setError(result.error); setSaving(false); return; }
    }
    setExpanded(false);
    setSaving(false);
  }, [draft, eventId, row.id]);

  const st = statusStyle(row.status);

  const inputCls = "w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-0.5";

  return (
    <>
      <tr className="hover:bg-surface-50 transition-colors group">
        <td className="px-5 py-3.5">
          <p className="font-medium text-surface-900">{row.suppliers?.name ?? "Unknown supplier"}</p>
          {row.suppliers?.category && (
            <p className="text-xs text-surface-400">{row.suppliers.category}</p>
          )}
        </td>
        <td className="px-5 py-3.5 text-surface-700">{row.role_on_event ?? "—"}</td>
        <td className="px-5 py-3.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${st.className}`}>
            <StatusIcon status={row.status} />
            {st.label}
          </span>
        </td>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-3">
            {row.suppliers?.primary_email && (
              <a href={`mailto:${row.suppliers.primary_email}`} className="text-surface-400 hover:text-brand-600 transition-colors">
                <Mail className="h-4 w-4" />
              </a>
            )}
            {row.suppliers?.primary_phone && (
              <a href={`tel:${row.suppliers.primary_phone}`} className="text-surface-400 hover:text-brand-600 transition-colors">
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5 text-right">
          <button
            onClick={expanded ? cancel : openEdit}
            aria-label="Edit supplier"
            className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg px-2 py-1 text-[11px] text-surface-500 hover:bg-surface-100 hover:text-brand-600"
          >
            <Pencil className="h-3.5 w-3.5" />
            {expanded ? "Close" : "Edit"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-brand-50/40">
          <td colSpan={5} className="px-5 py-4">
            <div className="grid grid-cols-3 gap-x-6 gap-y-3 max-w-2xl">
              <div>
                <p className={labelCls}>Role on Event</p>
                <input className={inputCls} value={draft.role_on_event} placeholder="e.g. AV & Technical Production" onChange={(e) => setDraft((d) => ({ ...d, role_on_event: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Status</p>
                <select className={inputCls} value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                  {[
                    ["shortlisted","Shortlisted"],["contacted","Contacted"],["confirmed","Confirmed"],
                    ["declined","Declined"],["cancelled","Cancelled"],
                  ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <p className={labelCls}>Notes</p>
                <textarea className={inputCls + " resize-none"} rows={2} value={draft.notes} placeholder="Internal notes about this supplier…" onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Changes
              </button>
              <button onClick={cancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface SupplierTableProps {
  rows: SupplierRow[];
  eventId: string;
}

export function SupplierTable({ rows, eventId }: SupplierTableProps) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100 bg-surface-50">
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Supplier</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Role</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Status</th>
            <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Contact</th>
            <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500 w-20">Edit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((row) => (
            <SupplierRowComp key={row.id} row={row} eventId={eventId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
