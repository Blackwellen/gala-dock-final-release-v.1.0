"use client";

import Link from "next/link";
import { CalendarPlus, ListPlus, Building2, Users2, Receipt, Send, TrendingUp, CheckSquare } from "lucide-react";
import { openCopilot } from "@/lib/shell/copilot-bus";

const LINK_ACTIONS = [
  { label: "Create Event", href: "/event-manager/events/new", icon: CalendarPlus },
  { label: "Add Task", href: "/event-manager/tasks/new", icon: ListPlus },
  { label: "Find Venue", href: "/event-manager/venues", icon: Building2 },
  { label: "Find Supplier", href: "/event-manager/suppliers", icon: Users2 },
  { label: "Create Invoice", href: "/event-manager/finance/invoices/new", icon: Receipt },
  { label: "View Pipeline", href: "/event-manager/events?view=board", icon: TrendingUp },
  { label: "Client Approvals", href: "/event-manager/finance/quotes", icon: CheckSquare },
];

const BRIEFING_PROMPT =
  "Draft today's operational briefing: summarise active events, urgent/overdue tasks and payment risks I should know about, then let me review it before sending to the team.";

const actionClassName =
  "flex items-center gap-2 px-3 py-2.5 rounded-lg border border-surface-200 text-xs font-medium text-surface-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-all group";

export function QuickActionsPanel() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card flex flex-col h-full">
      <div className="px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-surface-900">Quick Actions</h2>
      </div>
      <div className="px-3 pb-3 grid grid-cols-2 gap-2 flex-1 content-start">
        {LINK_ACTIONS.slice(0, 5).map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className={actionClassName}>
            <Icon className="w-3.5 h-3.5 text-surface-400 group-hover:text-brand-500 transition-colors shrink-0" strokeWidth={1.8} />
            <span className="truncate">{label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => openCopilot(BRIEFING_PROMPT)} className={actionClassName}>
          <Send className="w-3.5 h-3.5 text-surface-400 group-hover:text-brand-500 transition-colors shrink-0" strokeWidth={1.8} />
          <span className="truncate">Send Briefing</span>
        </button>
        {LINK_ACTIONS.slice(5).map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className={actionClassName}>
            <Icon className="w-3.5 h-3.5 text-surface-400 group-hover:text-brand-500 transition-colors shrink-0" strokeWidth={1.8} />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
