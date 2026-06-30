import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, Truck, Package, MapPin, Clock, AlertTriangle, CheckCircle2, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  confirmed:    "bg-success-100 text-success-700 border-success-200",
  pending:      "bg-warning-100 text-warning-700 border-warning-200",
  in_transit:   "bg-blue-100 text-blue-700 border-blue-200",
  delivered:    "bg-teal-100 text-teal-700 border-teal-200",
  delayed:      "bg-danger-100 text-danger-700 border-danger-200",
  cancelled:    "bg-surface-100 text-surface-500 border-surface-200",
  scheduled:    "bg-violet-100 text-violet-700 border-violet-200",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  delivery:   <Truck className="h-4 w-4" />,
  pickup:     <Package className="h-4 w-4" />,
  equipment:  <Package className="h-4 w-4" />,
  transport:  <Truck className="h-4 w-4" />,
};

import React from "react";

interface LogisticsItem {
  id: string;
  item_type: string | null;
  title: string | null;
  supplier_name: string | null;
  status: string | null;
  scheduled_date: string | null;
  access_time: string | null;
  notes: string | null;
  zone: string | null;
  quantity: number | null;
}

export default async function LogisticsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, venue_name_snapshot, start_at")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  // event_logistics is not yet in generated types — cast to bypass TypeScript depth limit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logisticsData, count: total } = (await (supabase as any)
    .from("event_logistics")
    .select("id, item_type, title, supplier_name, status, scheduled_date, access_time, notes, zone, quantity", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("scheduled_date", { ascending: true })) as { data: LogisticsItem[] | null; count: number | null };

  const items = (logisticsData ?? []) as LogisticsItem[];

  const confirmed = items.filter((i) => ["confirmed", "delivered"].includes(i.status ?? "")).length;
  const pending = items.filter((i) => ["pending", "scheduled"].includes(i.status ?? "")).length;
  const inTransit = items.filter((i) => i.status === "in_transit").length;
  const delayed = items.filter((i) => i.status === "delayed").length;

  const kpis = [
    { label: "Total Items", value: total ?? 0, sub: "Across all categories", color: "text-surface-900" },
    { label: "Confirmed", value: confirmed, sub: `${total ? Math.round((confirmed / (total ?? 1)) * 100) : 0}% of total`, color: "text-success-700" },
    { label: "Pending", value: pending, sub: "Awaiting confirmation", color: "text-warning-700" },
    { label: "In Transit", value: inTransit, sub: "Currently moving", color: "text-blue-700" },
    { label: "Delayed", value: delayed, sub: delayed > 0 ? "Action required" : "On track", color: delayed > 0 ? "text-danger-700" : "text-surface-500" },
  ];

  // Group by date
  const byDate = new Map<string, LogisticsItem[]>();
  for (const item of items) {
    const day = item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "No date";
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(item);
  }

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Logistics</h2>
          <p className="text-sm text-surface-500">Deliveries, equipment, transport and site access for {event.venue_name_snapshot ?? "the venue"}.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</p>
            <p className="mt-0.5 text-[11px] text-surface-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Alert for delays */}
      {delayed > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-danger-600 shrink-0" />
          <p className="text-sm font-medium text-danger-800">
            {delayed} logistics item{delayed > 1 ? "s are" : " is"} delayed and require immediate attention.
          </p>
        </div>
      )}

      {/* Logistics timeline */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <Truck className="mx-auto h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No logistics items yet</p>
          <p className="text-xs text-surface-400 mt-1">Add deliveries, equipment, transport and venue access details.</p>
          <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" />
            Add First Item
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byDate.entries()].map(([day, dayItems]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{day}</span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>
              <div className="grid grid-cols-1 gap-3">
                {dayItems.map((item) => {
                  const st = STATUS_STYLES[(item.status ?? "pending").toLowerCase()] ?? STATUS_STYLES.pending;
                  const isDelayed = item.status === "delayed";
                  const isDone = ["delivered", "confirmed"].includes(item.status ?? "");
                  return (
                    <div key={item.id} className={`flex items-start gap-4 rounded-xl border ${isDelayed ? "border-danger-200 bg-danger-50" : "border-surface-200 bg-white"} px-4 py-3.5 shadow-sm`}>
                      <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${isDone ? "bg-success-100 text-success-600" : isDelayed ? "bg-danger-100 text-danger-600" : "bg-surface-100 text-surface-500"}`}>
                        {TYPE_ICONS[(item.item_type ?? "delivery").toLowerCase()] ?? <Package className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-surface-900">{item.title ?? "Untitled item"}</p>
                            {item.supplier_name && <p className="text-xs text-surface-500">{item.supplier_name}</p>}
                          </div>
                          <span className={`inline-flex shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${st}`}>
                            {(item.status ?? "pending").replace("_", " ")}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                          {item.access_time && (
                            <span className="flex items-center gap-1 text-[11px] text-surface-500">
                              <Clock className="h-3 w-3" /> {item.access_time}
                            </span>
                          )}
                          {item.zone && (
                            <span className="flex items-center gap-1 text-[11px] text-surface-500">
                              <MapPin className="h-3 w-3" /> {item.zone}
                            </span>
                          )}
                          {item.quantity && (
                            <span className="text-[11px] text-surface-500">Qty: {item.quantity}</span>
                          )}
                          {item.item_type && (
                            <span className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-surface-600 capitalize">{item.item_type.replace("_", " ")}</span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="mt-1.5 text-[11px] text-surface-400 italic">{item.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
