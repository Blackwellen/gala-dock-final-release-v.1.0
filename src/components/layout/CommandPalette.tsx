"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildAppNav } from "@/lib/nav/app-nav";
import type { WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";

interface Command {
  label: string;
  href: string;
  group: string;
}

const CREATE_COMMANDS: Command[] = [
  { label: "New Event", href: "/event-manager/events/new", group: "Create" },
  { label: "New Supplier", href: "/event-manager/suppliers/new", group: "Create" },
  { label: "New Task", href: "/event-manager/tasks/new", group: "Create" },
  { label: "New Quote", href: "/event-manager/finance/quotes/new", group: "Create" },
  { label: "New Invoice", href: "/event-manager/finance/invoices/new", group: "Create" },
];

export function CommandPalette({
  open,
  onClose,
  workspaceType,
  flags,
}: {
  open: boolean;
  onClose: () => void;
  workspaceType: WorkspaceType;
  flags?: Partial<FlagMap>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo<Command[]>(() => {
    const nav = buildAppNav(workspaceType, flags).map((i) => ({
      label: i.label,
      href: i.href,
      group: "Go to",
    }));
    return [...nav, ...CREATE_COMMANDS];
  }, [workspaceType, flags]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.label.toLowerCase().includes(q));
  }, [all, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  function go(c: Command | undefined) {
    if (!c) return;
    onClose();
    router.push(c.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl border border-surface-200 shadow-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center gap-3 px-4 border-b border-surface-100">
          <Search className="w-4.5 h-4.5 text-surface-400 shrink-0" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            className="flex-1 py-3.5 text-sm text-surface-900 placeholder:text-surface-400 bg-transparent focus:outline-none"
          />
          <kbd className="text-[10px] font-mono bg-surface-100 border border-surface-200 px-1.5 py-0.5 rounded text-surface-400">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-surface-400">No matches for “{query}”.</p>
          ) : (
            results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <div key={`${c.href}-${i}`}>
                  {header && (
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                      {header}
                    </p>
                  )}
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(c)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                      i === active ? "bg-brand-50 text-brand-700" : "text-surface-700 hover:bg-surface-50"
                    )}
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-surface-300 shrink-0" />
                    <span className="flex-1 text-sm truncate">{c.label}</span>
                    {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
