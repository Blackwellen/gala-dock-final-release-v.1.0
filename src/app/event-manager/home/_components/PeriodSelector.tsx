"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS, type DashboardRange } from "../range-options";

export function PeriodSelector({ value }: { value: DashboardRange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = RANGE_OPTIONS.find((r) => r.value === value) ?? RANGE_OPTIONS[1];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
      >
        <Calendar className="w-4 h-4 text-surface-400" strokeWidth={1.8} />
        {current.label}
        <ChevronDown className="w-3.5 h-3.5 text-surface-400" strokeWidth={2} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1.5 w-44 bg-white rounded-lg border border-surface-200 shadow-lg py-1 overflow-hidden"
        >
          {RANGE_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  setOpen(false);
                  router.push(`${pathname}?range=${opt.value}`);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-surface-50 transition-colors",
                  opt.value === value ? "text-brand-600 font-semibold bg-brand-50" : "text-surface-700"
                )}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
