"use client";

import { useEffect, useState, useTransition } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopNav } from "@/components/layout/TopNav";
import { GalaCopilot } from "@/components/copilot/GalaCopilot";
import { setSidebarCollapsed } from "@/lib/shell/actions";
import type { WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";
import type { SupplierType } from "@/lib/flags/context";
import type { ShellWorkspace, ShellNotification } from "@/lib/shell/data";

const SIDEBAR_STORAGE_KEY = "gala-dock:sidebar-collapsed";

export interface AppShellClientProps {
  workspaceType: WorkspaceType;
  flags: FlagMap;
  /** Only meaningful when workspaceType === "supplier"; defaults to "solo". */
  supplierType?: SupplierType;
  workspaceName: string;
  planLabel?: string;
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  notifications: ShellNotification[];
  unreadCount: number;
  userInitials: string;
  userEmail: string;
  /** Server-resolved initial collapse preference (avoids hydration flicker). */
  initialSidebarCollapsed?: boolean;
  children: React.ReactNode;
}

/**
 * Client shell for the Event Manager app. Receives serializable persona context
 * (workspaceType + flags) resolved server-side in the layout, and owns the mobile
 * sidebar toggle and the desktop collapse preference. Renders the persona-aware
 * floating sidebar, floating top nav and Copilot bubble.
 */
export function AppShellClient({
  workspaceType,
  flags,
  supplierType,
  workspaceName,
  planLabel,
  workspaces,
  activeWorkspaceId,
  notifications,
  unreadCount,
  userInitials,
  userEmail,
  initialSidebarCollapsed = false,
  children,
}: AppShellClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [, startTransition] = useTransition();

  // Instant paint from a locally cached preference before the server round-trip lands.
  useEffect(() => {
    const cached = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (cached === "1" || cached === "0") {
      setCollapsed(cached === "1");
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      startTransition(() => {
        void setSidebarCollapsed(next);
      });
      return next;
    });
  }

  const sidebar = (
    <AppSidebar
      workspaceType={workspaceType}
      flags={flags}
      supplierType={supplierType}
      workspaceName={workspaceName}
      planLabel={planLabel}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
    />
  );

  return (
    <div className="flex h-full p-[var(--shell-viewport-padding)] gap-[var(--shell-gap)] bg-surface-100">
      {/* Desktop floating sidebar */}
      <div className="hidden lg:flex">{sidebar}</div>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 p-[var(--shell-viewport-padding)] h-full">
            <AppSidebar
              workspaceType={workspaceType}
              flags={flags}
              supplierType={supplierType}
              workspaceName={workspaceName}
              planLabel={planLabel}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              collapsed={false}
            />
          </div>
        </div>
      )}

      {/* Floating top bar + content column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-full gap-[var(--shell-gap)] overflow-hidden">
        <TopNav
          onMenuToggle={() => setMobileOpen((v) => !v)}
          workspaceType={workspaceType}
          flags={flags}
          notifications={notifications}
          unreadCount={unreadCount}
          userInitials={userInitials}
          userEmail={userEmail}
          workspaceName={workspaceName}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
        <main className="flex-1 overflow-y-auto bg-surface-50 rounded-[var(--content-radius,var(--shell-radius))]">
          {children}
        </main>
      </div>

      {/* Gala Copilot — persistent floating bubble */}
      <GalaCopilot />
    </div>
  );
}
