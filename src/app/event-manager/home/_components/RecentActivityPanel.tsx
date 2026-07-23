import Link from "next/link";
import { ArrowRight, CheckCircle2, Banknote, CalendarClock, UserPlus, Activity } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelative } from "@/lib/utils";
import type { ActivityItem } from "../data";

function iconFor(message: string) {
  if (message.includes("paid") || message.includes("Payment")) return { Icon: Banknote, cls: "bg-success-50 text-success-600" };
  if (message.includes("completed")) return { Icon: CheckCircle2, cls: "bg-success-50 text-success-600" };
  if (message.includes("onboarded")) return { Icon: UserPlus, cls: "bg-info-50 text-info-600" };
  if (message.includes("updated")) return { Icon: CalendarClock, cls: "bg-brand-50 text-brand-600" };
  return { Icon: Activity, cls: "bg-surface-100 text-surface-500" };
}

export function RecentActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-surface-900">Recent Activity</h2>
        <Link href="/event-manager/events" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          View all activity <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon={Activity} title="No recent activity" description="Payments, event updates and completed tasks will show up here." />
      ) : (
        <ul className="px-2 pb-2 flex-1">
          {items.map((item) => {
            const { Icon, cls } = iconFor(item.message);
            const content = (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-50 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cls}`}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-900 truncate">{item.message}</p>
                  {item.detail && <p className="text-xs text-surface-400 truncate">{item.detail}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-surface-400 mt-0.5">{formatRelative(item.at)}</span>
              </div>
            );
            return <li key={item.id}>{item.href ? <Link href={item.href}>{content}</Link> : content}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
