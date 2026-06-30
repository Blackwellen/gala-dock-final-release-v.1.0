"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildAppNavGroups, WORKSPACE_TYPE_LABEL } from "@/lib/nav/app-nav";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import type { WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";
import type { ShellWorkspace } from "@/lib/shell/data";

export interface AppSidebarProps {
  /** Active workspace persona. Defaults to organizer (the Event Delivery OS). */
  workspaceType?: WorkspaceType;
  /** Resolved flag map; gates flag-tagged nav items. */
  flags?: Partial<FlagMap>;
  /** Display name of the active workspace. */
  workspaceName?: string;
  /** Plan label for the workspace strip. */
  planLabel?: string;
  /** Workspaces the user belongs to (for the switcher). */
  workspaces?: ShellWorkspace[];
  /** Active workspace id (for the switcher). */
  activeWorkspaceId?: string | null;
}

export function AppSidebar({
  workspaceType = "organizer",
  flags,
  workspaceName = "My Workspace",
  planLabel,
  workspaces = [],
  activeWorkspaceId = null,
}: AppSidebarProps) {
  const pathname = usePathname();
  const groups = buildAppNavGroups(workspaceType, flags);
  const subtitle = planLabel ?? WORKSPACE_TYPE_LABEL[workspaceType];

  function isActive(href: string) {
    if (href === "/event-manager/home") return pathname === "/event-manager/home";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex flex-col w-[224px] min-h-screen bg-[#0e0c27] border-r border-[#1f1d45] select-none shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[#1f1d45] shrink-0">
        <Image
          src="/gala-dock-favicon.png"
          alt="Gala Dock"
          width={32}
          height={32}
          className="rounded-lg"
          priority
        />
        <span className="text-white font-semibold text-[15px] tracking-tight">
          Gala Dock
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 space-y-4">
        {groups.map((group, gi) => (
          <div key={group.label ?? `g${gi}`} className="space-y-0.5">
            {group.label && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#5a5d85]">
                {group.label}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-brand-600 text-white shadow-brand"
                      : "text-[#c8cae0] hover:bg-[#1a183d] hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4.5 h-4.5 shrink-0 transition-colors",
                      active ? "text-white" : "text-[#7275a0] group-hover:text-white"
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  <span className="flex-1">{label}</span>
                  {active && (
                    <ChevronRight className="w-3.5 h-3.5 text-white/60" strokeWidth={2} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom workspace switcher */}
      <div className="px-3 py-4 border-t border-[#1f1d45]">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          workspaceName={workspaceName}
          subtitle={subtitle}
        />
      </div>
    </aside>
  );
}
