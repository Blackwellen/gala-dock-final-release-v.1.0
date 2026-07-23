import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert, Flag, Banknote, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AttentionItem, AttentionSeverity } from "../data";

const SEVERITY_STYLE: Record<AttentionSeverity, { badge: string; icon: typeof AlertTriangle }> = {
  overdue: { badge: "bg-danger-50 text-danger-600 border-danger-200", icon: AlertTriangle },
  "payment-overdue": { badge: "bg-danger-50 text-danger-600 border-danger-200", icon: Banknote },
  "due-today": { badge: "bg-warning-50 text-warning-600 border-warning-200", icon: AlertTriangle },
  "due-soon": { badge: "bg-warning-50 text-warning-600 border-warning-200", icon: AlertTriangle },
  "at-risk": { badge: "bg-danger-50 text-danger-600 border-danger-200", icon: ShieldAlert },
  flagged: { badge: "bg-danger-50 text-danger-600 border-danger-200", icon: Flag },
};

export function NeedsAttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-surface-900">Needs Attention</h2>
        <Link href="/event-manager/tasks" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          View all risks <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon={ListChecks} title="Nothing needs attention" description="Overdue tasks, at-risk events and overdue invoices will appear here." />
      ) : (
        <ul className="px-2 pb-2 flex-1">
          {items.map((item) => {
            const style = SEVERITY_STYLE[item.severity];
            const Icon = style.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-50 transition-colors"
                >
                  <div className={cn("w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5", style.badge)}>
                    <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-900 truncate">{item.title}</p>
                    <p className="text-xs text-surface-400 truncate">
                      {item.category}
                      {item.eventName ? ` · ${item.eventName}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap", style.badge)}>
                    {item.dueLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
