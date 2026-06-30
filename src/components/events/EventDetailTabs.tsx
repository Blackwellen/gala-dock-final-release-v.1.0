"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus, Upload, Download, Send, MoreHorizontal,
  CheckSquare, AlertTriangle, Users2, Banknote, Sparkles,
  Edit2, MessageSquare, Pin, Filter, FileText,
  FolderPlus, Eye, Share2, Archive,
  Play, Printer, ArrowUpDown,
} from "lucide-react";
import { TabNav, type Tab } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { GuestsTab, type GuestRow } from "@/components/events/GuestsTab";
import { cn } from "@/lib/utils";

export interface DetailSupplierRow {
  id: string;
  name: string;
  category: string;
  status: string;
  notes: string | null;
}

export interface DetailTaskRow {
  id: string;
  title: string;
  assignee: string;
  due: string;
  priority: string;
  status: "completed" | "overdue" | "pending";
}

export interface DetailRunSheetRow {
  id: string;
  time: string;
  description: string;
  lane: string;
  section: string | null;
}

export interface DetailFileRow {
  id: string;
  name: string;
  isImage: boolean;
  size: string;
  uploadedBy: string;
  date: string;
}

export interface EventDetailData {
  eventId: string;
  budgetLabel: string;
  budgetCents: number;
  guestCountDay: number;
  guestCountEvening: number;
  description: string | null;
  internalNotes: string | null;
  pipelineNotes: string | null;
  clientName: string;
  clientEmail: string | null;
  riskLevel: string | null;
  suppliers: DetailSupplierRow[];
  tasks: DetailTaskRow[];
  runSheet: DetailRunSheetRow[];
  files: DetailFileRow[];
  guests: GuestRow[];
}

type SupplierBadgeStatus =
  | "pending"
  | "contacted"
  | "confirmed"
  | "declined"
  | "cancelled";

const SUPPLIER_STATUS_UI: Record<string, SupplierBadgeStatus> = {
  shortlisted: "pending",
  contacted: "contacted",
  confirmed: "confirmed",
  declined: "declined",
  cancelled: "cancelled",
};

function supplierBadge(status: string): SupplierBadgeStatus {
  return SUPPLIER_STATUS_UI[status] ?? "pending";
}

