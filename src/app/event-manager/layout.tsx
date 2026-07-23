import { AppShellClient } from "@/components/layout/AppShellClient";
import { getOptionalPersonaContext } from "@/lib/flags/context";
import { getShellData } from "@/lib/shell/data";
import { PLAN_LABELS, type Plan } from "@/lib/billing/entitlements";

// Server component: resolve the active workspace persona + flags once, then hand the
// serializable context to the client shell (which owns the mobile sidebar toggle).
// Auth is enforced at the edge by proxy.ts; this layout degrades to organizer defaults.
export default async function EventManagerLayout({ children }: { children: React.ReactNode }) {
  const [ctx, shell] = await Promise.all([getOptionalPersonaContext(), getShellData()]);
  const planLabel = (PLAN_LABELS as Record<string, string>)[ctx.plan as Plan] ?? undefined;

  return (
    <AppShellClient
      workspaceType={ctx.workspaceType}
      flags={ctx.flags}
      supplierType={ctx.supplierType}
      workspaceName={ctx.workspaceName ?? "My Workspace"}
      planLabel={planLabel}
      workspaces={shell.workspaces}
      activeWorkspaceId={shell.activeWorkspaceId}
      notifications={shell.notifications}
      unreadCount={shell.unreadCount}
      userInitials={shell.userInitials}
      userEmail={shell.userEmail}
      initialSidebarCollapsed={shell.sidebarCollapsed}
    >
      {children}
    </AppShellClient>
  );
}
