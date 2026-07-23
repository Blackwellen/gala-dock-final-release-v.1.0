"use client";

// Shared primitives reused across the five Files & Asset Library screens
// (Files, Templates, Event Packs, Brand Assets, Supplier Documents):
// insight card wrapper, donut chart, bar list, owner avatar and the
// grid/list view switcher.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export function OwnerAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      title={name}
      className={cn(
        "rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center shrink-0",
        size === "sm" ? "w-6 h-6 text-[10px]" : "w-5 h-5 text-[9px]"
      )}
    >
      {initials || "?"}
    </div>
  );
}

export function InsightCard({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const DONUT_COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#22c55e", "#ef4444", "#a855f7"];

export function Donut({
  segments, centerLabel, centerValue,
}: {
  segments: { label: string; value: number; color?: string }[];
  centerLabel: string;
  centerValue: number | string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  const arcs = segments.reduce<{ label: string; color?: string; dash: number; offset: number }[]>((acc, s) => {
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    const dash = (s.value / total) * circumference;
    acc.push({ label: s.label, color: s.color, dash, offset: prevOffset });
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {arcs.map((s, i) => (
            <circle
              key={s.label}
              cx="50" cy="50" r={radius} fill="none"
              stroke={s.color ?? DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="12"
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-surface-900 tabular-nums">{centerValue}</span>
          <span className="text-[10px] text-surface-400 text-center leading-tight px-2">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 min-w-0 text-surface-600 truncate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color ?? DONUT_COLORS[i % DONUT_COLORS.length] }} />
              {s.label}
            </span>
            <span className="font-semibold text-surface-800 tabular-nums shrink-0">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({
  items, maxItems = 6, colorClass = "bg-brand-500",
}: { items: { label: string; value: number; danger?: boolean }[]; maxItems?: number; colorClass?: string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = Math.max(...sorted.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {sorted.map((item) => (
        <li key={item.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-surface-600 truncate">{item.label}</span>
            <span className="font-semibold text-surface-800 tabular-nums shrink-0 ml-2">{item.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div
              className={cn("h-full rounded-full", item.danger ? "bg-danger-500" : colorClass)}
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
      {sorted.length === 0 && <li className="text-xs text-surface-400">No data yet.</li>}
    </ul>
  );
}

/**
 * Grid/list view switcher. Persists the choice via the `view` query param so
 * each library screen's server component can read `searchParams.view` and
 * render the matching card or table layout — no client-only state that would
 * reset the view on navigation.
 */
export function ViewSwitcher({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "grid";

  function setView(next: "grid" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-surface-200 bg-white p-0.5 shrink-0">
      <button
        type="button"
        onClick={() => setView("grid")}
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          view === "grid" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:text-surface-600"
        )}
      >
        <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={() => setView("list")}
        aria-label="List view"
        aria-pressed={view === "list"}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          view === "list" ? "bg-brand-50 text-brand-600" : "text-surface-400 hover:text-surface-600"
        )}
      >
        <List className="w-4 h-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}

export function LibraryTabs({ active, basePath }: { active: string; basePath: string }) {
  const TABS: { key: string; label: string; href: string }[] = [
    { key: "files", label: "Files", href: `${basePath}/files` },
    { key: "templates", label: "Templates", href: `${basePath}/templates` },
    { key: "event-packs", label: "Event Packs", href: `${basePath}/event-packs` },
    { key: "brand-assets", label: "Brand Assets", href: `${basePath}/brand-assets` },
    { key: "supplier-docs", label: "Supplier Documents", href: `${basePath}/supplier-docs` },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-surface-200 px-6">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === t.key
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-surface-500 hover:text-surface-800"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
