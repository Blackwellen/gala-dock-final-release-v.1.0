"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchWorkspace } from "@/lib/shell/actions";
import { WORKSPACE_TYPE_LABEL } from "@/lib/nav/app-nav";
import type { ShellWorkspace } from "@/lib/shell/data";

function badge(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  subtitle,
  variant = "sidebar",
  collapsed = false,
}: {
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  workspaceName: string;
  subtitle: string;
  /** "sidebar" = dark bottom-of-sidebar control (default). "header" = compact light-theme control for the top nav. */
  variant?: "sidebar" | "header";
  /** Renders as an avatar-only control anchored to the icon rail; only used with variant="sidebar". */
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const canSwitch = workspaces.length > 1;

  function choose(id: string) {
    if (id === activeWorkspaceId) {
      setOpen(false);
      return;
    }
    setSwitchingId(id);
    startTransition(async () => {
      await switchWorkspace(id);
    });
  }

  if (variant === "header") {
    return (
      <div className="relative">
        {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-surface-100 transition-colors group"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">{badge(workspaceName)}</span>
          </div>
          <span className="hidden sm:block text-sm font-medium text-surface-800 truncate max-w-[140px]">
            {workspaceName}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-surface-400 group-hover:text-surface-600 transition-colors shrink-0" />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-2 w-64 z-50 bg-white border border-surface-200 rounded-xl shadow-dropdown py-1.5 animate-scale-in">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-surface-400">
              Switch workspace
            </p>
            <div className="max-h-64 overflow-y-auto sidebar-scroll py-0.5">
              {workspaces.map((w) => {
                const active = w.id === activeWorkspaceId;
                const isSwitching = pending && switchingId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={pending}
                    onClick={() => choose(w.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-60",
                      active ? "bg-brand-50" : "hover:bg-surface-50"
                    )}
                  >
                    <div className="w-6 h-6 rounded-md bg-brand-600/90 flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">{badge(w.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-surface-800 text-xs font-medium truncate">{w.name}</p>
                      <p className="text-surface-400 text-[10px] truncate">{WORKSPACE_TYPE_LABEL[w.type]}</p>
                    </div>
                    {isSwitching ? (
                      <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin shrink-0" />
                    ) : active ? (
                      <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
              {!canSwitch && (
                <p className="px-3 py-2 text-[11px] text-surface-400">
                  You only belong to this workspace.
                </p>
              )}
            </div>
            <div className="border-t border-surface-100 mt-1 pt-1">
              <Link
                href="/onboarding/workspace"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
              >
                <Plus className="w-4 h-4 text-surface-400" strokeWidth={2} />
                Create workspace
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="relative flex justify-center">
        {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group relative w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center shrink-0 hover:ring-2 hover:ring-brand-400/50 transition-all"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Workspace: ${workspaceName}. Open workspace switcher`}
        >
          <span className="text-white text-[11px] font-bold">{badge(workspaceName)}</span>
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-dropdown transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 z-50"
          >
            {workspaceName}
          </span>
        </button>

        {open && (
          <div className="absolute bottom-0 left-full ml-3 w-64 z-50 bg-[#15132f] border border-[#272452] rounded-xl shadow-dropdown py-1.5 animate-scale-in">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5a5d85]">
              Switch workspace
            </p>
            <div className="max-h-64 overflow-y-auto sidebar-scroll py-0.5">
              {workspaces.map((w) => {
                const active = w.id === activeWorkspaceId;
                const isSwitching = pending && switchingId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={pending}
                    onClick={() => choose(w.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-60",
                      active ? "bg-[#1a183d]" : "hover:bg-[#1a183d]"
                    )}
                  >
                    <div className="w-6 h-6 rounded-md bg-brand-600/90 flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">{badge(w.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#e3e4f2] text-xs font-medium truncate">{w.name}</p>
                      <p className="text-[#7275a0] text-[10px] truncate">{WORKSPACE_TYPE_LABEL[w.type]}</p>
                    </div>
                    {isSwitching ? (
                      <Loader2 className="w-3.5 h-3.5 text-brand-300 animate-spin shrink-0" />
                    ) : active ? (
                      <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
              {!canSwitch && (
                <p className="px-3 py-2 text-[11px] text-[#7275a0]">
                  You only belong to this workspace.
                </p>
              )}
            </div>
            <div className="border-t border-[#272452] mt-1 pt-1">
              <Link
                href="/onboarding/workspace"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#c8cae0] hover:bg-[#1a183d] hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4 text-[#7275a0]" strokeWidth={2} />
                Create workspace
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#1a183d] transition-colors group text-left"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-7 h-7 rounded-md bg-brand-600 flex items-center justify-center shrink-0">
          <span className="text-white text-[11px] font-bold">{badge(workspaceName)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#c8cae0] text-xs font-medium truncate group-hover:text-white transition-colors">
            {workspaceName}
          </p>
          <p className="text-[#7275a0] text-[10px] truncate">{subtitle}</p>
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-[#7275a0] group-hover:text-white transition-colors shrink-0" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[#15132f] border border-[#272452] rounded-xl shadow-dropdown py-1.5 animate-scale-in">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5a5d85]">
            Switch workspace
          </p>
          <div className="max-h-64 overflow-y-auto sidebar-scroll py-0.5">
            {workspaces.map((w) => {
              const active = w.id === activeWorkspaceId;
              const isSwitching = pending && switchingId === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  disabled={pending}
                  onClick={() => choose(w.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-60",
                    active ? "bg-[#1a183d]" : "hover:bg-[#1a183d]"
                  )}
                >
                  <div className="w-6 h-6 rounded-md bg-brand-600/90 flex items-center justify-center shrink-0">
                    <span className="text-white text-[10px] font-bold">{badge(w.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#e3e4f2] text-xs font-medium truncate">{w.name}</p>
                    <p className="text-[#7275a0] text-[10px] truncate">{WORKSPACE_TYPE_LABEL[w.type]}</p>
                  </div>
                  {isSwitching ? (
                    <Loader2 className="w-3.5 h-3.5 text-brand-300 animate-spin shrink-0" />
                  ) : active ? (
                    <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  ) : null}
                </button>
              );
            })}
            {!canSwitch && (
              <p className="px-3 py-2 text-[11px] text-[#7275a0]">
                You only belong to this workspace.
              </p>
            )}
          </div>
          <div className="border-t border-[#272452] mt-1 pt-1">
            <Link
              href="/onboarding/workspace"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#c8cae0] hover:bg-[#1a183d] hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4 text-[#7275a0]" strokeWidth={2} />
              Create workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
