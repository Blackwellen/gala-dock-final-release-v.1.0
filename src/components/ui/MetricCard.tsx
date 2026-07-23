import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; positive?: boolean };
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  href?: string;
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  iconColor = "text-brand-600",
  iconBg = "bg-brand-50",
  href,
  loading,
  className,
}: MetricCardProps) {
  const content = (
    <div
      className={cn(
        "bg-white rounded-xl border border-surface-200 px-5 py-4 flex items-start gap-4 shadow-card hover:shadow-md transition-shadow",
        href && "cursor-pointer",
        className
      )}
    >
      {Icon && (
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} strokeWidth={1.8} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-surface-500 uppercase tracking-wider truncate">
          {label}
        </p>
        {loading ? (
          <div className="mt-1.5 h-7 w-20 bg-surface-100 rounded animate-pulse" />
        ) : (
          <p className="mt-0.5 text-2xl font-bold text-surface-900 tabular-nums">{value}</p>
        )}
        {delta && (
          <p className={cn("mt-1 text-xs font-medium", delta.positive ? "text-success-600" : "text-danger-600")}>
            {delta.positive ? "↑" : "↓"} {delta.value}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export function KPIGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4", className)}>
      {children}
    </div>
  );
}
