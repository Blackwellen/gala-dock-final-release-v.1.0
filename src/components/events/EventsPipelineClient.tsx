"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus, Download, Upload, Search, SlidersHorizontal,
  List, LayoutGrid, Columns3, ArrowUpDown, ChevronDown,
  MoreHorizontal, CalendarDays, Users, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Building2, Zap, Target, Clock, MapPin, BarChart3,
  Star, ArrowRight, Filter,
} from "lucide-react";
import type { UiEventStatus } from "@/app/event-manager/events/_lib";
import { formatGbpFromCents } from "@/app/event-manager/events/_lib";

/* ─── Types ──────────────────────────────────────────────────────────────── */

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

type ViewMode = "list" | "cards" | "board";
type StageKey = "all" | "new-enquiries" | "briefing" | "quoting" | "awaiting-approval" | "confirmed" | "in-delivery" | "completed" | "cancelled-lost";

/* ─── Stage config ───────────────────────────────────────────────────────── */

const STAGES: { key: StageKey; label: string; status: UiEventStatus | null; color: string; dotColor: string }[] = [
  { key: "all",              label: "All Events",       status: null,                 color: "text-surface-600",  dotColor: "bg-surface-400" },
  { key: "new-enquiries",    label: "New Enquiries",    status: "new-enquiry",        color: "text-violet-600",   dotColor: "bg-violet-500"  },
  { key: "briefing",         label: "Briefing",         status: "briefing",           color: "text-info-600",     dotColor: "bg-info-500"    },
  { key: "quoting",          label: "Quoting",          status: "quoting",            color: "text-warning-600",  dotColor: "bg-warning-500" },
  { key: "awaiting-approval",label: "Awaiting Approval",status: "awaiting-approval",  color: "text-orange-600",   dotColor: "bg-orange-500"  },
  { key: "confirmed",        label: "Confirmed",        status: "confirmed",          color: "text-success-600",  dotColor: "bg-success-500" },
  { key: "in-delivery",      label: "In Delivery",      status: "in-delivery",        color: "text-brand-600",    dotColor: "bg-brand-500"   },
  { key: "completed",        label: "Completed",        status: "completed",          color: "text-emerald-600",  dotColor: "bg-emerald-500" },
  { key: "cancelled-lost",   label: "Cancelled/Lost",   status: "cancelled",          color: "text-danger-600",   dotColor: "bg-danger-500"  },
];

/* ─── Status badge ───────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<UiEventStatus, { label: string; cls: string }> = {
  "new-enquiry":        { label: "New Enquiry",      cls: "bg-violet-100 text-violet-700" },
  "briefing":           { label: "Briefing",          cls: "bg-info-50 text-info-600 border border-info-200" },
  "quoting":            { label: "Quoting",           cls: "bg-warning-50 text-warning-700 border border-warning-200" },
  "awaiting-approval":  { label: "Awaiting Approval", cls: "bg-orange-50 text-orange-700 border border-orange-200" },
  "confirmed":          { label: "Confirmed",         cls: "bg-success-50 text-success-700 border border-success-200" },
  "in-delivery":        { label: "In Delivery",       cls: "bg-brand-50 text-brand-700 border border-brand-200" },
  "completed":          { label: "Completed",         cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  "cancelled":          { label: "Cancelled",         cls: "bg-danger-50 text-danger-700 border border-danger-200" },
};

function StatusBadge({ status }: { status: UiEventStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES["new-enquiry"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

/* ─── Readiness circle ───────────────────────────────────────────────────── */

function ReadinessCircle({ pct }: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#e4e7ef" strokeWidth="3.5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 18 18)" />
        <text x="18" y="22" textAnchor="middle" fontSize="8" fontWeight="700" fill={color}>{pct}%</text>
      </svg>
    </div>
  );
}

/* ─── Owner avatar ───────────────────────────────────────────────────────── */

function OwnerAvatar({ initials, name }: { initials: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5" title={name}>
      <div className="h-6 w-6 rounded-full bg-brand-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
        {initials}
      </div>
      <span className="text-xs text-surface-600 truncate max-w-[80px]">{name}</span>
    </div>
  );
}

/* ─── Event thumbnail ────────────────────────────────────────────────────── */

function EventThumb({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} width={size} height={size}
        className="rounded-lg object-cover shrink-0 bg-surface-100"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-brand-600", "bg-violet-600", "bg-info-600", "bg-success-600", "bg-warning-600"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`${bg} rounded-lg flex items-center justify-center shrink-0 text-white font-bold`}
      style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {initials}
    </div>
  );
}

/* ─── KPI strip ──────────────────────────────────────────────────────────── */

