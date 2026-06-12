"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  {
    label: "Account",
    links: [
      { href: "/app/settings/account", label: "Account" },
      { href: "/app/settings/security", label: "Security" },
      { href: "/app/settings/preferences", label: "Preferences" },
    ],
  },
  {
    label: "Workspace",
    links: [
      { href: "/app/settings/workspace", label: "Workspace" },
      { href: "/app/settings/branding", label: "Branding" },
      { href: "/app/settings/team", label: "Team" },
      { href: "/app/settings/roles", label: "Roles" },
    ],
  },
  {
    label: "Billing",
    links: [
      { href: "/app/settings/billing", label: "Billing" },
      { href: "/app/settings/usage", label: "Usage" },
    ],
  },
  {
    label: "Defaults",
    links: [
      { href: "/app/settings/supplier-defaults", label: "Supplier Defaults" },
      { href: "/app/settings/event-defaults", label: "Event Defaults" },
      { href: "/app/settings/finance-defaults", label: "Finance Defaults" },
    ],
  },
  {
    label: "Automation",
    links: [
      { href: "/app/settings/smart-rules", label: "Smart Rules" },
      { href: "/app/settings/ai", label: "AI" },
    ],
  },
  {
    label: "Other",
    links: [
      { href: "/app/settings/affiliate", label: "Affiliate" },
      { href: "/app/settings/notifications", label: "Notifications" },
      { href: "/app/settings/data-export", label: "Data Export" },
      { href: "/app/settings/audit", label: "Audit" },
    ],
  },
];

interface SettingsShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingsShell({ title, description, children }: SettingsShellProps) {
  const pathname = usePathname();

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
          {NAV_SECTIONS.map((section) => (
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
            {NAV_SECTIONS.flatMap((s) => s.links).map((link) => {
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
