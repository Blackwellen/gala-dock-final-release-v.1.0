"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 3-settings model (product brief): exactly three types.
//   • Account   — for EVERY member (personal profile, security, prefs, notifications).
//   • Workspace — admin / workspace-manager only (workspace config, team, defaults, automation, data).
//   • Billing   — admin / workspace-manager only (plan, usage).
// `scope` lets us hide the admin-only groups from members who can't manage the workspace.
type SettingsScope = "account" | "workspace" | "billing";

const NAV_SECTIONS: { label: string; scope: SettingsScope; links: { href: string; label: string }[] }[] = [
  {
    label: "Account",
    scope: "account",
    links: [
      { href: "/event-manager/settings/account", label: "Account" },
      { href: "/event-manager/settings/security", label: "Security" },
      { href: "/event-manager/settings/preferences", label: "Preferences" },
      { href: "/event-manager/settings/notifications", label: "Notifications" },
    ],
  },
  {
    label: "Workspace",
    scope: "workspace",
    links: [
      { href: "/event-manager/settings/workspace", label: "General" },
      { href: "/event-manager/settings/branding", label: "Branding" },
      { href: "/event-manager/settings/team", label: "Team" },
      { href: "/event-manager/settings/roles", label: "Roles" },
      { href: "/event-manager/settings/event-defaults", label: "Event Defaults" },
      { href: "/event-manager/settings/supplier-defaults", label: "Supplier Defaults" },
      { href: "/event-manager/settings/finance-defaults", label: "Finance Defaults" },
      { href: "/event-manager/settings/smart-rules", label: "Smart Rules" },
      { href: "/event-manager/settings/ai", label: "AI" },
      { href: "/event-manager/settings/affiliate", label: "Affiliate" },
      { href: "/event-manager/settings/data-export", label: "Data Export" },
      { href: "/event-manager/settings/audit", label: "Audit Log" },
    ],
  },
  {
    label: "Billing",
    scope: "billing",
    links: [
      { href: "/event-manager/settings/billing", label: "Plan & Billing" },
      { href: "/event-manager/settings/usage", label: "Usage" },
    ],
  },
];

interface SettingsShellProps {
  title: string;
  description?: string;
  /** When false, the admin-only Workspace + Billing groups are hidden. Defaults to true. */
  canManageWorkspace?: boolean;
  children: React.ReactNode;
}

export function SettingsShell({ title, description, canManageWorkspace = true, children }: SettingsShellProps) {
  const pathname = usePathname();
  const sections = NAV_SECTIONS.filter((s) => s.scope === "account" || canManageWorkspace);

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Page header */}
      <div className="bg-white border-b border-surface-200 px-6 py-5">
        <h1 className="text-xl font-semibold text-surface-900 tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-surface-500">{description}</p>}
      </div>

      <div className="flex gap-0">
        {/* Left nav */}
        <aside className="w-[200px] shrink-0 border-r border-surface-200 bg-white min-h-[calc(100vh-73px)] p-4 hidden md:block">
          {sections.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-400 mb-1.5 px-2">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.links.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn(
                          "block px-2 py-1.5 rounded-lg text-sm transition-all",
                          isActive
                            ? "text-brand-600 bg-brand-50 font-medium"
                            : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden w-full border-b border-surface-200 bg-white px-4 py-2 overflow-x-auto">
          <div className="flex gap-1">
            {sections.flatMap((s) => s.links).map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "whitespace-nowrap px-3 py-1.5 rounded-lg text-xs transition-all",
                    isActive
                      ? "text-brand-600 bg-brand-50 font-medium"
                      : "text-surface-600 hover:bg-surface-50"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 p-6 md:p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}
