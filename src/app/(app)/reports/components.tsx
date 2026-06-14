import { cn } from "@/lib/utils";

/** GBP formatter with no minor units — report figures are whole-pound rounded. */
export function money(pounds: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pounds);
}

/** Section card wrapper used across all report tabs. */
export function ReportCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-white rounded-xl border border-surface-200 shadow-card", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-surface-100">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-surface-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-surface-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Horizontal stacked bar (CSS only) for percentage distributions. */
export function StackedBar({
  segments,
}: {
  segments: { label: string; pct: number; color: string }[];
}) {
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-surface-100">
        {segments.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            className={cn("h-full", s.color)}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.pct}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <span key={`${s.label}-lbl-${i}`} className="inline-flex items-center gap-1.5 text-xs text-surface-600">
            <span className={cn("w-2.5 h-2.5 rounded-sm", s.color)} />
            {s.label} <span className="font-semibold text-surface-800 tabular-nums">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact insight tile for the "quick insights" rows. */
export function InsightTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card px-5 py-4">
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-surface-900">{value}</p>
    </div>
  );
}
