import Link from "next/link";
import { cn } from "@/lib/utils";

export function InsightsRail({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <aside className={cn("w-full xl:w-[280px] shrink-0 flex flex-col gap-4", className)}>
      {children}
    </aside>
  );
}

export function RailCard({
  title,
  viewAllHref,
  children,
  footer,
}: {
  title: string;
  viewAllHref?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors shrink-0">
            View all
          </Link>
        )}
      </div>
      {children}
      {footer && <div className="mt-3 pt-3 border-t border-surface-100">{footer}</div>}
    </div>
  );
}

export function ActivityList({
  items,
}: {
  items: { name?: string; initials?: string; color?: string; text: string; timestamp: string }[];
}) {
  if (items.length === 0) {
    return <p className="text-xs text-surface-400">No recent activity.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 mt-0.5",
              item.color ?? "bg-surface-400"
            )}
          >
            {item.initials ?? item.name?.[0] ?? "•"}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-surface-700 leading-snug">{item.text}</p>
            <p className="text-[11px] text-surface-400 mt-0.5">{item.timestamp}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
