"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus, Upload, Download, FileDown, Send, MoreHorizontal,
  CheckSquare, AlertTriangle, Users2, Banknote, Sparkles,
  Edit2, MessageSquare, Pin, Filter, FileText,
  FolderPlus, Eye, Share2, Archive, ChevronRight,
  Play, Printer, ArrowUpDown,
} from "lucide-react";
import { EventHero } from "@/components/events/EventHero";
import { TabNav } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";

const EVENT = {
  id: "1",
  name: "The Carter Wedding",
  status: "confirmed" as const,
  date: "14 Jun 2026",
  venue: "Thornbury Castle, Bristol",
  client: "Samuel Carter",
  owner: "Jamie T.",
  guestCount: 120,
};

const SUPPLIER_ROWS = [
  { id: "s1", category: "Catering",     name: "Noble Kitchen Co.",      status: "confirmed"        as const, quote: 7800,  docStatus: "verified"  as const },
  { id: "s2", category: "AV/Production",name: "SoundWave Events",       status: "awaiting-approval"as const, quote: 4200,  docStatus: "pending"   as const },
  { id: "s3", category: "Photography",  name: "Lena Marsh Photography", status: "confirmed"        as const, quote: 2500,  docStatus: "verified"  as const },
  { id: "s4", category: "Florist",      name: "Bloom & Wild",           status: "quoting"          as const, quote: null,  docStatus: "missing"   as const },
  { id: "s5", category: "Band/Music",   name: "The Bristol Quartet",    status: "confirmed"        as const, quote: 1800,  docStatus: "verified"  as const },
];

const TASKS = [
  { id: "t1", title: "Confirm final guest count",      assignee: "JT", due: "10 Jun 2026", priority: "high",   status: "pending"   as const },
  { id: "t2", title: "Send AV brief to SoundWave",     assignee: "JT", due: "8 Jun 2026",  priority: "high",   status: "overdue"   as const },
  { id: "t3", title: "Upload venue floor plan",         assignee: "KL", due: "12 Jun 2026", priority: "medium", status: "pending"   as const },
  { id: "t4", title: "Chase florist quote",             assignee: "JT", due: "7 Jun 2026",  priority: "medium", status: "overdue"   as const },
  { id: "t5", title: "Print run sheet copies",          assignee: "MR", due: "13 Jun 2026", priority: "low",    status: "pending"   as const },
  { id: "t6", title: "Send welcome letter to client",  assignee: "JT", due: "5 Jun 2026",  priority: "medium", status: "completed" as const },
];

const RUN_SHEET = [
  { id: "r1",  time: "07:00", description: "Venue access — setup team arrives",        assignee: "MR", type: "setup" },
  { id: "r2",  time: "08:00", description: "Catering setup begins (Noble Kitchen)",    assignee: "S.", type: "supplier" },
  { id: "r3",  time: "09:00", description: "AV/Sound check (SoundWave Events)",        assignee: "S.", type: "supplier" },
  { id: "r4",  time: "11:00", description: "Florist arrangement setup",                assignee: "S.", type: "supplier" },
  { id: "r5",  time: "13:00", description: "Venue final walk-through with client",     assignee: "JT", type: "internal" },
  { id: "r6",  time: "14:30", description: "Photographer arrival (Lena Marsh)",        assignee: "S.", type: "supplier" },
  { id: "r7",  time: "15:30", description: "Guests arrive — welcome drinks",           assignee: "JT", type: "event" },
  { id: "r8",  time: "16:00", description: "Ceremony begins",                          assignee: "JT", type: "event" },
  { id: "r9",  time: "17:00", description: "Drinks reception — band plays",            assignee: "JT", type: "event" },
  { id: "r10", time: "19:00", description: "Wedding breakfast — speeches",             assignee: "JT", type: "event" },
  { id: "r11", time: "21:00", description: "Evening reception — band plays",           assignee: "JT", type: "event" },
  { id: "r12", time: "00:00", description: "Event ends — breakdown begins",            assignee: "MR", type: "setup" },
];

const INVOICES = [
  { id: "i1", ref: "INV-001", description: "Deposit (50%)", amount: 14000, status: "paid"   as const, date: "1 Mar 2026" },
  { id: "i2", ref: "INV-002", description: "Balance (50%)", amount: 14000, status: "unpaid" as const, date: "Due 1 Jun 2026" },
];

