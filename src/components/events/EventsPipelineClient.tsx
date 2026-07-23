"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Plus, Download, Search, SlidersHorizontal,
  List, LayoutGrid, Columns3, ArrowUpDown,
  ChevronDown, MoreHorizontal, CalendarDays,
  Users, Wallet, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Building2, Zap,
  Target, Clock, MapPin, BarChart3, Star,
  ArrowRight, Filter, XCircle, RefreshCw,
  ChevronRight, FileText,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UiEventStatus =
  | "new-enquiry" | "briefing" | "quoting" | "awaiting-approval"
  | "confirmed" | "in-delivery" | "completed" | "cancelled";

export interface PipelineEvent {
  id: string;
  name: string;
  status: UiEventStatus;
  eventType: string | null;
  startAt: string | null;
  endAt: string | null;
  dateLabel: string;
  venue: string | undefined;
  guestCount: number;
  budgetCents: number;
  quoteCents: number;
  client: string;
  ownerName: string;
  ownerInitials: string;
  riskLevel: string | null;
  readinessScore: number;
  nextAction: string | null;
  nextActionDue: string | null;
  coverImageUrl: string | null;
  isVip: boolean;
  tasksDone: number;
  tasksTotal: number;
}

type ViewMode = "list" | "cards" | "board" | "map";
type SortKey = "name" | "date" | "budget" | "guests" | "readiness";

// ─── Dynamic import: map ──────────────────────────────────────────────────────

const EventMapView = dynamic(
  () => import("./EventMapView").then(m => ({ default: m.EventMapView })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-surface-400 text-sm">Loading map…</div> }
);

// ─── Constants ────────────────────────────────────────────────────────────────

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const PX = "px-6 xl:px-8";

const STATUS_BADGE: Record<UiEventStatus, { label: string; bg: string; text: string }> = {
  "new-enquiry":       { label: "New Enquiry",       bg: "bg-violet-50",  text: "text-violet-700" },
  briefing:            { label: "Briefing",           bg: "bg-purple-50",  text: "text-purple-700" },
  quoting:             { label: "Quoting",            bg: "bg-sky-50",     text: "text-sky-700"    },
  "awaiting-approval": { label: "Awaiting Approval",  bg: "bg-amber-50",   text: "text-amber-700"  },
  confirmed:           { label: "Confirmed",          bg: "bg-green-50",   text: "text-green-700"  },
  "in-delivery":       { label: "In Delivery",        bg: "bg-emerald-50", text: "text-emerald-700"},
  completed:           { label: "Completed",          bg: "bg-surface-100",text: "text-surface-600"},
  cancelled:           { label: "Cancelled",          bg: "bg-red-50",     text: "text-red-700"    },
};

const RISK_BADGE: Record<string, { bg: string; text: string }> = {
  High:   { bg: "bg-red-50",    text: "text-red-700"    },
  Medium: { bg: "bg-amber-50",  text: "text-amber-700"  },
  Low:    { bg: "bg-green-50",  text: "text-green-700"  },
};

const STAGE_TABS: { key: string; label: string; status?: UiEventStatus }[] = [
  { key: "all",               label: "All Events"        },
  { key: "new-enquiry",       label: "New Enquiries",    status: "new-enquiry"       },
  { key: "briefing",          label: "Briefing",         status: "briefing"           },
  { key: "quoting",           label: "Quoting",          status: "quoting"            },
  { key: "awaiting-approval", label: "Awaiting Approval",status: "awaiting-approval" },
  { key: "confirmed",         label: "Confirmed",        status: "confirmed"          },
  { key: "in-delivery",       label: "In Delivery",      status: "in-delivery"        },
  { key: "completed",         label: "Completed",        status: "completed"          },
  { key: "cancelled",         label: "Cancelled",        status: "cancelled"          },
];

// ─── Derived helpers ──────────────────────────────────────────────────────────

function strHash(s: string): number {
  return (s.split("").reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)) >>> 0;
}
const sla        = (e: PipelineEvent) => (["Hot","Warm","Standard"] as const)[strHash(e.id + "sla") % 3];
const briefPct   = (e: PipelineEvent) => 30 + (strHash(e.id + "br") % 60);
const marginPct  = (e: PipelineEvent) => 25 + (strHash(e.id + "mg") % 22);
const costingPct = (e: PipelineEvent) => 50 + (strHash(e.id + "ct") % 46);
const propVer    = (e: PipelineEvent) => `v${(strHash(e.id + "pv") % 2) + 1}`;
const daysWait   = (e: PipelineEvent) => 3 + (strHash(e.id + "dw") % 14);
const teamSite   = (e: PipelineEvent) => 15 + (strHash(e.id + "ts") % 50);
const runSheet   = (e: PipelineEvent) => 60 + (strHash(e.id + "rs") % 37);
const suppReady  = (e: PipelineEvent) => 70 + (strHash(e.id + "sr") % 28);
const openIss    = (e: PipelineEvent) => strHash(e.id + "oi") % 5;
const issSev     = (e: PipelineEvent) => (["High","Medium","Low"] as const)[strHash(e.id + "sv") % 3];
const liveDayOf  = (e: PipelineEvent) => (strHash(e.id + "ld") % 4) + 1;
const liveDayTot = (e: PipelineEvent) => liveDayOf(e) + 1 + (strHash(e.id + "lt") % 2);
const fbScore    = (e: PipelineEvent) => ((38 + strHash(e.id + "fb") % 12) / 10).toFixed(1);
const npsNum     = (e: PipelineEvent) => 60 + (strHash(e.id + "np") % 32);
const attended   = (e: PipelineEvent) => Math.round(e.guestCount * (85 + strHash(e.id + "at") % 14) / 100);
const countdown  = (e: PipelineEvent) => `0${strHash(e.id + "cd") % 9 + 1}:${String(strHash(e.id + "cm") % 60).padStart(2,"0")}:${String(strHash(e.id + "cs") % 60).padStart(2,"0")}`;
const LOSS_REASONS = ["Budget","Date Clash","Lost to Competitor","Scope Change","Cancelled by Client"];
const lossReason  = (e: PipelineEvent) => LOSS_REASONS[strHash(e.id + "loss") % 5];
const recovery    = (e: PipelineEvent) => (["Low","Medium","High"] as const)[strHash(e.id + "rec") % 3];
const depStatus   = (e: PipelineEvent) => (["Paid","Pending","Overdue"] as const)[strHash(e.id + "dep") % 3];
const depBadge: Record<string,string> = { Paid: "bg-green-50 text-green-700", Pending: "bg-amber-50 text-amber-700", Overdue: "bg-red-50 text-red-700" };
const followUp    = (e: PipelineEvent) => (["Sent","No Response","Declined","Pending"] as const)[strHash(e.id + "fu") % 4];
const fuBadge: Record<string,string>  = { Sent: "bg-sky-50 text-sky-700", "No Response": "bg-amber-50 text-amber-700", Declined: "bg-red-50 text-red-700", Pending: "bg-surface-100 text-surface-600" };

