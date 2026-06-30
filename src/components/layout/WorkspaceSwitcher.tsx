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
}: {
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  workspaceName: string;
  subtitle: string;
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
