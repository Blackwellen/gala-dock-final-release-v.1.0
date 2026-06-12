/**
 * Reusable shell for Level-1 stub pages — renders a titled placeholder
 * until the full page is built in later phases.
 */
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./PageHeader";

interface SectionShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function SectionShell({
  title,
  description,
  icon: Icon,
  actions,
  tabs,
  children,
  className,
}: SectionShellProps) {
  return (
    <div className={cn("animate-fade-in", className)}>
      <PageHeader title={title} description={description} actions={actions} tabs={tabs} />
      <div className="p-6">
        {children ?? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {Icon && (
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
                <Icon className="w-7 h-7 text-brand-400" strokeWidth={1.4} />
              </div>
            )}
            <p className="text-sm font-semibold text-surface-700">{title}</p>
            <p className="mt-1.5 text-sm text-surface-400 max-w-xs">
              This section is being built. Full components arrive in the next phase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
