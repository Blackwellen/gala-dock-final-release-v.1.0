import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-12 px-6" : "py-20 px-6", className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-brand-400" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-surface-500 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 animate-pulse", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn("h-4 bg-surface-100 rounded", i === 0 ? "w-3/4" : i % 2 === 0 ? "w-5/6" : "w-full")}
        />
      ))}
    </div>
  );
}