const FILES = [
  { id: "f1", name: "Venue_Contract_Signed.pdf",    type: "pdf",   size: "1.2 MB", uploadedBy: "JT", date: "12 Mar 2026", visibility: "internal" },
  { id: "f2", name: "Carter_Wedding_Brief.pdf",      type: "pdf",   size: "840 KB", uploadedBy: "JT", date: "5 Feb 2026",  visibility: "client" },
  { id: "f3", name: "Floorplan_Thornbury.pdf",       type: "pdf",   size: "2.1 MB", uploadedBy: "KL", date: "18 Mar 2026", visibility: "internal" },
  { id: "f4", name: "Catering_Menu_Noble.pdf",       type: "pdf",   size: "560 KB", uploadedBy: "JT", date: "22 Mar 2026", visibility: "supplier" },
  { id: "f5", name: "Inspiration_Moodboard.jpg",     type: "image", size: "3.4 MB", uploadedBy: "JT", date: "1 Feb 2026",  visibility: "client" },
];

const ACTIVITY = [
  { id: "a1", type: "status",   text: "Status changed from Quoting to Confirmed",     user: "JT", time: "2 days ago" },
  { id: "a2", type: "note",     text: "Client confirmed 120 guests. Menu tasting booked 8 Jun.", user: "JT", time: "3 days ago" },
  { id: "a3", type: "supplier", text: "Noble Kitchen Co. quote accepted (£7,800)",    user: "JT", time: "4 days ago" },
  { id: "a4", type: "task",     text: "Task 'Send welcome letter' marked complete",   user: "KL", time: "5 days ago" },
  { id: "a5", type: "file",     text: "Venue_Contract_Signed.pdf uploaded",           user: "JT", time: "1 week ago" },
  { id: "a6", type: "ai",       text: "AI generated event summary",                   user: "AI", time: "1 week ago" },
];

const TABS = [
  { id: "overview",  label: "Overview" },
  { id: "brief",     label: "Brief" },
  { id: "suppliers", label: "Suppliers", count: 2, badge: "warning" as const },
  { id: "tasks",     label: "Tasks",     count: 2, badge: "danger" as const },
  { id: "runsheet",  label: "Run Sheet" },
  { id: "finance",   label: "Finance" },
  { id: "files",     label: "Files",     count: 5 },
  { id: "activity",  label: "Activity" },
];

