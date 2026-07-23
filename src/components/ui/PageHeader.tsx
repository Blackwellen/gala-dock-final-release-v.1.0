import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn("bg-white border-b border-surface-200", className)}>
      <div className="px-6 pt-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight sm:truncate">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-surface-500">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-wrap sm:shrink-0 sm:justify-end">
              {actions}
            </div>
          )}
        </div>
        {tabs && <div className="-mb-px">{tabs}</div>}
      </div>
    </div>
  );
}