function OverviewTab({ data }: { data: EventDetailData }) {
  const doneTasks = data.tasks.filter((t) => t.status === "completed").length;
  const totalTasks = data.tasks.length;
  const remaining = totalTasks - doneTasks;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const clientInitials = data.clientName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "—";

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Budget"          value={data.budgetLabel} icon={Banknote}    iconColor="text-brand-600"   iconBg="bg-brand-50" />
        <MetricCard label="Day Guests"      value={String(data.guestCountDay)} icon={Users2} iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Evening Guests"  value={String(data.guestCountEvening)} icon={Users2} iconColor="text-violet-600" iconBg="bg-violet-50" />
        <MetricCard label="Tasks Remaining" value={String(remaining)} icon={CheckSquare} iconColor="text-surface-600" iconBg="bg-surface-100" />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Supplier Readiness</h3>
            </div>
            {data.suppliers.length === 0 ? (
              <EmptyState compact icon={Users2} title="No suppliers yet" description="Add suppliers to this event to track readiness." />
            ) : (
              <div className="divide-y divide-surface-100">
                {data.suppliers.map((s) => (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-900 truncate">{s.name}</p>
                      <p className="text-xs text-surface-400">{s.category}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={supplierBadge(s.status)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Task Progress</h3>
            </div>
            {totalTasks === 0 ? (
              <EmptyState compact icon={CheckSquare} title="No tasks yet" description="Create tasks to track delivery progress." />
            ) : (
              <>
                <div className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-600 rounded-full" style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-surface-700 shrink-0">{doneTasks} of {totalTasks} done</span>
                </div>
                <div className="divide-y divide-surface-100">
                  {data.tasks.slice(0, 4).map((t) => (
                    <div key={t.id} className="px-5 py-2.5 flex items-center gap-3">
                      <div className={cn("w-3.5 h-3.5 rounded-full shrink-0", t.status === "completed" ? "bg-success-500" : t.status === "overdue" ? "bg-danger-500" : "bg-surface-200")} />
                      <span className={cn("text-sm flex-1 truncate", t.status === "completed" && "line-through text-surface-400")}>{t.title}</span>
                      <span className={cn("text-xs shrink-0", t.status === "overdue" ? "text-danger-600 font-medium" : "text-surface-400")}>{t.due}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Client</h3>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <span className="text-brand-700 text-sm font-semibold">{clientInitials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-surface-900 truncate">{data.clientName}</p>
                <p className="text-xs text-surface-400 truncate">{data.clientEmail ?? "No email on file"}</p>
              </div>
            </div>
            <button className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border border-surface-200 rounded-lg text-surface-600 hover:bg-surface-50 transition-colors">
              <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
              Invite to Portal
            </button>
          </div>

          {data.pipelineNotes && (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Pipeline Notes</h3>
              <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-line">{data.pipelineNotes}</p>
            </div>
          )}

          {data.riskLevel === "high" && (
            <div className="bg-white rounded-xl border border-danger-200 shadow-card overflow-hidden">
              <div className="px-4 py-3 bg-danger-50 border-b border-danger-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger-600" strokeWidth={2} />
                <h3 className="text-sm font-semibold text-danger-700">High Risk</h3>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-xs text-danger-700">This event is flagged as high risk. Review outstanding tasks and supplier confirmations.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BriefTab({ data }: { data: EventDetailData }) {
  const [editing, setEditing] = useState(false);
  const FIELDS = [
    { label: "Event Overview", rows: 4, value: data.description ?? "" },
    { label: "Pipeline Notes", rows: 3, value: data.pipelineNotes ?? "" },
    { label: "Internal Notes", rows: 3, value: data.internalNotes ?? "" },
  ];

  return (
    <div className="p-6 max-w-[900px]">
      <div className="flex items-center justify-between mb-5">
        <div />
        <div className="flex gap-2 flex-wrap justify-end">
          <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
            <Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.8} />
            Generate from Notes
          </button>
          <button onClick={() => setEditing(!editing)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
            <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
            {editing ? "Save Brief" : "Edit Brief"}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {FIELDS.map(({ label, rows, value }) => (
          <div key={label} className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">{label}</label>
            {editing ? (
              <textarea className="w-full text-sm text-surface-800 leading-relaxed resize-none bg-surface-50 border border-surface-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all" rows={rows} defaultValue={value} />
            ) : value ? (
              <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-line">{value}</p>
            ) : (
              <p className="text-sm text-surface-400 italic">Not provided</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SuppliersTab({ data }: { data: EventDetailData }) {
  return (
    <div className="p-6 space-y-5 max-w-[1100px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />Add Supplier
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Send className="w-4 h-4" strokeWidth={1.8} />Send RFQ
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <ArrowUpDown className="w-4 h-4" strokeWidth={1.8} />Compare Quotes
        </button>
      </div>
      {data.suppliers.length === 0 ? (
        <EmptyState icon={Users2} title="No suppliers added" description="Add suppliers to coordinate quotes, bookings and documents for this event." />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                {["Supplier", "Role", "Booking", ""].map((h) => (
                  <th key={h} className={cn("px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider", !h && "w-10", h === "Role" && "hidden md:table-cell")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {data.suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="px-4 py-3.5 font-medium text-surface-900">{s.name}</td>
                  <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{s.category}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={supplierBadge(s.status)} /></td>
                  <td className="px-4 py-3.5">
                    <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all">
                      <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TasksTab({ data }: { data: EventDetailData }) {
  return (
    <div className="p-6 space-y-4 max-w-[900px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />New Task
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Filter className="w-4 h-4" strokeWidth={1.8} />Filter
        </button>
      </div>
      {data.tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks yet" description="Break this event down into tasks to track who does what, by when." />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Task</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Assignee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden sm:table-cell">Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Priority</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {data.tasks.map((t) => (
                <tr key={t.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center", t.status === "completed" ? "bg-success-500 border-success-500" : "border-surface-300")}>
                      {t.status === "completed" && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={cn("font-medium text-surface-900", t.status === "completed" && "line-through text-surface-400")}>{t.title}</span></td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center">
                      <span className="text-brand-700 text-[10px] font-semibold">{t.assignee}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell"><span className={cn("text-xs font-medium", t.status === "overdue" ? "text-danger-600" : "text-surface-500")}>{t.due}</span></td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border capitalize", t.priority === "high" ? "bg-danger-50 text-danger-600 border-danger-200" : t.priority === "medium" ? "bg-warning-50 text-warning-600 border-warning-200" : "bg-surface-100 text-surface-500 border-surface-200")}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all">
                      <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RunSheetTab({ data }: { data: EventDetailData }) {
  const laneColour: Record<string, string> = {
    tech: "bg-violet-50 text-violet-700 border-violet-200",
    foh: "bg-brand-50 text-brand-700 border-brand-200",
    talent: "bg-success-50 text-success-700 border-success-200",
    comms: "bg-info-50 text-info-600 border-info-200",
    security: "bg-danger-50 text-danger-700 border-danger-200",
    catering: "bg-warning-50 text-warning-700 border-warning-200",
    other: "bg-surface-100 text-surface-600 border-surface-200",
  };
  return (
    <div className="p-6 space-y-4 max-w-[900px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"><Plus className="w-4 h-4" strokeWidth={2.5} />Add Item</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Printer className="w-4 h-4" strokeWidth={1.8} />Print</button>
        <Link href={`/event-manager/events/${data.eventId}/event-day`} className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-brand-300 text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
          <Play className="w-4 h-4" strokeWidth={1.8} />Event Day Mode
        </Link>
      </div>
      {data.runSheet.length === 0 ? (
        <EmptyState icon={Printer} title="No run sheet items" description="Build the run of show by adding timed items for the event day." />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="relative">
            <div className="absolute left-[72px] top-0 bottom-0 w-px bg-surface-100" />
            <div className="divide-y divide-surface-100">
              {data.runSheet.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-5 py-3 hover:bg-surface-50 transition-colors group">
                  <span className="text-sm font-mono font-semibold text-brand-600 w-12 shrink-0 pt-0.5">{item.time}</span>
                  <div className="w-3 h-3 rounded-full bg-brand-200 border-2 border-brand-400 mt-1.5 shrink-0 z-10" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-800">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize", laneColour[item.lane] ?? laneColour.other)}>{item.lane}</span>
                      {item.section && <span className="text-[10px] text-surface-400">{item.section}</span>}
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all shrink-0"><MoreHorizontal className="w-4 h-4" strokeWidth={1.8} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceTab({ data }: { data: EventDetailData }) {
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"><Plus className="w-4 h-4" strokeWidth={2.5} />Create Quote</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><FileText className="w-4 h-4" strokeWidth={1.8} />Create Invoice</button>
        <Link href="/event-manager/finance/invoices" className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Download className="w-4 h-4" strokeWidth={1.8} />View in Finance</Link>
      </div>
      <KPIGrid className="grid-cols-2 sm:grid-cols-2">
        <MetricCard label="Client Budget" value={data.budgetLabel} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
        <MetricCard label="Confirmed Suppliers" value={String(data.suppliers.filter((s) => s.status === "confirmed").length)} icon={Users2} iconColor="text-success-600" iconBg="bg-success-50" />
      </KPIGrid>
      <p className="text-xs text-surface-400">Invoices and quotes are managed in the Finance section and linked to this event.</p>
    </div>
  );
}

function FilesTab({ data }: { data: EventDetailData }) {
  return (
    <div className="p-6 space-y-4 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand cursor-pointer">
          <Upload className="w-4 h-4" strokeWidth={2} />Upload File<input type="file" className="hidden" multiple />
        </label>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><FolderPlus className="w-4 h-4" strokeWidth={1.8} />New Folder</button>
      </div>
      {data.files.length === 0 ? (
        <EmptyState icon={FileText} title="No files uploaded" description="Upload contracts, floor plans, briefs and other documents for this event." />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-surface-200 bg-surface-50">{["File","Size","Uploaded By","Date",""].map((h,i) => <th key={i} className={cn("px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider", i >= 1 && i <= 3 && "hidden lg:table-cell", !h && "w-28")}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-surface-100">
              {data.files.map((f) => (
                <tr key={f.id} className="hover:bg-surface-50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{f.isImage ? "🖼" : "📄"}</span>
                      <span className="font-medium text-surface-900">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-surface-500 text-xs hidden lg:table-cell">{f.size}</td>
                  <td className="px-4 py-3 text-surface-500 text-xs hidden lg:table-cell">{f.uploadedBy}</td>
                  <td className="px-4 py-3 text-surface-500 text-xs hidden lg:table-cell">{f.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"><Eye className="w-3.5 h-3.5" strokeWidth={1.8} /></button>
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"><Download className="w-3.5 h-3.5" strokeWidth={1.8} /></button>
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"><Share2 className="w-3.5 h-3.5" strokeWidth={1.8} /></button>
                      <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"><Archive className="w-3.5 h-3.5" strokeWidth={1.8} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-surface-400">All files are upload-only. External URL fields are not permitted.</p>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="p-6 max-w-[800px]">
      <div className="flex items-center gap-2 mb-5">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"><Plus className="w-4 h-4" strokeWidth={2.5} />Add Note</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Filter className="w-4 h-4" strokeWidth={1.8} />Filter</button>
      </div>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 mb-5">
        <textarea placeholder="Add a note or comment..." className="w-full text-sm text-surface-800 placeholder:text-surface-400 resize-none bg-transparent focus:outline-none" rows={3} />
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-surface-100">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Pin className="w-3 h-3" strokeWidth={2} />Pin</button>
          <button className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">Post Note</button>
        </div>
      </div>
      <EmptyState compact icon={MessageSquare} title="No activity yet" description="Notes, status changes and updates for this event will appear here." />
    </div>
  );
}

export function EventDetailTabs({ data }: { data: EventDetailData }) {
  const [activeTab, setActiveTab] = useState("overview");

  const openTasks = data.tasks.filter((t) => t.status !== "completed").length;
  const confirmedGuests = data.guests.filter((g) => g.rsvp_status === "confirmed").length;

  const tabs: Tab[] = [
    { id: "overview", label: "Overview" },
    { id: "brief", label: "Brief" },
    { id: "suppliers", label: "Suppliers", count: data.suppliers.length || undefined },
    { id: "tasks", label: "Tasks", count: openTasks || undefined, badge: openTasks > 0 ? "warning" : undefined },
    { id: "runsheet", label: "Run Sheet" },
    { id: "finance", label: "Finance" },
    { id: "files", label: "Files", count: data.files.length || undefined },
    { id: "guests", label: "Guests", count: confirmedGuests || undefined },
    { id: "activity", label: "Activity" },
  ];

  const content: Record<string, React.ReactNode> = {
    overview: <OverviewTab data={data} />,
    brief: <BriefTab data={data} />,
    suppliers: <SuppliersTab data={data} />,
    tasks: <TasksTab data={data} />,
    runsheet: <RunSheetTab data={data} />,
    finance: <FinanceTab data={data} />,
    files: <FilesTab data={data} />,
    guests: <GuestsTab eventId={data.eventId} guests={data.guests} />,
    activity: <ActivityTab />,
  };

  return (
    <>
      <div className="bg-white border-b border-surface-200 sticky top-14 z-20">
        <div className="px-6">
          <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>
      <div key={activeTab} className="animate-fade-in">
        {content[activeTab]}
      </div>
    </>
  );
}
