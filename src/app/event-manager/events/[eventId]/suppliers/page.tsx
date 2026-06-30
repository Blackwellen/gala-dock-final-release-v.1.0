import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, Building2 } from "lucide-react";
import { SupplierTable, type SupplierRow } from "./SupplierTable";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: supplierData } = await supabase
    .from("event_suppliers")
    .select("id, role_on_event, status, notes, suppliers(id, name, primary_email, primary_phone, category)")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const rows = (supplierData ?? []) as unknown as SupplierRow[];

  const confirmed  = rows.filter((r) => r.status === "confirmed").length;
  const pending    = rows.filter((r) => !r.status || r.status === "shortlisted" || r.status === "contacted").length;
  const declined   = rows.filter((r) => r.status === "declined" || r.status === "cancelled").length;

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Suppliers</h2>
          <p className="text-sm text-surface-500">{rows.length} supplier{rows.length !== 1 ? "s" : ""} · {confirmed} confirmed</p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm transition-colors">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add Supplier
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Suppliers",       value: rows.length, color: "text-surface-900" },
          { label: "Confirmed",             value: confirmed,   color: "text-success-700" },
          { label: "Pending Confirmation",  value: pending,     color: "text-warning-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Supplier table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <Building2 className="mx-auto h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No suppliers added yet</p>
          <p className="text-xs text-surface-400 mt-1">Add suppliers and track their confirmation status.</p>
          <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" />
            Add First Supplier
          </button>
        </div>
      ) : (
        <SupplierTable rows={rows} eventId={eventId} />
      )}
    </div>
  );
}