interface KpiCard {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | null;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

function KpiStrip({ cards }: { cards: KpiCard[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-white rounded-xl border border-surface-200 px-4 py-3.5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 leading-none">{c.label}</p>
                <p className="mt-1.5 text-[22px] font-bold text-surface-900 leading-none tracking-tight truncate">{c.value}</p>
                {c.sub && (
                  <p className="mt-1 text-[11px] text-surface-400 flex items-center gap-1">
                    {c.trend === "up" && <TrendingUp className="h-3 w-3 text-success-600" />}
                    {c.trend === "down" && <TrendingDown className="h-3 w-3 text-danger-600" />}
                    {c.sub}
                  </p>
                )}
              </div>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${c.iconBg}`}>
                <Icon className={`h-4 w-4 ${c.iconColor}`} strokeWidth={1.8} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Stage-specific KPI computation ────────────────────────────────────── */

function gbpM(cents: number): string {
  const m = cents / 100 / 1_000_000;
  if (m >= 1) return `£${m.toFixed(2)}M`;
  const k = cents / 100 / 1_000;
  if (k >= 1) return `£${k.toFixed(0)}K`;
  return formatGbpFromCents(cents);
}

function computeKpis(stage: StageKey, events: PipelineEvent[]): KpiCard[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const total = events.length;
  const pipelineValue = events.reduce((s, e) => s + e.budgetCents, 0);
  const atRisk = events.filter(e => e.riskLevel === "high" || e.riskLevel === "critical").length;
  const upcomingWeek = events.filter(e => {
    if (!e.startAt) return false;
    const d = new Date(e.startAt);
    return d >= today && d <= weekEnd;
  }).length;

  switch (stage) {
    case "all": {
      const active = events.filter(e => e.status !== "completed" && e.status !== "cancelled").length;
      const confirmed = events.filter(e => e.status === "confirmed").length;
      const awaiting = events.filter(e => e.status === "awaiting-approval").length;
      return [
        { label: "Active Events",      value: String(active),       sub: `${total} total`,          icon: CalendarDays, iconColor: "text-brand-600",   iconBg: "bg-brand-50" },
        { label: "Confirmed",          value: String(confirmed),    sub: "Ready to deliver",        icon: CheckCircle2, iconColor: "text-success-600", iconBg: "bg-success-50" },
        { label: "Awaiting Approval",  value: String(awaiting),     sub: "Decisions pending",       icon: Clock,        iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "At Risk",            value: String(atRisk),       sub: "Flagged high risk",       icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Pipeline Value",     value: gbpM(pipelineValue),  sub: "Active + confirmed",      icon: Wallet,       iconColor: "text-violet-600",  iconBg: "bg-violet-50", trend: "up" },
        { label: "Upcoming This Week", value: String(upcomingWeek), sub: "Starting in 7 days",      icon: Star,         iconColor: "text-info-600",    iconBg: "bg-info-50" },
      ];
    }
    case "new-enquiries": {
      const value = events.reduce((s, e) => s + e.budgetCents, 0);
      const hot = events.filter(e => e.isVip || e.riskLevel === null).length;
      const dueToday = events.filter(e => e.nextActionDue === new Date().toISOString().split("T")[0]).length;
      return [
        { label: "New Enquiries",      value: String(total),         sub: "Active in stage",        icon: CalendarDays, iconColor: "text-violet-600",  iconBg: "bg-violet-50" },
        { label: "Est. Pipeline Value",value: gbpM(value),           sub: "Combined budget",        icon: Wallet,       iconColor: "text-brand-600",   iconBg: "bg-brand-50",   trend: "up" },
        { label: "Hot Leads",          value: String(hot),           sub: "VIP or priority",        icon: Zap,          iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "Response Due Today", value: String(dueToday),      sub: "Follow-up needed",       icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Avg Readiness",      value: `${Math.round(events.reduce((s,e)=>s+e.readinessScore,0)/Math.max(total,1))}%`, sub: "Brief completion",icon: Target, iconColor: "text-info-600", iconBg: "bg-info-50" },
        { label: "Upcoming This Week", value: String(upcomingWeek),  sub: "Start in 7 days",        icon: Star,         iconColor: "text-success-600", iconBg: "bg-success-50" },
      ];
    }
    case "briefing": {
      const avgReady = Math.round(events.reduce((s,e)=>s+e.readinessScore,0)/Math.max(total,1));
      const projected = events.reduce((s,e)=>s+e.budgetCents,0);
      const dueWeek = events.filter(e => {
        if (!e.nextActionDue) return false;
        const d = new Date(e.nextActionDue);
        return d >= today && d <= weekEnd;
      }).length;
      return [
        { label: "In Briefing",         value: String(total),       sub: "Active briefs",           icon: CalendarDays, iconColor: "text-info-600",    iconBg: "bg-info-50" },
        { label: "Brief Completion Avg",value: `${avgReady}%`,      sub: "Readiness score avg",     icon: Target,       iconColor: "text-brand-600",   iconBg: "bg-brand-50" },
        { label: "At Risk",             value: String(atRisk),      sub: "Flagged high risk",       icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Projected Revenue",   value: gbpM(projected),     sub: "If all confirmed",        icon: Wallet,       iconColor: "text-success-600", iconBg: "bg-success-50", trend: "up" },
        { label: "Briefs Due This Week",value: String(dueWeek),     sub: "Actions due",             icon: Clock,        iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "Upcoming This Week",  value: String(upcomingWeek),sub: "Starting in 7 days",      icon: Star,         iconColor: "text-violet-600",  iconBg: "bg-violet-50" },
      ];
    }
    case "quoting": {
      const quoted = events.reduce((s,e)=>s+e.quoteCents,0);
      const avgMargin = 31; // derived metric — show static until margin column exists
      const dueWeek = events.filter(e=>{if(!e.nextActionDue)return false;const d=new Date(e.nextActionDue);return d>=today&&d<=weekEnd;}).length;
      return [
        { label: "Quotes in Progress", value: String(total),       sub: "Active quotes",           icon: CalendarDays, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "Quoted Value",        value: gbpM(quoted),        sub: "Total quote value",       icon: Wallet,       iconColor: "text-brand-600",   iconBg: "bg-brand-50",   trend: "up" },
        { label: "Avg Target Margin",   value: `${avgMargin}%`,     sub: "Est. profit margin",      icon: TrendingUp,   iconColor: "text-success-600", iconBg: "bg-success-50" },
        { label: "At Risk",             value: String(atRisk),      sub: "Awaiting response",       icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Due to Send This Wk", value: String(dueWeek),     sub: "Quote deadlines",         icon: Clock,        iconColor: "text-orange-600",  iconBg: "bg-orange-50" },
        { label: "Avg Readiness",       value: `${Math.round(events.reduce((s,e)=>s+e.readinessScore,0)/Math.max(total,1))}%`, sub: "Quote completion", icon: Target, iconColor: "text-info-600", iconBg: "bg-info-50" },
      ];
    }
    case "awaiting-approval": {
      const value = events.reduce((s,e)=>s+e.quoteCents,0);
      const dueWeek = events.filter(e=>{if(!e.nextActionDue)return false;const d=new Date(e.nextActionDue);return d>=today&&d<=weekEnd;}).length;
      const overdue = events.filter(e=>{if(!e.nextActionDue)return false;return new Date(e.nextActionDue)<today;}).length;
      return [
        { label: "Awaiting Approval",   value: String(total),       sub: "Pending decisions",       icon: Clock,        iconColor: "text-orange-600",  iconBg: "bg-orange-50" },
        { label: "Approval Value",      value: gbpM(value),         sub: "Revenue at stake",        icon: Wallet,       iconColor: "text-brand-600",   iconBg: "bg-brand-50" },
        { label: "Follow-ups Overdue",  value: String(overdue),     sub: "Past due date",           icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Decision This Week",  value: String(dueWeek),     sub: "Expected responses",      icon: CheckCircle2, iconColor: "text-success-600", iconBg: "bg-success-50" },
        { label: "At Risk",             value: String(atRisk),      sub: "High priority",           icon: Zap,          iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "Avg Wait Days",       value: "9d",                sub: "Awaiting response",       icon: BarChart3,    iconColor: "text-info-600",    iconBg: "bg-info-50" },
      ];
    }
    case "confirmed": {
      const revenue = events.reduce((s,e)=>s+e.budgetCents,0);
      const guests = events.reduce((s,e)=>s+e.guestCount,0);
      const avgReady = Math.round(events.reduce((s,e)=>s+e.readinessScore,0)/Math.max(total,1));
      return [
        { label: "Confirmed Events",    value: String(total),       sub: "Ready to plan",           icon: CheckCircle2, iconColor: "text-success-600", iconBg: "bg-success-50" },
        { label: "Confirmed Revenue",   value: gbpM(revenue),       sub: "Locked value",            icon: Wallet,       iconColor: "text-brand-600",   iconBg: "bg-brand-50",   trend: "up" },
        { label: "Planning Readiness",  value: `${avgReady}%`,      sub: "Avg readiness score",     icon: Target,       iconColor: "text-info-600",    iconBg: "bg-info-50" },
        { label: "Guest Count Total",   value: guests.toLocaleString("en-GB"), sub: "Across all events", icon: Users, iconColor: "text-violet-600",  iconBg: "bg-violet-50" },
        { label: "Upcoming This Month", value: String(upcomingWeek),sub: "Next 7 days",             icon: CalendarDays, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "At Risk",             value: String(atRisk),      sub: "Needs attention",         icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
      ];
    }
    case "in-delivery": {
      const revenue = events.reduce((s,e)=>s+e.budgetCents,0);
      const avgReady = Math.round(events.reduce((s,e)=>s+e.readinessScore,0)/Math.max(total,1));
      const issues = events.filter(e=>e.riskLevel==="high"||e.riskLevel==="critical").length;
      return [
        { label: "Live This Week",      value: String(upcomingWeek),sub: "Starting in 7 days",      icon: Zap,          iconColor: "text-brand-600",   iconBg: "bg-brand-50" },
        { label: "Revenue in Delivery", value: gbpM(revenue),       sub: "Locked value",            icon: Wallet,       iconColor: "text-success-600", iconBg: "bg-success-50", trend: "up" },
        { label: "Run-sheet Avg",       value: `${avgReady}%`,      sub: "Progress completion",     icon: Target,       iconColor: "text-info-600",    iconBg: "bg-info-50" },
        { label: "Open Issues",         value: String(issues),      sub: "High priority items",     icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Total in Delivery",   value: String(total),       sub: "Active events",           icon: CalendarDays, iconColor: "text-violet-600",  iconBg: "bg-violet-50" },
        { label: "Supplier Readiness",  value: `${Math.max(0, avgReady - 5)}%`, sub: "Confirmed suppliers", icon: Building2, iconColor: "text-warning-600", iconBg: "bg-warning-50" },
      ];
    }
    case "completed": {
      const revenue = events.reduce((s,e)=>s+e.budgetCents,0);
      const avgFeedback = 4.7;
      return [
        { label: "Completed Events",    value: String(total),       sub: "Total delivered",         icon: CheckCircle2, iconColor: "text-emerald-600", iconBg: "bg-emerald-50" },
        { label: "Delivered Revenue",   value: gbpM(revenue),       sub: "Total earned",            icon: Wallet,       iconColor: "text-brand-600",   iconBg: "bg-brand-50",   trend: "up" },
        { label: "Avg Margin",          value: "42%",               sub: "Profit margin",           icon: TrendingUp,   iconColor: "text-success-600", iconBg: "bg-success-50" },
        { label: "Avg Feedback Score",  value: `${avgFeedback}/5`,  sub: "Client satisfaction",     icon: Star,         iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "Wrap-ups Outstanding",value: String(atRisk),      sub: "Post-event actions",      icon: Clock,        iconColor: "text-orange-600",  iconBg: "bg-orange-50" },
        { label: "Repeat Potential",    value: gbpM(Math.round(revenue * 0.33)), sub: "Est. repeat value", icon: Zap, iconColor: "text-violet-600", iconBg: "bg-violet-50", trend: "up" },
      ];
    }
    case "cancelled-lost": {
      const lost = events.reduce((s,e)=>s+e.budgetCents,0);
      const recovery = events.filter(e=>!e.riskLevel||e.riskLevel==="low").length;
      return [
        { label: "Cancelled/Lost",      value: String(total),       sub: "Total this period",       icon: AlertTriangle,iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Lost Pipeline Value", value: gbpM(lost),          sub: "Revenue lost",            icon: Wallet,       iconColor: "text-surface-600", iconBg: "bg-surface-100", trend: "down" },
        { label: "Top Loss Reason",     value: "Budget",            sub: "Most common reason",      icon: BarChart3,    iconColor: "text-warning-600", iconBg: "bg-warning-50" },
        { label: "Recovery Opps",       value: String(recovery),    sub: "Potential to re-engage",  icon: Zap,          iconColor: "text-success-600", iconBg: "bg-success-50" },
        { label: "Cancellation Rate",   value: "18%",               sub: "As % of total pipeline",  icon: TrendingDown, iconColor: "text-danger-600",  iconBg: "bg-danger-50" },
        { label: "Closed This Quarter", value: String(total),       sub: "YTD cancelled",           icon: CalendarDays, iconColor: "text-surface-600", iconBg: "bg-surface-100" },
      ];
    }
    default:
      return [];
  }
}

/* ─── Stage insights panel ───────────────────────────────────────────────── */

function InsightsPanel({ stage, events, view }: { stage: StageKey; events: PipelineEvent[]; view: ViewMode }) {
  const totalValue = events.reduce((s,e)=>s+e.budgetCents,0);
  const byStatus = STAGES.filter(s=>s.status).map(s=>({
    ...s,
    count: events.filter(e=>e.status===s.status).length,
  }));
  const maxCount = Math.max(...byStatus.map(s=>s.count), 1);

  if (view === "board") {
    return (
      <div className="w-72 shrink-0 space-y-4">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
          <h3 className="text-xs font-semibold text-surface-900 mb-3 uppercase tracking-wide">Board Insights</h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-surface-500">Conversion Rate</span>
              <span className="text-xs font-bold text-success-600">24%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-surface-500">Total Pipeline</span>
              <span className="text-xs font-bold text-surface-900">{gbpM(totalValue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-surface-500">Overdue Approvals</span>
              <span className="text-xs font-bold text-danger-600">{events.filter(e=>e.status==="awaiting-approval"&&e.riskLevel).length}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
          <h3 className="text-xs font-semibold text-surface-900 mb-3 uppercase tracking-wide">Stage Distribution</h3>
          <div className="space-y-2">
            {byStatus.filter(s=>s.count>0).map(s=>(
              <div key={s.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-surface-500 truncate pr-2">{s.label}</span>
                  <span className="text-[11px] font-semibold text-surface-700 shrink-0">{s.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                  <div className={`h-full rounded-full ${s.dotColor}`} style={{ width: `${(s.count/maxCount)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 space-y-4">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
        <h3 className="text-xs font-semibold text-surface-900 mb-3 uppercase tracking-wide">
          {stage === "all" ? "Pipeline Overview" : `${STAGES.find(s=>s.key===stage)?.label ?? ""} Insights`}
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-500">Total Events</span>
            <span className="text-xs font-bold text-surface-900">{events.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-500">Pipeline Value</span>
            <span className="text-xs font-bold text-brand-600">{gbpM(totalValue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-500">At Risk</span>
            <span className="text-xs font-bold text-danger-600">{events.filter(e=>e.riskLevel==="high"||e.riskLevel==="critical").length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-500">VIP Events</span>
            <span className="text-xs font-bold text-warning-600">{events.filter(e=>e.isVip).length}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
        <h3 className="text-xs font-semibold text-surface-900 mb-3 uppercase tracking-wide">Stage Breakdown</h3>
        <div className="space-y-2">
          {byStatus.filter(s=>s.count>0).map(s=>(
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dotColor}`} />
                  <span className="text-[11px] text-surface-500 truncate">{s.label}</span>
                </div>
                <span className="text-[11px] font-semibold text-surface-700 shrink-0">{s.count}</span>
              </div>
              <div className="h-1 rounded-full bg-surface-100 overflow-hidden">
                <div className={`h-full rounded-full ${s.dotColor}`} style={{ width: `${(s.count/maxCount)*100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
        <h3 className="text-xs font-semibold text-surface-900 mb-3 uppercase tracking-wide">Quick Actions</h3>
        <div className="space-y-2">
          {[
            { label: "New Event", icon: Plus, href: "/event-manager/events/new" },
            { label: "Export Pipeline", icon: Download, href: "#" },
            { label: "View Calendar", icon: CalendarDays, href: "/event-manager/calendar" },
          ].map((a) => (
            <Link key={a.label} href={a.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-surface-700 hover:bg-surface-50 border border-surface-100 transition-colors">
              <a.icon className="h-3.5 w-3.5 text-surface-400" />
              {a.label}
              <ArrowRight className="ml-auto h-3 w-3 text-surface-300" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── List view ──────────────────────────────────────────────────────────── */

function ListView({ events }: { events: PipelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-surface-200">
        <CalendarDays className="h-10 w-10 text-surface-300 mb-3" />
        <p className="text-sm font-medium text-surface-600">No events in this stage</p>
        <p className="text-xs text-surface-400 mt-1">Add a new event or adjust your filters</p>
        <Link href="/event-manager/events/new"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="h-4 w-4" /> New Event
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      {/* Table header */}
      <div className="grid items-center border-b border-surface-200 bg-surface-50"
        style={{ gridTemplateColumns: "48px 1fr 100px 120px 130px 90px 70px 120px 80px 140px 120px 40px" }}>
        {["", "Event", "Type", "Client", "Venue", "Date", "Guests", "Budget", "Owner", "Readiness", "Status", ""].map((h, i) => (
          <div key={i} className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-surface-400 ${i === 0 ? "pl-4" : ""}`}>
            {h && (
              <button className="flex items-center gap-1 hover:text-surface-600 transition-colors">
                {h} {h && <ArrowUpDown className="h-2.5 w-2.5" />}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Table rows */}
      <div className="divide-y divide-surface-100">
        {events.map((e) => (
          <Link key={e.id} href={`/event-manager/events/${e.id}`}
            className="grid items-center hover:bg-surface-50 transition-colors group"
            style={{ gridTemplateColumns: "48px 1fr 100px 120px 130px 90px 70px 120px 80px 140px 120px 40px" }}>

            {/* Thumbnail */}
            <div className="pl-3 py-3">
              <EventThumb url={e.coverImageUrl} name={e.name} size={40} />
            </div>

            {/* Name */}
            <div className="px-3 py-3 min-w-0">
              <p className="text-sm font-semibold text-surface-900 truncate group-hover:text-brand-600 transition-colors">{e.name}</p>
              {e.eventType && <p className="text-[11px] text-surface-400 truncate">{e.eventType}</p>}
            </div>

            {/* Type chip */}
            <div className="px-3 py-3">
              {e.eventType ? (
                <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 whitespace-nowrap">
                  {e.eventType.slice(0, 12)}
                </span>
              ) : <span className="text-surface-300 text-xs">—</span>}
            </div>

            {/* Client */}
            <div className="px-3 py-3">
              <p className="text-xs text-surface-700 truncate">{e.client}</p>
            </div>

            {/* Venue */}
            <div className="px-3 py-3">
              {e.venue ? (
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 text-surface-400 shrink-0" />
                  <p className="text-xs text-surface-600 truncate">{e.venue}</p>
                </div>
              ) : <span className="text-surface-300 text-xs">—</span>}
            </div>

            {/* Date */}
            <div className="px-3 py-3">
              <div className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 text-surface-400 shrink-0" />
                <p className="text-xs text-surface-600 whitespace-nowrap">{e.dateLabel}</p>
              </div>
            </div>

            {/* Guests */}
            <div className="px-3 py-3">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-surface-400 shrink-0" />
                <p className="text-xs text-surface-600">{e.guestCount > 0 ? e.guestCount.toLocaleString("en-GB") : "—"}</p>
              </div>
            </div>

            {/* Budget */}
            <div className="px-3 py-3">
              <p className="text-xs font-semibold text-surface-700">{e.budgetCents > 0 ? formatGbpFromCents(e.budgetCents) : "—"}</p>
            </div>

            {/* Owner */}
            <div className="px-3 py-3">
              <OwnerAvatar initials={e.ownerInitials} name={e.ownerName} />
            </div>

            {/* Readiness */}
            <div className="px-3 py-3">
              <div className="flex items-center gap-2">
                <ReadinessCircle pct={e.readinessScore} />
                {e.nextAction && (
                  <p className="text-[10px] text-surface-400 truncate max-w-[80px]" title={e.nextAction}>{e.nextAction}</p>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="px-3 py-3">
              <StatusBadge status={e.status} />
            </div>

            {/* Menu */}
            <div className="px-2 py-3" onClick={ev => ev.preventDefault()}>
              <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>

          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Card view ──────────────────────────────────────────────────────────── */

function CardView({ events }: { events: PipelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-surface-200">
        <CalendarDays className="h-10 w-10 text-surface-300 mb-3" />
        <p className="text-sm font-medium text-surface-600">No events in this stage</p>
        <Link href="/event-manager/events/new"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="h-4 w-4" /> New Event
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {events.map((e) => (
        <Link key={e.id} href={`/event-manager/events/${e.id}`}
          className="group bg-white rounded-xl border border-surface-200 shadow-card hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden">

          {/* Card image */}
          <div className="relative h-44 bg-surface-100 overflow-hidden">
            {e.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.coverImageUrl} alt={e.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-600 to-violet-700">
                <span className="text-4xl font-bold text-white/20">{e.name.slice(0,2).toUpperCase()}</span>
              </div>
            )}
            {/* Top badges */}
            <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap max-w-[70%]">
              {e.eventType && (
                <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {e.eventType}
                </span>
              )}
              {e.isVip && (
                <span className="bg-warning-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">VIP</span>
              )}
            </div>
            {/* Status top-right */}
            <div className="absolute top-2.5 right-2.5">
              <StatusBadge status={e.status} />
            </div>
          </div>

          {/* Card body */}
          <div className="p-4 space-y-2.5">
            <div>
              <h3 className="text-sm font-bold text-surface-900 leading-tight line-clamp-2 group-hover:text-brand-600 transition-colors">{e.name}</h3>
              <p className="text-xs text-surface-500 mt-0.5">{e.client}</p>
            </div>

            <div className="space-y-1.5">
              {e.venue && (
                <div className="flex items-center gap-1.5 text-xs text-surface-500">
                  <MapPin className="h-3 w-3 text-surface-400 shrink-0" />
                  <span className="truncate">{e.venue}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-surface-500">
                <CalendarDays className="h-3 w-3 text-surface-400 shrink-0" />
                <span>{e.dateLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                {e.guestCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-surface-500">
                    <Users className="h-3 w-3 text-surface-400" />
                    <span>{e.guestCount.toLocaleString("en-GB")}</span>
                  </div>
                )}
                {e.budgetCents > 0 && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-surface-700">
                    <Wallet className="h-3 w-3 text-surface-400" />
                    <span>{formatGbpFromCents(e.budgetCents)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-surface-100">
              <OwnerAvatar initials={e.ownerInitials} name={e.ownerName} />
              <ReadinessCircle pct={e.readinessScore} />
            </div>

            {e.nextAction && (
              <div className="flex items-center gap-1.5 bg-surface-50 rounded-lg px-2.5 py-1.5">
                <ArrowRight className="h-3 w-3 text-surface-400 shrink-0" />
                <p className="text-[11px] text-surface-500 truncate">{e.nextAction}</p>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── Board view ──────────────────────────────────────────────────────────── */

const BOARD_STAGES = STAGES.filter(s => s.status !== null);

const STAGE_COL_COLORS: Record<string, { header: string; dot: string; badge: string }> = {
  "new-enquiries":     { header: "border-t-violet-500",  dot: "bg-violet-500",  badge: "bg-violet-100 text-violet-700" },
  "briefing":          { header: "border-t-info-500",    dot: "bg-info-500",    badge: "bg-info-50 text-info-600"      },
  "quoting":           { header: "border-t-warning-500", dot: "bg-warning-500", badge: "bg-warning-50 text-warning-700"},
  "awaiting-approval": { header: "border-t-orange-500",  dot: "bg-orange-500",  badge: "bg-orange-50 text-orange-700" },
  "confirmed":         { header: "border-t-success-500", dot: "bg-success-500", badge: "bg-success-50 text-success-700"},
  "in-delivery":       { header: "border-t-brand-500",   dot: "bg-brand-500",   badge: "bg-brand-50 text-brand-700"   },
  "completed":         { header: "border-t-emerald-500", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700"},
  "cancelled-lost":    { header: "border-t-danger-500",  dot: "bg-danger-500",  badge: "bg-danger-50 text-danger-700" },
};

function BoardView({ events }: { events: PipelineEvent[] }) {
  const byStage = useMemo(() => {
    const map = new Map<string, PipelineEvent[]>();
    for (const s of BOARD_STAGES) map.set(s.key, []);
    for (const e of events) {
      const stageKey = STAGES.find(s => s.status === e.status)?.key;
      if (stageKey && stageKey !== "all") {
        map.get(stageKey)?.push(e);
      }
    }
    return map;
  }, [events]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]" style={{ scrollSnapType: "x mandatory" }}>
      {BOARD_STAGES.map((stage) => {
        const cols = STAGE_COL_COLORS[stage.key] ?? { header: "border-t-surface-300", dot: "bg-surface-400", badge: "bg-surface-100 text-surface-600" };
        const stageEvents = byStage.get(stage.key) ?? [];
        const stageValue = stageEvents.reduce((s, e) => s + e.budgetCents, 0);

        return (
          <div key={stage.key} className="shrink-0 w-64 flex flex-col" style={{ scrollSnapAlign: "start" }}>
            {/* Column header */}
            <div className={`bg-white rounded-t-xl border border-b-0 border-surface-200 border-t-2 ${cols.header} px-3 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${cols.dot}`} />
                <span className="text-xs font-semibold text-surface-800 truncate">{stage.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cols.badge}`}>{stageEvents.length}</span>
              </div>
            </div>
            {stageValue > 0 && (
              <div className="bg-white border-x border-surface-200 px-3 pb-2">
                <span className="text-[10px] text-surface-400 font-medium">{gbpM(stageValue)}</span>
              </div>
            )}

            {/* Cards */}
            <div className="flex-1 bg-surface-50 border border-surface-200 rounded-b-xl overflow-y-auto max-h-[600px] p-2 space-y-2">
              {stageEvents.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-center">
                  <p className="text-[11px] text-surface-400">No events</p>
                </div>
              ) : stageEvents.map((e) => (
                <Link key={e.id} href={`/event-manager/events/${e.id}`}
                  className="block bg-white rounded-lg border border-surface-200 p-3 hover:border-brand-300 hover:shadow-sm transition-all group">
                  {/* Card image (small) */}
                  {e.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.coverImageUrl} alt={e.name}
                      className="w-full h-24 object-cover rounded-md mb-2 bg-surface-100" />
                  )}
                  <p className="text-xs font-semibold text-surface-900 leading-tight group-hover:text-brand-600 transition-colors line-clamp-2">{e.name}</p>
                  <p className="text-[10px] text-surface-400 mt-0.5 truncate">{e.client}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-surface-500">
                    <CalendarDays className="h-2.5 w-2.5 text-surface-400" />
                    <span>{e.dateLabel}</span>
                  </div>
                  {e.guestCount > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-surface-500 mt-1">
                      <Users className="h-2.5 w-2.5 text-surface-400" />
                      <span>{e.guestCount.toLocaleString("en-GB")} guests</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <OwnerAvatar initials={e.ownerInitials} name={e.ownerName} />
                    {e.budgetCents > 0 && (
                      <span className="text-[10px] font-bold text-surface-700">{formatGbpFromCents(e.budgetCents)}</span>
                    )}
                  </div>
                  {e.nextAction && (
                    <div className="mt-2 flex items-center gap-1 bg-surface-50 rounded px-2 py-1">
                      <ArrowRight className="h-2.5 w-2.5 text-surface-400 shrink-0" />
                      <p className="text-[10px] text-surface-400 truncate">{e.nextAction}</p>
                    </div>
                  )}
                  {e.riskLevel === "high" && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-danger-600">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      <span>High risk</span>
                    </div>
                  )}
                </Link>
              ))}

              {/* Add button */}
              <Link href={`/event-manager/events/new?stage=${stage.status}`}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-[11px] text-surface-400 hover:text-brand-600 hover:bg-white rounded-lg border border-dashed border-surface-200 hover:border-brand-300 transition-all">
                <Plus className="h-3 w-3" /> Add new event
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function EventsPipelineClient({ events }: { events: PipelineEvent[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const rawStage = sp.get("stage") ?? "all";
  const stage: StageKey = (STAGES.find(s => s.key === rawStage)?.key ?? "all") as StageKey;
  const view: ViewMode = (["list","cards","board"].includes(sp.get("view") ?? "list") ? sp.get("view") : "list") as ViewMode;

  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [sortBy, setSortBy] = useState(sp.get("sort") ?? "date");

  const push = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, sp]);

  /* ── Filter events by stage ─────────────────────────────────────────────── */
  const stageEvents = useMemo(() => {
    const stageConfig = STAGES.find(s => s.key === stage);
    let filtered = stageConfig?.status ? events.filter(e => e.status === stageConfig.status) : events;

    // search
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.client.toLowerCase().includes(q) ||
        (e.venue?.toLowerCase().includes(q)) ||
        (e.eventType?.toLowerCase().includes(q))
      );
    }

    // sort
    if (sortBy === "date") {
      filtered = [...filtered].sort((a, b) => {
        if (!a.startAt) return 1;
        if (!b.startAt) return -1;
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      });
    } else if (sortBy === "budget") {
      filtered = [...filtered].sort((a, b) => b.budgetCents - a.budgetCents);
    } else if (sortBy === "name") {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "readiness") {
      filtered = [...filtered].sort((a, b) => b.readinessScore - a.readinessScore);
    }

    return filtered;
  }, [events, stage, search, sortBy]);

  const stageCounts = useMemo(() => {
    const map = new Map<StageKey, number>();
    for (const s of STAGES) {
      if (s.status === null) {
        map.set(s.key, events.length);
      } else {
        map.set(s.key, events.filter(e => e.status === s.status).length);
      }
    }
    return map;
  }, [events]);

  const kpis = useMemo(() => computeKpis(stage, stageEvents), [stage, stageEvents]);

  return (
    <div className="animate-fade-in flex flex-col min-h-screen">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4 flex-wrap border-b border-surface-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-surface-900 tracking-tight">Events Pipeline</h1>
          <p className="text-sm text-surface-500 mt-0.5">Manage your full event lifecycle from enquiry to delivery</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
            <Upload className="w-3.5 h-3.5" strokeWidth={1.8} /> Import
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
            <Download className="w-3.5 h-3.5" strokeWidth={1.8} /> Export
          </button>
          <Link href="/event-manager/events/new"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> New Event
          </Link>
        </div>
      </div>

      {/* ── Stage tabs ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-surface-200 px-6">
        <div className="flex items-center gap-0.5 overflow-x-auto -mb-px scrollbar-hide">
          {STAGES.map((s) => {
            const count = stageCounts.get(s.key) ?? 0;
            const isActive = s.key === stage;
            return (
              <button key={s.key} onClick={() => push({ stage: s.key === "all" ? null : s.key })}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300"
                }`}>
                {s.label}
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "bg-surface-100 text-surface-500"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 bg-surface-50 border-b border-surface-200">
        <KpiStrip cards={kpis} />
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 bg-white border-b border-surface-200 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
          <input type="text" placeholder="Search events, clients, venues…"
            value={search}
            onChange={ev => setSearch(ev.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface-50 border border-surface-200 rounded-lg text-surface-700 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-colors" />
        </div>

        {/* Filters */}
        <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>

        {/* Saved views */}
        <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Saved views <ChevronDown className="h-3 w-3" />
        </button>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={ev => setSortBy(ev.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer">
            <option value="date">Sort: Date</option>
            <option value="budget">Sort: Budget</option>
            <option value="name">Sort: Name</option>
            <option value="readiness">Sort: Readiness</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-surface-400 pointer-events-none" />
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 bg-surface-100 rounded-lg p-1">
          {([
            { key: "list",  icon: List },
            { key: "cards", icon: LayoutGrid },
            { key: "board", icon: Columns3 },
          ] as const).map(({ key, icon: Icon }) => (
            <button key={key} onClick={() => push({ view: key === "list" ? null : key })}
              className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                view === key ? "bg-white shadow-sm text-brand-600" : "text-surface-400 hover:text-surface-600"
              }`}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content + insights panel ─────────────────────────────────────── */}
      <div className="flex-1 flex gap-4 px-6 py-5 bg-surface-50 min-h-0">

        {/* Left: content */}
        <div className="flex-1 min-w-0">
          {view === "list"  && <ListView events={stageEvents} />}
          {view === "cards" && <CardView events={stageEvents} />}
          {view === "board" && <BoardView events={stageEvents} />}
        </div>

        {/* Right: insights panel (hidden on board overflow) */}
        {view !== "board" && (
          <InsightsPanel stage={stage} events={stageEvents} view={view} />
        )}
      </div>

      {/* Results count */}
      <div className="px-6 py-2 border-t border-surface-200 bg-white">
        <p className="text-xs text-surface-400">
          Showing {stageEvents.length} {stageEvents.length === 1 ? "event" : "events"}
          {search && ` matching "${search}"`}
        </p>
      </div>
    </div>
  );
}
