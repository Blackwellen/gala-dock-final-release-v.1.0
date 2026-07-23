"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Same Server→Client boundary rule as AutoSubmitSelect below: an onChange handler cannot be
// authored in a Server Component and passed down, so this checkbox chip is its own client leaf.
export function AutoSubmitCheckbox({
  name,
  checked,
  icon,
  label,
}: {
  name: string;
  checked: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
        checked ? "border-brand-300 bg-brand-50 text-brand-700" : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
      )}
    >
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="hidden"
      />
      {icon} {label}
    </label>
  );
}

// Premium-feel filter chips: selecting a value submits the parent <form> immediately instead of
// requiring a separate "Apply" click. Still a plain <select> inside a real <form method="get">,
// so URL state stays the single source of truth (a refreshed URL restores the same filters).
export function AutoSubmitSelect({
  name,
  label,
  value,
  options,
  optionLabels,
  className,
  includeBlank = true,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  className?: string;
  /** Set false when every option already has a concrete default (e.g. sort) — avoids a
   * blank placeholder option whose label duplicates the first real option's text. */
  includeBlank?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={className ?? "bg-transparent text-xs text-surface-700 focus:outline-none max-w-[140px]"}
    >
      {includeBlank && <option value="">{label}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {optionLabels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}