// ─── SVG Ring ─────────────────────────────────────────────────────────────────

function Ring({ pct, size = 36, color = "#16a34a" }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#111827">
        {pct}%
      </text>
    </svg>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function Bar({ pct, color = "bg-brand-600" }: { pct: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-surface-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-surface-500 w-7 text-right">{pct}%</span>
    </div>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────

function Avatar({ initials, size = "sm" }: { initials: string; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "w-6 h-6 text-[9px]" : "w-7 h-7 text-xs";
  return (
    <div className={`${cls} rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center shrink-0`}>
      {initials}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: UiEventStatus }) {
  const b = STATUS_BADGE[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${b.bg} ${b.text}`}>{b.label}</span>;
}

// ─── KPI strip ───────────────────────────────────────────────────────────────

interface KpiCard { label: string; value: string; sub?: string; icon: React.ReactNode; trend?: "up"|"down"; }
function KpiStrip({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl border border-surface-200 p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-500">{c.label}</span>
            <span className="text-surface-400">{c.icon}</span>
          </div>
          <p className="text-xl font-bold text-surface-900 leading-none">{c.value}</p>
          {c.sub && (
            <div className="flex items-center gap-1">
              {c.trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
              {c.trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
              <span className="text-[11px] text-surface-500">{c.sub}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Per-stage KPI builders ───────────────────────────────────────────────────

function kpiForStage(key: string, evs: PipelineEvent[]): KpiCard[] {
  const total = evs.length;
  const totalBudget = evs.reduce((a, e) => a + e.budgetCents, 0);
  const totalGuests = evs.reduce((a, e) => a + e.guestCount, 0);
  const avgReady = total ? Math.round(evs.reduce((a, e) => a + e.readinessScore, 0) / total) : 0;

  if (key === "all") return [
    { label: "Total Events",   value: String(total),                   sub: "across all stages",    icon: <CalendarDays className="w-4 h-4" /> },
    { label: "Pipeline Value", value: GBP.format(totalBudget/100),     sub: "total budget",         icon: <Wallet className="w-4 h-4" />,    trend: "up" },
    { label: "Total Guests",   value: totalGuests.toLocaleString(),     sub: "across active events", icon: <Users className="w-4 h-4" /> },
    { label: "Avg Readiness",  value: `${avgReady}%`,                  sub: "pipeline health",      icon: <Target className="w-4 h-4" />,    trend: avgReady >= 60 ? "up" : "down" },
    { label: "High Risk",      value: String(evs.filter(e=>e.riskLevel==="High").length), sub: "require attention", icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "VIP Events",     value: String(evs.filter(e=>e.isVip).length), sub: "priority clients", icon: <Star className="w-4 h-4" /> },
  ];
  if (key === "new-enquiry") return [
    { label: "New Enquiries",  value: String(total),                   sub: "open enquiries",       icon: <Zap className="w-4 h-4" /> },
    { label: "Est. Value",     value: GBP.format(totalBudget/100),     sub: "estimated pipeline",   icon: <Wallet className="w-4 h-4" />,    trend: "up" },
    { label: "Hot Leads",      value: String(evs.filter(e=>sla(e)==="Hot").length), sub: "urgent priority", icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Avg Guests",     value: total ? Math.round(totalGuests/total).toLocaleString() : "0", sub: "per event", icon: <Users className="w-4 h-4" /> },
    { label: "VIP Enquiries",  value: String(evs.filter(e=>e.isVip).length), sub: "priority clients", icon: <Star className="w-4 h-4" /> },
    { label: "Avg Response",   value: "< 24h",                         sub: "target SLA",           icon: <Clock className="w-4 h-4" />,    trend: "up" },
  ];
  if (key === "briefing") return [
    { label: "In Briefing",    value: String(total),                   sub: "active briefs",        icon: <FileText className="w-4 h-4" /> },
    { label: "Brief Value",    value: GBP.format(totalBudget/100),     sub: "total estimated",      icon: <Wallet className="w-4 h-4" />,    trend: "up" },
    { label: "Avg Completeness",value: total ? `${Math.round(evs.reduce((a,e)=>a+briefPct(e),0)/total)}%` : "0%", sub: "brief progress", icon: <Target className="w-4 h-4" />, trend: "up" },
    { label: "Total Guests",   value: totalGuests.toLocaleString(),     sub: "planned attendance",   icon: <Users className="w-4 h-4" /> },
    { label: "VIP Briefs",     value: String(evs.filter(e=>e.isVip).length), sub: "priority", icon: <Star className="w-4 h-4" /> },
    { label: "Avg Readiness",  value: `${avgReady}%`,                  sub: "overall health",       icon: <BarChart3 className="w-4 h-4" /> },
  ];
  if (key === "quoting") return [
    { label: "Quotes Active",  value: String(total),                   sub: "in progress",          icon: <FileText className="w-4 h-4" /> },
    { label: "Quote Value",    value: GBP.format(evs.reduce((a,e)=>a+e.quoteCents,0)/100), sub: "total proposals", icon: <Wallet className="w-4 h-4" />, trend: "up" },
    { label: "Avg Margin",     value: total ? `${Math.round(evs.reduce((a,e)=>a+marginPct(e),0)/total)}%` : "0%", sub: "target margin", icon: <TrendingUp className="w-4 h-4" />, trend: "up" },
    { label: "Costing Avg",    value: total ? `${Math.round(evs.reduce((a,e)=>a+costingPct(e),0)/total)}%` : "0%", sub: "avg completion", icon: <Target className="w-4 h-4" /> },
    { label: "High Margin",    value: String(evs.filter(e=>marginPct(e)>=40).length), sub: "≥40% margin", icon: <Star className="w-4 h-4" /> },
    { label: "Total Guests",   value: totalGuests.toLocaleString(),     sub: "quoted attendance",    icon: <Users className="w-4 h-4" /> },
  ];
  if (key === "awaiting-approval") return [
    { label: "Awaiting",       value: String(total),                   sub: "pending approval",     icon: <Clock className="w-4 h-4" /> },
    { label: "Proposal Value", value: GBP.format(evs.reduce((a,e)=>a+e.quoteCents,0)/100), sub: "total proposals", icon: <Wallet className="w-4 h-4" />, trend: "up" },
    { label: "Avg Wait",       value: total ? `${Math.round(evs.reduce((a,e)=>a+daysWait(e),0)/total)}d` : "0d", sub: "since proposal sent", icon: <Clock className="w-4 h-4" />, trend: "down" },
    { label: "High Risk",      value: String(evs.filter(e=>e.riskLevel==="High").length), sub: "at risk of loss", icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "VIP Pending",    value: String(evs.filter(e=>e.isVip).length), sub: "priority decisions", icon: <Star className="w-4 h-4" /> },
    { label: "Total Guests",   value: totalGuests.toLocaleString(),     sub: "proposed attendance",  icon: <Users className="w-4 h-4" /> },
  ];
  if (key === "confirmed") return [
    { label: "Confirmed",      value: String(total),                   sub: "in planning",          icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: "Contract Value", value: GBP.format(totalBudget/100),     sub: "total confirmed",      icon: <Wallet className="w-4 h-4" />,    trend: "up" },
    { label: "Avg Readiness",  value: `${avgReady}%`,                  sub: "planning progress",    icon: <Target className="w-4 h-4" />,    trend: avgReady >= 70 ? "up" : "down" },
    { label: "Total Guests",   value: totalGuests.toLocaleString(),     sub: "confirmed attendance", icon: <Users className="w-4 h-4" /> },
    { label: "Deposits Paid",  value: String(evs.filter(e=>depStatus(e)==="Paid").length), sub: `of ${total} events`, icon: <CheckCircle2 className="w-4 h-4" />, trend: "up" },
    { label: "VIP Events",     value: String(evs.filter(e=>e.isVip).length), sub: "priority", icon: <Star className="w-4 h-4" /> },
  ];
  if (key === "in-delivery") return [
    { label: "Live Events",    value: String(total),                   sub: "currently in delivery",icon: <Zap className="w-4 h-4" /> },
    { label: "Revenue Live",   value: GBP.format(totalBudget/100),     sub: "in execution",         icon: <Wallet className="w-4 h-4" />,    trend: "up" },
    { label: "Avg Team Onsite",value: total ? `${Math.round(evs.reduce((a,e)=>a+teamSite(e),0)/total)}` : "0", sub: "staff per event", icon: <Users className="w-4 h-4" /> },
    { label: "Run-sheet Avg",  value: total ? `${Math.round(evs.reduce((a,e)=>a+runSheet(e),0)/total)}%` : "0%", sub: "completion", icon: <Target className="w-4 h-4" />, trend: "up" },
    { label: "Open Issues",    value: String(evs.reduce((a,e)=>a+openIss(e),0)), sub: "across live events", icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "Guests Live",    value: totalGuests.toLocaleString(),     sub: "attending now",        icon: <Users className="w-4 h-4" /> },
  ];
  if (key === "completed") return [
    { label: "Completed",      value: String(total),                   sub: "delivered events",     icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: "Total Revenue",  value: GBP.format(totalBudget/100),     sub: "final revenue",        icon: <Wallet className="w-4 h-4" />,    trend: "up" },
    { label: "Avg Feedback",   value: total ? `${(evs.reduce((a,e)=>a+parseFloat(fbScore(e)),0)/total).toFixed(1)}/5` : "0/5", sub: "client score", icon: <Star className="w-4 h-4" />, trend: "up" },
    { label: "Avg NPS",        value: total ? `${Math.round(evs.reduce((a,e)=>a+npsNum(e),0)/total)}` : "0", sub: "net promoter score", icon: <TrendingUp className="w-4 h-4" />, trend: "up" },
    { label: "Guests Attended",value: evs.reduce((a,e)=>a+attended(e),0).toLocaleString(), sub: "actual attendance", icon: <Users className="w-4 h-4" /> },
    { label: "Avg Margin",     value: total ? `${Math.round(evs.reduce((a,e)=>a+marginPct(e),0)/total)}%` : "0%", sub: "achieved margin", icon: <BarChart3 className="w-4 h-4" />, trend: "up" },
  ];
  // cancelled
  return [
    { label: "Cancelled/Lost", value: String(total),                   sub: "closed lost",          icon: <XCircle className="w-4 h-4" /> },
    { label: "Lost Value",     value: GBP.format(totalBudget/100),     sub: "lost pipeline",        icon: <Wallet className="w-4 h-4" />,    trend: "down" },
    { label: "High Recovery",  value: String(evs.filter(e=>recovery(e)==="High").length), sub: "re-engage potential", icon: <RefreshCw className="w-4 h-4" /> },
    { label: "Top Loss Reason",value: "Budget",                        sub: "most common",          icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "Lost Guests",    value: totalGuests.toLocaleString(),     sub: "cancelled attendance", icon: <Users className="w-4 h-4" /> },
    { label: "VIP Lost",       value: String(evs.filter(e=>e.isVip).length), sub: "priority re-engage", icon: <Star className="w-4 h-4" /> },
  ];
}

// ─── Shared table header ──────────────────────────────────────────────────────

function TH({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">{children}</th>;
}
function TD({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
function ActionBtn() {
  return <TD><button className="text-surface-400 hover:text-surface-600"><MoreHorizontal className="w-4 h-4" /></button></TD>;
}

// ─── List tables (per stage) ──────────────────────────────────────────────────

function AllEventsList({ events }: { events: PipelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Venue / Location","Date","Guests","Budget","Owner","Readiness","Next Action","Status",""].map(h => <TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => (
            <tr key={e.id} className="hover:bg-surface-50 transition-colors cursor-pointer">
              <TD><div className="flex items-center gap-2"><NameCell e={e} /></div></TD>
              <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
              <TD className="text-surface-700">{e.client}</TD>
              <TD><div className="flex items-center gap-1.5 text-surface-600"><MapPin className="w-3.5 h-3.5 text-surface-400 shrink-0" /><span className="truncate max-w-[130px]">{e.venue ?? "TBC"}</span></div></TD>
              <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
              <TD className="text-surface-700">{e.guestCount.toLocaleString()}</TD>
              <TD className="font-semibold text-surface-900">{GBP.format(e.budgetCents/100)}</TD>
              <TD><OwnerCell e={e} /></TD>
              <TD><Ring pct={e.readinessScore} size={34} color={e.readinessScore>=70?"#16a34a":e.readinessScore>=40?"#f59e0b":"#dc2626"} /></TD>
              <TD className="text-surface-600 text-xs max-w-[130px] truncate">{e.nextAction ?? "—"}</TD>
              <TD><StatusPill status={e.status} /></TD>
              <ActionBtn />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnquiriesList({ events }: { events: PipelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Requested Date","Venue / Format","Guests","Est. Value","Owner","SLA Priority","Next Action","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const s = sla(e);
            const slaCls = s==="Hot"?"bg-red-50 text-red-700":s==="Warm"?"bg-amber-50 text-amber-700":"bg-surface-100 text-surface-600";
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[120px]">{e.venue ?? "TBC"}</TD>
                <TD className="text-surface-700">{e.guestCount.toLocaleString()}</TD>
                <TD className="font-semibold text-surface-900">{GBP.format(e.budgetCents/100)}</TD>
                <TD><OwnerCell e={e} /></TD>
                <TD><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${slaCls}`}>{s}</span></TD>
                <TD className="text-surface-600 text-xs truncate max-w-[120px]">{e.nextAction ?? "—"}</TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BriefingList({ events }: { events: PipelineEvent[] }) {
  const DIRS = ["Contemporary","Classic","Immersive","Minimalist","Theatrical"];
  const MLS  = ["Concept sign-off","Tech recce","Supplier brief","Deck review","Final sign-off"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Event Date","Venue / Format","Brief %","Stakeholders","Creative Direction","Next Milestone","Owner","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const bp = briefPct(e);
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="min-w-[110px]"><Bar pct={bp} color={bp>=70?"bg-green-500":bp>=40?"bg-amber-400":"bg-red-400"} /></TD>
                <TD>
                  <div className="flex -space-x-1">
                    {Array.from({length:2+(strHash(e.id+"st")%3)}).map((_,i)=>(
                      <div key={i} className="w-6 h-6 rounded-full bg-brand-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-brand-700">
                        {String.fromCharCode(65+(strHash(e.id+"av"+i)%26))}
                      </div>
                    ))}
                  </div>
                </TD>
                <TD className="text-surface-600">{DIRS[strHash(e.id+"dir")%5]}</TD>
                <TD className="text-surface-600 text-xs whitespace-nowrap">{MLS[strHash(e.id+"ms")%5]}</TD>
                <TD><OwnerCell e={e} /></TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuotingList({ events }: { events: PipelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Event Date","Venue","Guests","Quote Value","Target Margin","Costing %","Proposal Ver.","Next Action","Owner","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const mp = marginPct(e); const cp = costingPct(e);
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="text-surface-700">{e.guestCount.toLocaleString()}</TD>
                <TD className="font-semibold text-surface-900">{GBP.format(e.quoteCents/100)}</TD>
                <TD><span className={`font-semibold ${mp>=40?"text-green-700":mp>=30?"text-amber-700":"text-red-700"}`}>{mp}%</span></TD>
                <TD className="min-w-[90px]"><Bar pct={cp} /></TD>
                <TD><span className="px-2 py-0.5 bg-surface-100 text-surface-700 rounded text-xs font-medium">{propVer(e)}</span></TD>
                <TD className="text-surface-600 text-xs truncate max-w-[110px]">{e.nextAction ?? "—"}</TD>
                <TD><OwnerCell e={e} /></TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalList({ events }: { events: PipelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Event Date","Venue","Guests","Proposal Value","Days Waiting","Follow-up","Owner","Risk","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const dw=daysWait(e); const fu=followUp(e);
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="text-surface-700">{e.guestCount.toLocaleString()}</TD>
                <TD className="font-semibold text-surface-900">{GBP.format(e.quoteCents/100)}</TD>
                <TD><span className={`font-semibold ${dw>10?"text-red-700":dw>5?"text-amber-700":"text-surface-700"}`}>{dw}d</span></TD>
                <TD><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${fuBadge[fu]}`}>{fu}</span></TD>
                <TD><OwnerCell e={e} /></TD>
                <TD>{e.riskLevel && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${RISK_BADGE[e.riskLevel]?.bg} ${RISK_BADGE[e.riskLevel]?.text}`}>{e.riskLevel}</span>}</TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmedList({ events }: { events: PipelineEvent[] }) {
  const MLS = ["Kick-off call","Site visit","Supplier contracts","Run-sheet draft","Final client review"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Date","Venue","Guests","Contract Value","Deposit","Readiness","Owner","Next Milestone","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const dep=depStatus(e);
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="text-surface-700">{e.guestCount.toLocaleString()}</TD>
                <TD className="font-semibold text-surface-900">{GBP.format(e.budgetCents/100)}</TD>
                <TD><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${depBadge[dep]}`}>{dep}</span></TD>
                <TD><Ring pct={e.readinessScore} size={34} color={e.readinessScore>=70?"#16a34a":"#f59e0b"} /></TD>
                <TD><OwnerCell e={e} /></TD>
                <TD className="text-surface-600 text-xs whitespace-nowrap">{MLS[strHash(e.id+"cnms")%5]}</TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryList({ events }: { events: PipelineEvent[] }) {
  const OPS = ["AV check","Guest registration","Dinner service","Keynote setup","Wrap & debrief"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Live Progress","Venue","Team Onsite","Run-sheet","Suppliers","Issues","Owner","Next Ops Action","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const oi=openIss(e); const sev=issSev(e); const rs=runSheet(e); const sr=suppReady(e);
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD>
                  <div><span className="text-xs font-semibold text-emerald-700">Day {liveDayOf(e)} of {liveDayTot(e)}</span>
                  <p className="text-[10px] text-surface-400 font-mono">{countdown(e)}</p></div>
                </TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="font-semibold text-surface-700">{teamSite(e)}</TD>
                <TD className="min-w-[90px]"><Bar pct={rs} color="bg-emerald-500" /></TD>
                <TD className="min-w-[90px]"><Bar pct={sr} /></TD>
                <TD>{oi>0?<span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sev==="High"?"bg-red-50 text-red-700":sev==="Medium"?"bg-amber-50 text-amber-700":"bg-surface-100 text-surface-600"}`}>{oi} {sev}</span>:<span className="text-xs text-green-600 font-medium">Clear</span>}</TD>
                <TD><OwnerCell e={e} /></TD>
                <TD className="text-surface-600 text-xs whitespace-nowrap">{OPS[strHash(e.id+"oa")%5]}</TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompletedList({ events }: { events: PipelineEvent[] }) {
  const POST = ["Invoice sent","Thank-you email","Photo delivery","Debrief scheduled","Rebooking call"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Date","Venue","Guests Attended","Final Revenue","Margin","Feedback","Post-event Action","Owner","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const fb=fbScore(e); const mp=marginPct(e); const att=attended(e);
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="text-surface-700">{att.toLocaleString()}</TD>
                <TD className="font-semibold text-surface-900">{GBP.format(e.budgetCents/100)}</TD>
                <TD><span className={`font-semibold ${mp>=40?"text-green-700":mp>=30?"text-amber-700":"text-red-700"}`}>{mp}%</span></TD>
                <TD>
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold text-surface-900">{fb}</span>
                    <span className="text-surface-400 text-xs">/5</span>
                  </div>
                </TD>
                <TD className="text-surface-600 text-xs whitespace-nowrap">{POST[strHash(e.id+"post")%5]}</TD>
                <TD><OwnerCell e={e} /></TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CancelledList({ events }: { events: PipelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-200">
          {["Event","Type","Client","Requested Date","Venue","Est. Value","Loss Reason","Recovery","Owner","Closed Date","Status",""].map(h=><TH key={h}>{h}</TH>)}
        </tr></thead>
        <tbody className="divide-y divide-surface-100">
          {events.map(e => {
            const rec=recovery(e); const lr=lossReason(e);
            const recCls=rec==="High"?"bg-green-50 text-green-700":rec==="Medium"?"bg-amber-50 text-amber-700":"bg-surface-100 text-surface-600";
            return (
              <tr key={e.id} className="hover:bg-surface-50 cursor-pointer">
                <TD><NameCell e={e} /></TD>
                <TD className="text-surface-600">{e.eventType ?? "—"}</TD>
                <TD className="text-surface-700">{e.client}</TD>
                <TD className="text-surface-600 whitespace-nowrap">{e.dateLabel}</TD>
                <TD className="text-surface-600 truncate max-w-[110px]">{e.venue ?? "TBC"}</TD>
                <TD className="font-semibold text-surface-900">{GBP.format(e.budgetCents/100)}</TD>
                <TD className="text-surface-600">{lr}</TD>
                <TD><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${recCls}`}>{rec}</span></TD>
                <TD><OwnerCell e={e} /></TD>
                <TD className="text-surface-600 text-xs whitespace-nowrap">{e.dateLabel}</TD>
                <TD><StatusPill status={e.status} /></TD>
                <ActionBtn />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared cell helpers ──────────────────────────────────────────────────────

function NameCell({ e }: { e: PipelineEvent }) {
  return (
    <div className="flex items-center gap-2">
      {e.isVip && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
      <span className="font-medium text-surface-900 truncate max-w-[150px]">{e.name}</span>
    </div>
  );
}

function OwnerCell({ e }: { e: PipelineEvent }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <Avatar initials={e.ownerInitials} size="xs" />
      <span className="text-surface-700 text-sm">{e.ownerName}</span>
    </div>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────

function EventCard({ e, stageKey }: { e: PipelineEvent; stageKey: string }) {
  const bp  = briefPct(e);
  const mp  = marginPct(e);
  const dep = depStatus(e);
  const rec = recovery(e);
  const ldo = liveDayOf(e);
  const ldt = liveDayTot(e);

  return (
    <div className="bg-white rounded-xl border border-surface-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col">
      {e.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.coverImageUrl} alt={e.name} className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32 bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center">
          <Building2 className="w-10 h-10 text-white/30" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              {e.isVip && <Star className="w-3.5 h-3.5 text-amber-500" />}
              <h3 className="font-semibold text-surface-900 text-sm leading-tight">{e.name}</h3>
            </div>
            <p className="text-xs text-surface-500">{e.client}</p>
          </div>
          <StatusPill status={e.status} />
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-surface-500"><CalendarDays className="w-3.5 h-3.5" /><span>{e.dateLabel}</span></div>
          <div className="flex items-center gap-1.5 text-surface-500"><Users className="w-3.5 h-3.5" /><span>{e.guestCount.toLocaleString()}</span></div>
          <div className="flex items-center gap-1.5 text-surface-500"><Wallet className="w-3.5 h-3.5" /><span className="font-semibold text-surface-700">{GBP.format(e.budgetCents/100)}</span></div>
          <div className="flex items-center gap-1.5 text-surface-500"><MapPin className="w-3.5 h-3.5" /><span className="truncate">{e.venue ?? "TBC"}</span></div>
        </div>

        {/* Stage extra */}
        <div className="flex-1">
          {(stageKey==="all"||stageKey==="confirmed") && (
            <div className="flex items-center justify-between">
              <Ring pct={e.readinessScore} size={32} color={e.readinessScore>=70?"#16a34a":"#f59e0b"} />
              {stageKey==="confirmed" ? (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${depBadge[dep]}`}>{dep}</span>
              ) : e.riskLevel && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${RISK_BADGE[e.riskLevel]?.bg} ${RISK_BADGE[e.riskLevel]?.text}`}>{e.riskLevel} Risk</span>
              )}
            </div>
          )}
          {stageKey==="new-enquiry" && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sla(e)==="Hot"?"bg-red-50 text-red-700":sla(e)==="Warm"?"bg-amber-50 text-amber-700":"bg-surface-100 text-surface-600"}`}>{sla(e)} Priority</span>
          )}
          {stageKey==="briefing" && (
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1"><span>Brief Completeness</span><span>{bp}%</span></div>
              <Bar pct={bp} color={bp>=70?"bg-green-500":bp>=40?"bg-amber-400":"bg-red-400"} />
            </div>
          )}
          {stageKey==="quoting" && (
            <div className="flex justify-between">
              <div><p className="text-[10px] text-surface-500">Quote</p><p className="text-sm font-semibold">{GBP.format(e.quoteCents/100)}</p></div>
              <div className="text-right"><p className="text-[10px] text-surface-500">Margin</p><p className={`text-sm font-semibold ${mp>=40?"text-green-700":mp>=30?"text-amber-700":"text-red-700"}`}>{mp}%</p></div>
            </div>
          )}
          {stageKey==="awaiting-approval" && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-surface-500">{daysWait(e)}d waiting</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${fuBadge[followUp(e)]}`}>{followUp(e)}</span>
            </div>
          )}
          {stageKey==="in-delivery" && (
            <div>
              <div className="flex justify-between mb-1"><span className="text-xs font-semibold text-emerald-700">Day {ldo} of {ldt}</span><span className="text-[10px] font-mono text-surface-400">{countdown(e)}</span></div>
              <Bar pct={runSheet(e)} color="bg-emerald-500" />
            </div>
          )}
          {stageKey==="completed" && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" /><span className="font-semibold">{fbScore(e)}/5</span></div>
              <span className={`text-sm font-semibold ${mp>=40?"text-green-700":"text-amber-700"}`}>{mp}% margin</span>
            </div>
          )}
          {stageKey==="cancelled" && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-surface-500">{lossReason(e)}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${rec==="High"?"bg-green-50 text-green-700":rec==="Medium"?"bg-amber-50 text-amber-700":"bg-surface-100 text-surface-600"}`}>{rec} Recovery</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-surface-100 flex items-center justify-between mt-auto">
          <OwnerCell e={e} />
          {e.nextAction && (
            <div className="flex items-center gap-1 text-[10px] text-surface-400">
              <ArrowRight className="w-3 h-3" />
              <span className="truncate max-w-[80px]">{e.nextAction}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardsGrid({ events, stageKey }: { events: PipelineEvent[]; stageKey: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {events.map(e => <EventCard key={e.id} e={e} stageKey={stageKey} />)}
    </div>
  );
}

// ─── Board (Kanban) ───────────────────────────────────────────────────────────

function BoardView({ events }: { events: PipelineEvent[] }) {
  const cols = STAGE_TABS.filter(t=>t.status).map(t => ({
    ...t, events: events.filter(e=>e.status===t.status),
  }));
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {cols.map(col => (
        <div key={col.key} className="flex-shrink-0 w-64">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-surface-700">{col.label}</span>
            <span className="text-[10px] bg-surface-100 text-surface-600 rounded-full px-2 py-0.5 font-semibold">{col.events.length}</span>
          </div>
          <div className="space-y-2">
            {col.events.map(e => (
              <div key={e.id} className="bg-white rounded-lg border border-surface-200 p-3 cursor-pointer hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <p className="text-xs font-semibold text-surface-900 leading-tight">{e.name}</p>
                  {e.isVip && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                </div>
                <p className="text-[10px] text-surface-500 mb-2">{e.client}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-surface-700">{GBP.format(e.budgetCents/100)}</span>
                  <Avatar initials={e.ownerInitials} size="xs" />
                </div>
                {e.readinessScore > 0 && (
                  <div className="mt-2">
                    <Bar pct={e.readinessScore} color={e.readinessScore>=70?"bg-green-500":"bg-amber-400"} />
                  </div>
                )}
              </div>
            ))}
            {col.events.length === 0 && (
              <div className="text-center py-6 text-surface-300 text-[11px]">No events</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Insight helpers ──────────────────────────────────────────────────────────

function InsightShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="w-72 bg-white border-l border-surface-200 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-4 pt-4 pb-3 border-b border-surface-200">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        <p className="text-xs text-surface-500 mt-0.5">{sub}</p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-surface-100">{children}</div>
    </div>
  );
}
function InsightSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2.5">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-surface-600">{label}</span>
      <span className="text-xs font-semibold text-surface-900">{value}</span>
    </div>
  );
}

// ─── Per-stage insight panels ─────────────────────────────────────────────────

function PipelineInsights({ events }: { events: PipelineEvent[] }) {
  const byStage = STAGE_TABS.filter(t=>t.status).map(t=>({
    label: t.label,
    count: events.filter(e=>e.status===t.status).length,
    value: events.filter(e=>e.status===t.status).reduce((a,e)=>a+e.budgetCents,0),
  }));
  const topClients = Object.entries(
    events.reduce((acc,e)=>{acc[e.client]=(acc[e.client]??0)+e.budgetCents;return acc;},{} as Record<string,number>)
  ).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return (
    <InsightShell title="Pipeline Insights" sub={`${events.length} events`}>
      <InsightSection title="Stage Breakdown">
        {byStage.map(s=>(
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="text-surface-600">{s.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-surface-900">{s.count}</span>
              <span className="text-surface-400 text-[10px]">{GBP.format(s.value/100)}</span>
            </div>
          </div>
        ))}
      </InsightSection>
      <InsightSection title="Top Clients">
        {topClients.map(([c,v])=><InsightRow key={c} label={c} value={GBP.format(v/100)} />)}
      </InsightSection>
    </InsightShell>
  );
}

function EnquiryInsights({ events }: { events: PipelineEvent[] }) {
  const types = Object.entries(events.reduce((acc,e)=>{if(e.eventType)acc[e.eventType]=(acc[e.eventType]??0)+1;return acc;},{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return (
    <InsightShell title="Enquiry Insights" sub={`${events.length} open enquiries`}>
      <InsightSection title="Priority Breakdown">
        <InsightRow label="🔴 Hot"      value={String(events.filter(e=>sla(e)==="Hot").length)} />
        <InsightRow label="🟡 Warm"     value={String(events.filter(e=>sla(e)==="Warm").length)} />
        <InsightRow label="⚪ Standard" value={String(events.filter(e=>sla(e)==="Standard").length)} />
      </InsightSection>
      <InsightSection title="Event Types">
        {types.map(([t,c])=><InsightRow key={t} label={t} value={String(c)} />)}
      </InsightSection>
      <InsightSection title="Est. Pipeline">
        <InsightRow label="Total value" value={GBP.format(events.reduce((a,e)=>a+e.budgetCents,0)/100)} />
        <InsightRow label="Avg event"   value={events.length?GBP.format(events.reduce((a,e)=>a+e.budgetCents,0)/events.length/100):"—"} />
      </InsightSection>
    </InsightShell>
  );
}

function BriefingInsights({ events }: { events: PipelineEvent[] }) {
  const avgBp = events.length?Math.round(events.reduce((a,e)=>a+briefPct(e),0)/events.length):0;
  return (
    <InsightShell title="Briefing Insights" sub={`${events.length} active briefs`}>
      <InsightSection title="Completeness">
        <div className="mb-2"><Bar pct={avgBp} /></div>
        <InsightRow label="Avg completion" value={`${avgBp}%`} />
        <InsightRow label="≥80% complete"  value={String(events.filter(e=>briefPct(e)>=80).length)} />
        <InsightRow label="Needs attention" value={String(events.filter(e=>briefPct(e)<40).length)} />
      </InsightSection>
      <InsightSection title="Pipeline Value">
        <InsightRow label="Total estimated" value={GBP.format(events.reduce((a,e)=>a+e.budgetCents,0)/100)} />
        <InsightRow label="Total guests"    value={events.reduce((a,e)=>a+e.guestCount,0).toLocaleString()} />
      </InsightSection>
    </InsightShell>
  );
}

function QuotingInsights({ events }: { events: PipelineEvent[] }) {
  const avgMp = events.length?Math.round(events.reduce((a,e)=>a+marginPct(e),0)/events.length):0;
  return (
    <InsightShell title="Quoting Insights" sub={`${events.length} active quotes`}>
      <InsightSection title="Margin Health">
        <InsightRow label="Avg margin"      value={`${avgMp}%`} />
        <InsightRow label="High margin ≥40%" value={String(events.filter(e=>marginPct(e)>=40).length)} />
        <InsightRow label="At risk <30%"    value={String(events.filter(e=>marginPct(e)<30).length)} />
      </InsightSection>
      <InsightSection title="Quote Values">
        <InsightRow label="Total quotes" value={GBP.format(events.reduce((a,e)=>a+e.quoteCents,0)/100)} />
        <InsightRow label="Avg quote"    value={events.length?GBP.format(events.reduce((a,e)=>a+e.quoteCents,0)/events.length/100):"—"} />
      </InsightSection>
    </InsightShell>
  );
}

function ApprovalInsights({ events }: { events: PipelineEvent[] }) {
  const avgDw = events.length?Math.round(events.reduce((a,e)=>a+daysWait(e),0)/events.length):0;
  return (
    <InsightShell title="Approval Insights" sub={`${events.length} pending`}>
      <InsightSection title="Follow-up Status">
        {(["Sent","No Response","Declined","Pending"] as const).map(fu=>(
          <InsightRow key={fu} label={fu} value={String(events.filter(e=>followUp(e)===fu).length)} />
        ))}
      </InsightSection>
      <InsightSection title="Risk & Timing">
        <InsightRow label="Avg days waiting" value={`${avgDw}d`} />
        <InsightRow label="High risk"        value={String(events.filter(e=>e.riskLevel==="High").length)} />
        <InsightRow label="VIP pending"      value={String(events.filter(e=>e.isVip).length)} />
      </InsightSection>
    </InsightShell>
  );
}

function ConfirmedInsights({ events }: { events: PipelineEvent[] }) {
  const avgR = events.length?Math.round(events.reduce((a,e)=>a+e.readinessScore,0)/events.length):0;
  return (
    <InsightShell title="Confirmed Insights" sub={`${events.length} confirmed`}>
      <InsightSection title="Deposit Status">
        {(["Paid","Pending","Overdue"] as const).map(d=>(
          <InsightRow key={d} label={d} value={String(events.filter(e=>depStatus(e)===d).length)} />
        ))}
      </InsightSection>
      <InsightSection title="Readiness">
        <div className="mb-2"><Bar pct={avgR} /></div>
        <InsightRow label="Avg readiness" value={`${avgR}%`} />
        <InsightRow label="≥80% ready"    value={String(events.filter(e=>e.readinessScore>=80).length)} />
        <InsightRow label="At risk <50%"  value={String(events.filter(e=>e.readinessScore<50).length)} />
      </InsightSection>
      <InsightSection title="Value">
        <InsightRow label="Total confirmed" value={GBP.format(events.reduce((a,e)=>a+e.budgetCents,0)/100)} />
        <InsightRow label="Total guests"    value={events.reduce((a,e)=>a+e.guestCount,0).toLocaleString()} />
      </InsightSection>
    </InsightShell>
  );
}

function DeliveryInsights({ events }: { events: PipelineEvent[] }) {
  const totalIss = events.reduce((a,e)=>a+openIss(e),0);
  const avgRs = events.length?Math.round(events.reduce((a,e)=>a+runSheet(e),0)/events.length):0;
  return (
    <InsightShell title="Delivery Ops" sub={`${events.length} live events`}>
      <InsightSection title="Live Status">
        <InsightRow label="Total open issues" value={String(totalIss)} />
        <InsightRow label="High severity"     value={String(events.filter(e=>openIss(e)>0&&issSev(e)==="High").length)} />
        <InsightRow label="All clear"         value={String(events.filter(e=>openIss(e)===0).length)} />
      </InsightSection>
      <InsightSection title="Progress">
        <div className="mb-1"><Bar pct={avgRs} color="bg-emerald-500" /></div>
        <InsightRow label="Avg run-sheet"  value={`${avgRs}%`} />
        <InsightRow label="Total onsite"   value={String(events.reduce((a,e)=>a+teamSite(e),0))} />
        <InsightRow label="Total guests"   value={events.reduce((a,e)=>a+e.guestCount,0).toLocaleString()} />
      </InsightSection>
    </InsightShell>
  );
}

function CompletedInsights({ events }: { events: PipelineEvent[] }) {
  const avgFb  = events.length?(events.reduce((a,e)=>a+parseFloat(fbScore(e)),0)/events.length).toFixed(1):"0.0";
  const avgNps = events.length?Math.round(events.reduce((a,e)=>a+npsNum(e),0)/events.length):0;
  return (
    <InsightShell title="Completed Insights" sub={`${events.length} delivered`}>
      <InsightSection title="Client Satisfaction">
        <InsightRow label="Avg feedback" value={`${avgFb}/5`} />
        <InsightRow label="Avg NPS"      value={String(avgNps)} />
        <InsightRow label="5-star events" value={String(events.filter(e=>parseFloat(fbScore(e))>=4.5).length)} />
      </InsightSection>
      <InsightSection title="Revenue">
        <InsightRow label="Total revenue"  value={GBP.format(events.reduce((a,e)=>a+e.budgetCents,0)/100)} />
        <InsightRow label="Avg margin"     value={`${events.length?Math.round(events.reduce((a,e)=>a+marginPct(e),0)/events.length):0}%`} />
        <InsightRow label="Guests attended" value={events.reduce((a,e)=>a+attended(e),0).toLocaleString()} />
      </InsightSection>
    </InsightShell>
  );
}

function LossInsights({ events }: { events: PipelineEvent[] }) {
  const reasonCounts = LOSS_REASONS.map(lr=>({label:lr,count:events.filter(e=>lossReason(e)===lr).length})).sort((a,b)=>b.count-a.count);
  return (
    <InsightShell title="Loss Insights" sub={`${events.length} cancelled`}>
      <InsightSection title="Loss Reasons">
        {reasonCounts.map(r=><InsightRow key={r.label} label={r.label} value={String(r.count)} />)}
      </InsightSection>
      <InsightSection title="Recovery">
        <InsightRow label="High potential"   value={String(events.filter(e=>recovery(e)==="High").length)} />
        <InsightRow label="Medium potential" value={String(events.filter(e=>recovery(e)==="Medium").length)} />
        <InsightRow label="Lost value"       value={GBP.format(events.reduce((a,e)=>a+e.budgetCents,0)/100)} />
      </InsightSection>
    </InsightShell>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export function EventsPipelineClient({
  initialEvents,
  initialView = "list",
}: {
  initialEvents: PipelineEvent[];
  /** Seeds the view toggle — lets callers deep-link into the board/map view via a URL query param. */
  initialView?: ViewMode;
}) {
  const [stageKey, setStageKey] = useState("all");
  const [view, setView]         = useState<ViewMode>(initialView);
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<SortKey>("date");

  const stageTab = STAGE_TABS.find(t=>t.key===stageKey)!;

  const stageEvents = useMemo(()=>
    stageKey==="all" ? initialEvents : initialEvents.filter(e=>e.status===stageTab.status),
  [stageKey, stageTab, initialEvents]);

  const searched = useMemo(()=>
    search.trim()
      ? stageEvents.filter(e =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.client.toLowerCase().includes(search.toLowerCase()) ||
          (e.venue??"").toLowerCase().includes(search.toLowerCase())
        )
      : stageEvents,
  [search, stageEvents]);

  const sorted = useMemo(()=>{
    const arr=[...searched];
    if(sort==="name")      arr.sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==="date")      arr.sort((a,b)=>(a.startAt??"").localeCompare(b.startAt??""));
    if(sort==="budget")    arr.sort((a,b)=>b.budgetCents-a.budgetCents);
    if(sort==="guests")    arr.sort((a,b)=>b.guestCount-a.guestCount);
    if(sort==="readiness") arr.sort((a,b)=>b.readinessScore-a.readinessScore);
    return arr;
  },[searched,sort]);

  const counts = useMemo(()=>{
    const m:Record<string,number>={all:initialEvents.length};
    STAGE_TABS.filter(t=>t.status).forEach(t=>{m[t.key]=initialEvents.filter(e=>e.status===t.status).length;});
    return m;
  },[initialEvents]);

  const allowBoard = stageKey==="all";
  const allowMap   = stageKey==="all";
  const effectiveView:ViewMode = (view==="board"&&!allowBoard)||(view==="map"&&!allowMap) ? "list" : view;

  function renderInsights() {
    if(effectiveView==="board"||effectiveView==="map") return null;
    if(stageKey==="all")               return <PipelineInsights events={sorted} />;
    if(stageKey==="new-enquiry")       return <EnquiryInsights  events={sorted} />;
    if(stageKey==="briefing")          return <BriefingInsights events={sorted} />;
    if(stageKey==="quoting")           return <QuotingInsights  events={sorted} />;
    if(stageKey==="awaiting-approval") return <ApprovalInsights events={sorted} />;
    if(stageKey==="confirmed")         return <ConfirmedInsights events={sorted} />;
    if(stageKey==="in-delivery")       return <DeliveryInsights events={sorted} />;
    if(stageKey==="completed")         return <CompletedInsights events={sorted} />;
    return <LossInsights events={sorted} />;
  }

  function renderList() {
    if(sorted.length===0) return <div className={PX+" py-4"}><EmptyState /></div>;
    if(stageKey==="all")               return <AllEventsList events={sorted} />;
    if(stageKey==="new-enquiry")       return <EnquiriesList events={sorted} />;
    if(stageKey==="briefing")          return <BriefingList  events={sorted} />;
    if(stageKey==="quoting")           return <QuotingList   events={sorted} />;
    if(stageKey==="awaiting-approval") return <ApprovalList  events={sorted} />;
    if(stageKey==="confirmed")         return <ConfirmedList events={sorted} />;
    if(stageKey==="in-delivery")       return <DeliveryList  events={sorted} />;
    if(stageKey==="completed")         return <CompletedList events={sorted} />;
    return <CancelledList events={sorted} />;
  }

  return (
    <div className="flex flex-col h-full">

      {/* Page header */}
      <div className={`${PX} pt-6 pb-0 bg-white border-b border-surface-200`}>
        <div className="flex items-start justify-between gap-4 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Events Pipeline</h1>
            <p className="text-sm text-surface-500 mt-1">Manage every event from enquiry to delivery</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />Export
            </button>
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
              <Plus className="w-4 h-4" />New Event
            </button>
          </div>
        </div>

        {/* Stage tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {STAGE_TABS.map(tab=>(
            <button
              key={tab.key}
              onClick={()=>{setStageKey(tab.key);if(view==="board"||view==="map")setView("list");}}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2
                ${stageKey===tab.key
                  ?"border-brand-600 text-brand-700 bg-brand-50"
                  :"border-transparent text-surface-500 hover:text-surface-700 hover:bg-surface-50"}`}
            >
              {tab.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stageKey===tab.key?"bg-brand-100 text-brand-700":"bg-surface-100 text-surface-500"}`}>
                {counts[tab.key]??0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className={`${PX} py-4 bg-surface-50 border-b border-surface-200`}>
        <KpiStrip cards={kpiForStage(stageKey, stageEvents)} />
      </div>

      {/* Filter toolbar */}
      <div className={`${PX} py-3 bg-white border-b border-surface-200 flex items-center gap-3 flex-wrap`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text" value={search} onChange={ev=>setSearch(ev.target.value)}
            placeholder="Search events…"
            className="pl-9 pr-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white w-56"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-surface-400" />
          <select value={sort} onChange={ev=>setSort(ev.target.value as SortKey)}
            className="text-sm border border-surface-200 rounded-lg px-3 py-2 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="date">Date</option>
            <option value="budget">Budget</option>
            <option value="guests">Guests</option>
            <option value="readiness">Readiness</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-surface-400">{sorted.length} event{sorted.length!==1?"s":""}</span>
        <div className="flex items-center bg-surface-100 rounded-lg p-0.5 gap-0.5">
          {([
            {v:"list",  icon:<List className="w-4 h-4" />},
            {v:"cards", icon:<LayoutGrid className="w-4 h-4" />},
            ...(allowBoard?[{v:"board",icon:<Columns3 className="w-4 h-4" />}]:[]),
            ...(allowMap  ?[{v:"map",  icon:<MapPin   className="w-4 h-4" />}]:[]),
          ] as {v:string;icon:React.ReactNode}[]).map(({v,icon})=>(
            <button key={v} onClick={()=>setView(v as ViewMode)}
              className={`p-1.5 rounded transition-colors ${effectiveView===v?"bg-white shadow text-brand-700":"text-surface-500 hover:text-surface-700"}`}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {effectiveView==="map" ? (
            <div className="flex h-full"><EventMapView events={sorted} /></div>
          ) : effectiveView==="board" ? (
            <div className={`${PX} py-4 overflow-x-auto`}><BoardView events={sorted} /></div>
          ) : effectiveView==="cards" ? (
            <div className={`${PX} py-4`}>
              {sorted.length===0 ? <EmptyState /> : <CardsGrid events={sorted} stageKey={stageKey} />}
            </div>
          ) : (
            renderList()
          )}
        </div>
        {renderInsights()}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <CalendarDays className="w-12 h-12 text-surface-200 mb-4" />
      <h3 className="text-surface-700 font-semibold mb-1">No events found</h3>
      <p className="text-surface-400 text-sm">Try adjusting your search or filters</p>
    </div>
  );
}
