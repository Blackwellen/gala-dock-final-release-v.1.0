"use client";

import { Bookmark, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolbarFilter {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

interface SupplierToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  moreFiltersCount?: number;
  onMoreFilters?: () => void;
  savedViewLabel?: string;
}

/**
 * Search + filter-dropdown toolbar row matching the reference images: search
 * input, up to 4 selects, "More Filters" (with active-count badge), a saved
 * view label and a bookmark toggle. Dropdown menus are plain `<select>`s in
 * this visual-only phase — full filter-drawer logic and saved-view
 * persistence land in a later phase.
 */
export function SupplierToolbar({
  query,
  onQueryChange,
  searchPlaceholder = "Search suppliers…",
  filters = [],
  moreFiltersCount,
  onMoreFilters,
  savedViewLabel = "Default View",
}: SupplierToolbarProps) {
  const selectCls =
    "appearance-none pl-3 pr-8 py-2 text-sm text-surface-700 border border-surface-200 rounded-lg bg-white hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
        <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
        />
      </div>

      {filters.map((f) => (
        <div key={f.label} className="relative">
          <select
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className={selectCls}
            aria-label={f.label}
          >
            <option value="all">{f.label}</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-surface-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
        </div>
      ))}

      <button
        type="button"
        onClick={onMoreFilters}
        className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg bg-white hover:bg-surface-50 transition-colors"
      >
        More Filters
        {!!moreFiltersCount && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold">
            {moreFiltersCount}
          </span>
        )}
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-surface-400">Saved views</span>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg bg-white hover:bg-surface-50 transition-colors"
          )}
        >
          {savedViewLabel}
          <ChevronDown className="w-3.5 h-3.5 text-surface-400" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Bookmark this view"
          className="p-2 rounded-lg border border-surface-200 bg-white text-surface-400 hover:text-brand-600 hover:bg-surface-50 transition-colors"
        >
          <Bookmark className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