// ── Tab components ─────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Budget"          value="£28,000" icon={Banknote}    iconColor="text-brand-600"   iconBg="bg-brand-50" />
        <MetricCard label="Spend to Date"   value="£19,400" icon={Banknote}    iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Est. Margin"     value="£8,600"  icon={Banknote}    iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Tasks Remaining" value="4"       icon={CheckSquare} iconColor="text-surface-600" iconBg="bg-surface-100" />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Supplier readiness */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Supplier Readiness</h3>
              <button className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</button>
            </div>
            <div className="divide-y divide-surface-100">
              {SUPPLIER_ROWS.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{s.name}</p>
                    <p className="text-xs text-surface-400">{s.category}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={s.docStatus} />
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Task progress */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Task Progress</h3>
              <button className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</button>
            </div>
            <div className="px-5 py-3 flex items-center gap-4">
              <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: "17%" }} />
              </div>
              <span className="text-sm font-medium text-surface-700 shrink-0">1 of 6 done</span>
            </div>
            <div className="divide-y divide-surface-100">
              {TASKS.slice(0, 4).map((t) => (
                <div key={t.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className={cn("w-3.5 h-3.5 rounded-full shrink-0", t.status === "completed" ? "bg-success-500" : t.status === "overdue" ? "bg-danger-500" : "bg-surface-200")} />
                  <span className={cn("text-sm flex-1 truncate", t.status === "completed" && "line-through text-surface-400")}>{t.title}</span>
                  <span className={cn("text-xs shrink-0", t.status === "overdue" ? "text-danger-600 font-medium" : "text-surface-400")}>{t.due}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Client card */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Client</h3>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <span className="text-brand-700 text-sm font-semibold">SC</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-900">{EVENT.client}</p>
                <p className="text-xs text-surface-400">samuel.carter@example.com</p>
              </div>
            </div>
            <button className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border border-surface-200 rounded-lg text-surface-600 hover:bg-surface-50 transition-colors">
              <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
              Invite to Portal
            </button>
          </div>

          {/* Risk panel */}
          <div className="bg-white rounded-xl border border-danger-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 bg-danger-50 border-b border-danger-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger-600" strokeWidth={2} />
              <h3 className="text-sm font-semibold text-danger-700">Risks</h3>
            </div>
            <div className="divide-y divide-danger-50">
              {["AV quote not yet approved", "Florist quote outstanding", "Balance invoice due in 4 days"].map((risk) => (
                <div key={risk} className="px-4 py-2.5 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger-500 mt-1.5 shrink-0" />
                  <p className="text-xs text-danger-700">{risk}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI summary */}
          <div className="bg-gradient-to-br from-brand-900 to-brand-800 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" strokeWidth={1.8} />
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">AI Summary</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed mb-3">Carter Wedding confirmed 14 Jun. 4 of 5 suppliers booked. Balance invoice due. 2 overdue tasks need action.</p>
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium rounded-lg transition-colors">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
              Generate Full Summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BriefTab() {
  const [editing, setEditing] = useState(false);
  const FIELDS = [
    { label: "Event Overview",         rows: 4, value: "A traditional English wedding for 120 guests at Thornbury Castle, Bristol. Classic, elegant aesthetic with a garden-party feel. Full sit-down wedding breakfast followed by evening reception." },
    { label: "Guest Count & Profile",  rows: 3, value: "120 day guests, 60 evening guests. Mix of family, friends and corporate contacts. Accessibility: 3 wheelchair users. Dietary: 8 vegetarian, 2 vegan, 1 nut allergy." },
    { label: "Event Style / Theme",    rows: 3, value: "Classic English garden party. Floral centrepieces, fairy lights, string quartets. Ivory and sage green colour palette." },
    { label: "Food & Drink",           rows: 3, value: "3-course sit-down wedding breakfast with canapés during drinks reception. Evening buffet. Full open bar throughout." },
    { label: "Entertainment & AV",    rows: 3, value: "String quartet during ceremony and drinks reception. DJ for evening. Professional PA system and LED uplighting required." },
    { label: "Staffing Requirements", rows: 2, value: "Event manager on-site from 07:00. Waiting staff via catering company. 1 coordinator for supplier arrivals." },
    { label: "Accessibility & Safety",rows: 2, value: "3 wheelchair users — confirm venue accessibility. Fire exit brief for all suppliers." },
    { label: "Internal Notes",        rows: 3, value: "Client prefers WhatsApp. Budget firm at £28,000. Final headcount deadline: 10 Jun 2026." },
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
          <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
            <Users2 className="w-4 h-4" strokeWidth={1.8} />
            Supplier Requirements
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
            ) : (
              <p className="text-sm text-surface-700 leading-relaxed">{value}</p>
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
            <Send className="w-4 h-4" strokeWidth={1.8} />
            Create RFQs from Brief
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
            <MessageSquare className="w-4 h-4" strokeWidth={1.8} />
            Add Internal Note
          </button>
        </div>
      </div>
    </div>
  );
}

function SuppliersTab() {
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
          <Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.8} />AI Chase
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <ArrowUpDown className="w-4 h-4" strokeWidth={1.8} />Compare Quotes
        </button>
      </div>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              {["Supplier", "Category", "Quote", "Booking", "Docs", ""].map((h) => (
                <th key={h} className={cn("px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider", !h && "w-10", h === "Category" && "hidden md:table-cell", h === "Quote" && "hidden lg:table-cell", h === "Docs" && "hidden md:table-cell")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {SUPPLIER_ROWS.map((s) => (
              <tr key={s.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3.5 font-medium text-surface-900">{s.name}</td>
                <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{s.category}</td>
                <td className="px-4 py-3.5 hidden lg:table-cell">{s.quote ? <span className="font-medium text-surface-900">£{s.quote.toLocaleString()}</span> : <span className="text-surface-400 italic text-xs">Awaiting</span>}</td>
                <td className="px-4 py-3.5"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3.5 hidden md:table-cell"><StatusBadge status={s.docStatus} /></td>
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
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
        <h3 className="text-sm font-semibold text-surface-900 mb-3">Required Categories</h3>
        <div className="flex flex-wrap gap-2">
          {["Catering ✓", "AV/Production ⚠", "Photography ✓", "Florist ⚠", "Band/Music ✓", "Transport", "Venue Staff"].map((cat) => (
            <span key={cat} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border", cat.includes("✓") ? "bg-success-50 text-success-700 border-success-200" : cat.includes("⚠") ? "bg-warning-50 text-warning-700 border-warning-200" : "bg-surface-100 text-surface-500 border-surface-200")}>{cat}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TasksTab() {
  return (
    <div className="p-6 space-y-4 max-w-[900px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />New Task
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <CheckSquare className="w-4 h-4" strokeWidth={1.8} />Apply Template
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Filter className="w-4 h-4" strokeWidth={1.8} />Filter
        </button>
      </div>
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
            {TASKS.map((t) => (
              <tr key={t.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3">
                  <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer", t.status === "completed" ? "bg-success-500 border-success-500" : "border-surface-300 hover:border-brand-400")}>
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
    </div>
  );
}

function RunSheetTab() {
  const typeColour: Record<string, string> = {
    setup:    "bg-surface-100 text-surface-600 border-surface-200",
    supplier: "bg-brand-50 text-brand-700 border-brand-200",
    internal: "bg-violet-50 text-violet-700 border-violet-200",
    event:    "bg-success-50 text-success-700 border-success-200",
  };
  return (
    <div className="p-6 space-y-4 max-w-[900px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"><Plus className="w-4 h-4" strokeWidth={2.5} />Add Item</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.8} />Generate with AI</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Printer className="w-4 h-4" strokeWidth={1.8} />Print</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><FileDown className="w-4 h-4" strokeWidth={1.8} />Export PDF</button>
        <Link href={`/app/events/${EVENT.id}/event-day`} className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-brand-300 text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
          <Play className="w-4 h-4" strokeWidth={1.8} />Event Day Mode
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="relative">
          <div className="absolute left-[72px] top-0 bottom-0 w-px bg-surface-100" />
          <div className="divide-y divide-surface-100">
            {RUN_SHEET.map((item) => (
              <div key={item.id} className="flex items-start gap-4 px-5 py-3 hover:bg-surface-50 transition-colors group">
                <span className="text-sm font-mono font-semibold text-brand-600 w-12 shrink-0 pt-0.5">{item.time}</span>
                <div className="w-3 h-3 rounded-full bg-brand-200 border-2 border-brand-400 mt-1.5 shrink-0 z-10" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-800">{item.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize", typeColour[item.type])}>{item.type}</span>
                    <span className="text-[10px] text-surface-400">{item.assignee}</span>
                  </div>
                </div>
                <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all shrink-0"><MoreHorizontal className="w-4 h-4" strokeWidth={1.8} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceTab() {
  const totalSpend = SUPPLIER_ROWS.reduce((a, s) => a + (s.quote ?? 0), 0);
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"><Plus className="w-4 h-4" strokeWidth={2.5} />Create Quote</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><FileText className="w-4 h-4" strokeWidth={1.8} />Create Invoice</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Send className="w-4 h-4" strokeWidth={1.8} />Send Reminder</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.8} />Explain Margin</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Download className="w-4 h-4" strokeWidth={1.8} />Export</button>
      </div>
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Client Total"   value="£28,000"                         icon={Banknote} iconColor="text-brand-600"   iconBg="bg-brand-50" />
        <MetricCard label="Supplier Costs" value={`£${totalSpend.toLocaleString()}`} icon={Banknote} iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Gross Margin"   value={`£${(28000 - totalSpend).toLocaleString()}`} icon={Banknote} iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Margin %"       value="30.7%"                            icon={Banknote} iconColor="text-success-600" iconBg="bg-success-50" />
      </KPIGrid>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900">Client Invoices</h3>
          <Link href="/app/finance/invoices" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View in Finance</Link>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-surface-200 bg-surface-50">{["Ref","Description","Amount","Date","Status",""].map((h,i) => <th key={i} className={cn("px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider", !h && "w-10")}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-surface-100">
            {INVOICES.map((inv) => (
              <tr key={inv.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3 font-mono text-xs text-surface-500">{inv.ref}</td>
                <td className="px-4 py-3 text-surface-800">{inv.description}</td>
                <td className="px-4 py-3 font-semibold text-surface-900">£{inv.amount.toLocaleString()}</td>
                <td className="px-4 py-3 text-surface-500 text-xs">{inv.date}</td>
                <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                <td className="px-4 py-3"><button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all"><MoreHorizontal className="w-4 h-4" strokeWidth={1.8} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilesTab() {
  return (
    <div className="p-6 space-y-4 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand cursor-pointer">
          <Upload className="w-4 h-4" strokeWidth={2} />Upload File<input type="file" className="hidden" multiple />
        </label>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><FolderPlus className="w-4 h-4" strokeWidth={1.8} />New Folder</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.8} />Generate Event Pack</button>
      </div>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-surface-200 bg-surface-50">{["File","Size","Uploaded By","Date","Visibility",""].map((h,i) => <th key={i} className={cn("px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider", i >= 1 && i <= 3 && "hidden lg:table-cell", i === 4 && "hidden md:table-cell", !h && "w-28")}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-surface-100">
            {FILES.map((f) => (
              <tr key={f.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{f.type === "image" ? "🖼" : "📄"}</span>
                    <span className="font-medium text-surface-900">{f.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-surface-500 text-xs hidden lg:table-cell">{f.size}</td>
                <td className="px-4 py-3 text-surface-500 text-xs hidden lg:table-cell">{f.uploadedBy}</td>
                <td className="px-4 py-3 text-surface-500 text-xs hidden lg:table-cell">{f.date}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize", f.visibility === "client" ? "bg-brand-50 text-brand-700 border-brand-200" : f.visibility === "supplier" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-surface-100 text-surface-500 border-surface-200")}>{f.visibility}</span>
                </td>
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
      <p className="text-xs text-surface-400">All files are upload-only. External URL fields are not permitted.</p>
    </div>
  );
}

function ActivityTab() {
  const iconForType = (type: string) => {
    const map: Record<string, { bg: string; char: string }> = {
      status: { bg: "bg-brand-500", char: "→" }, note: { bg: "bg-violet-500", char: "✎" },
      supplier: { bg: "bg-success-500", char: "S" }, task: { bg: "bg-success-500", char: "✓" },
      file: { bg: "bg-surface-500", char: "F" }, ai: { bg: "bg-brand-600", char: "✦" },
    };
    return map[type] ?? { bg: "bg-surface-400", char: "•" };
  };

  return (
    <div className="p-6 max-w-[800px]">
      <div className="flex items-center gap-2 mb-5">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"><Plus className="w-4 h-4" strokeWidth={2.5} />Add Note</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Filter className="w-4 h-4" strokeWidth={1.8} />Filter</button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Download className="w-4 h-4" strokeWidth={1.8} />Export</button>
      </div>

      {/* Note input */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 mb-5">
        <textarea placeholder="Add a note or comment..." className="w-full text-sm text-surface-800 placeholder:text-surface-400 resize-none bg-transparent focus:outline-none" rows={3} />
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-surface-100">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"><Pin className="w-3 h-3" strokeWidth={2} />Pin</button>
          <button className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">Post Note</button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-5 top-2 bottom-2 w-px bg-surface-100" />
        <div className="space-y-4">
          {ACTIVITY.map((item) => {
            const { bg, char } = iconForType(item.type);
            return (
              <div key={item.id} className="flex items-start gap-4 group">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 text-white text-xs font-bold", bg)}>{char}</div>
                <div className="flex-1 bg-white rounded-xl border border-surface-200 shadow-card p-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-surface-800">{item.text}</p>
                    <button className="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-400 hover:bg-surface-100 transition-all shrink-0"><Pin className="w-3 h-3" strokeWidth={2} /></button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-5 h-5 rounded-full bg-surface-200 flex items-center justify-center">
                      <span className="text-[9px] font-bold text-surface-600">{item.user.slice(0, 2)}</span>
                    </div>
                    <span className="text-xs text-surface-400">{item.user} · {item.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function EventDetailPage({ params }: { params: { eventId: string } }) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabContent: Record<string, React.ReactNode> = {
    overview:  <OverviewTab />,
    brief:     <BriefTab />,
    suppliers: <SuppliersTab />,
    tasks:     <TasksTab />,
    runsheet:  <RunSheetTab />,
    finance:   <FinanceTab />,
    files:     <FilesTab />,
    activity:  <ActivityTab />,
  };

  return (
    <div className="animate-fade-in">
      <EventHero
        eventId={params.eventId}
        name={EVENT.name}
        status={EVENT.status}
        date={EVENT.date}
        venue={EVENT.venue}
        client={EVENT.client}
        owner={EVENT.owner}
        guestCount={EVENT.guestCount}
      />
      <div className="bg-white border-b border-surface-200 sticky top-14 z-20">
        <div className="px-6">
          <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>
      <div key={activeTab} className="animate-fade-in">
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
