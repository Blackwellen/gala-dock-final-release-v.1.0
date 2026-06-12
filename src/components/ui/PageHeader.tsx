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
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight truncate">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-surface-500">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {actions}
            </div>
          )}
        </div>
        {tabs && <div className="-mb-px">{tabs}</div>}
      </div>
    </div>
  );
}
