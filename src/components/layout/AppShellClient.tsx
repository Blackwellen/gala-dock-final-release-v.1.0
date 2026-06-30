"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopNav } from "@/components/layout/TopNav";
import { GalaCopilot } from "@/components/copilot/GalaCopilot";
import type { WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";
import type { ShellWorkspace, ShellNotification } from "@/lib/shell/data";

export interface AppShellClientProps {
  workspaceType: WorkspaceType;
  flags: FlagMap;
  workspaceName: string;
  planLabel?: string;
  workspaces: ShellWorkspace[];
  activeWorkspaceId: string | null;
  notifications: ShellNotification[];
  unreadCount: number;
  userInitials: string;
  userEmail: string;
  children: React.ReactNode;
}

/**
 * Client shell for the Event Manager app. Receives serializable persona context
 * (workspaceType + flags) resolved server-side in the layout, and owns the mobile
 * sidebar toggle. Renders the persona-aware sidebar, top nav and Copilot bubble.
 */
export function AppShellClient({
  workspaceType,
  flags,
  workspaceName,
  planLabel,
  workspaces,
  activeWorkspaceId,
  notifications,
  unreadCount,
  userInitials,
  userEmail,
  children,
}: AppShellClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebar = (
    <AppSidebar
      workspaceType={workspaceType}
      flags={flags}
      workspaceName={workspaceName}
      planLabel={planLabel}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
    />
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">{sidebar}</div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10">{sidebar}</div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-full overflow-hidden">
        <TopNav
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          workspaceType={workspaceType}
          flags={flags}
          notifications={notifications}
          unreadCount={unreadCount}
          userInitials={userInitials}
          userEmail={userEmail}
        />
        <main className="flex-1 overflow-y-auto bg-surface-50">{children}</main>
      </div>

      {/* Gala Copilot — persistent floating bubble */}
      <GalaCopilot />
    </div>
  );
}
