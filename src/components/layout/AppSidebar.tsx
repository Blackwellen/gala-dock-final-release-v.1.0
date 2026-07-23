"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildAppNavGroups, WORKSPACE_TYPE_LABEL } from "@/lib/nav/app-nav";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import type { WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";
import type { SupplierType } from "@/lib/flags/context";
import type { ShellWorkspace } from "@/lib/shell/data";

export interface AppSidebarProps {
  /** Active workspace persona. Defaults to organizer (the Event Delivery OS). */
  workspaceType?: WorkspaceType;
  /** Resolved flag map; gates flag-tagged nav items. */
  flags?: Partial<FlagMap>;
  /** Supplier persona depth (solo/agency); only relevant when workspaceType === "supplier". */
  supplierType?: SupplierType;
  /** Display name of the active workspace. */
  workspaceName?: string;
  /** Plan label for the workspace strip. */
  planLabel?: string;
  /** Workspaces the user belongs to (for the switcher). */
  workspaces?: ShellWorkspace[];
  /** Active workspace id (for the switcher). */
  activeWorkspaceId?: string | null;
  /** Whether the sidebar renders as a collapsed icon rail. */
  collapsed?: boolean;
  /** Toggles the collapsed state; omit to hide the collapse control (e.g. inside the mobile drawer). */
  onToggleCollapsed?: () => void;
}

export function AppSidebar({
  workspaceType = "organizer",
  flags,
  supplierType = "solo",
  workspaceName = "My Workspace",
  planLabel,
  workspaces = [],
  activeWorkspaceId = null,
  collapsed = false,
  onToggleCollapsed,
}: AppSidebarProps) {
  const pathname = usePathname();
  const groups = buildAppNavGroups(workspaceType, flags, supplierType);
  const subtitle = planLabel ?? WORKSPACE_TYPE_LABEL[workspaceType];

  function isActive(href: string) {
    if (href === "/event-manager/home") return pathname === "/event-manager/home";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className={cn(
        "flex flex-col shrink-0 select-none bg-gradient-to-b from-[#2c1b68] via-[#211556] to-[#17103f] border border-sidebar-border rounded-[var(--shell-radius)] shadow-shell-sidebar transition-[width] duration-200 ease-out overflow-hidden relative",
        "before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-gradient-to-b before:from-white/[0.06] before:to-transparent before:pointer-events-none",
        collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-expanded-width)]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-18 border-b border-sidebar-border shrink-0",
          collapsed ? "justify-center px-0" : "gap-2.5 px-5"
        )}
      >
        <Image
          src="/gala-dock-icon-white.png"
          alt=""
          width={36}
          height={36}
          className="shrink-0"
          priority
        />
        {!collapsed && (
          <Image
            src="/gala-dock-wordmark-white.png"
            alt="Gala Dock"
            width={110}
            height={47}
            className="h-[19px] w-auto shrink-0"
            priority
          />
        )}
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-4 space-y-4",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {groups.map((group, gi) => (
          <div key={group.label ?? `g${gi}`} className="space-y-0.5">
            {group.label && !collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </p>
            )}
            {group.label && collapsed && gi > 0 && (
              <div className="mx-2 my-2 border-t border-sidebar-border" aria-hidden="true" />
            )}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);

              if (collapsed) {
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center justify-center w-11 h-11 mx-auto rounded-lg transition-all duration-150",
                      active
                        ? "bg-gradient-to-br from-[#6d45ff] to-[#7b5cff] shadow-[0_4px_20px_-4px_rgba(109,69,255,0.55)]"
                        : "hover:bg-sidebar-hover"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5 shrink-0 transition-colors",
                        active ? "text-white" : "text-sidebar-muted group-hover:text-white"
                      )}
                      strokeWidth={active ? 2.2 : 1.8}
                    />
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-dropdown transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 z-50"
                    >
                      {label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-gradient-to-r from-[#6d45ff] to-[#7b5cff] text-white shadow-[0_4px_20px_-4px_rgba(109,69,255,0.55)]"
                      : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4.5 h-4.5 shrink-0 transition-colors",
                      active ? "text-white" : "text-sidebar-muted group-hover:text-white"
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {active && (
                    <ChevronRight className="w-3.5 h-3.5 text-white/60" strokeWidth={2} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom workspace switcher + collapse control */}
      <div
        className={cn(
          "border-t border-sidebar-border shrink-0",
          collapsed ? "px-2 py-3 space-y-3" : "px-3 py-3 space-y-2"
        )}
      >
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          workspaceName={workspaceName}
          subtitle={subtitle}
          collapsed={collapsed}
        />
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex items-center gap-2 rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white transition-colors",
              collapsed ? "w-9 h-9 mx-auto justify-center" : "w-full px-3 py-2 text-xs font-medium"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4.5 h-4.5" strokeWidth={1.8} />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
