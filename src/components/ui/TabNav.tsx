"use client";

import { cn } from "@/lib/utils";

export interface Tab {
  id: string;
  label: string;
  count?: number;
  badge?: "warning" | "danger";
}

interface TabNavProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function TabNav({ tabs, active, onChange, className }: TabNavProps) {
  return (
    <div className={cn("flex gap-0 overflow-x-auto", className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-150",
              isActive
                ? "text-brand-600 border-brand-600 bg-brand-50/40"
                : "text-surface-500 border-transparent hover:text-surface-800 hover:border-surface-300"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold",
                  isActive
                    ? "bg-brand-100 text-brand-700"
                    : tab.badge === "danger"
                    ? "bg-danger-100 text-danger-700"
                    : tab.badge === "warning"
                    ? "bg-warning-100 text-warning-700"
                    : "bg-surface-200 text-surface-600"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
