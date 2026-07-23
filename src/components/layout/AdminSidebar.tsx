"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Link2,
  Headphones,
  ClipboardList,
  Flag,
  Activity,
  Mail,
  Cpu,
  Workflow,
  HardDrive,
  ShieldCheck,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminNavItem = { href: string; label: string; icon: LucideIcon };
type AdminNavGroup = { label: string; items: readonly AdminNavItem[] };

const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  { label: "Overview", items: [{ href: "/admin", label: "Admin Overview", icon: LayoutDashboard }] },
  {
    label: "Customers & Revenue",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { href: "/admin/affiliates", label: "Affiliates", icon: Link2 },
      { href: "/admin/support", label: "Support", icon: Headphones },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/system-health", label: "System Health", icon: Activity },
      { href: "/admin/email-logs", label: "Email Logs", icon: Mail },
      { href: "/admin/ai-usage", label: "AI Usage", icon: Cpu },
      { href: "/admin/automation-runs", label: "Automation Runs", icon: Workflow },
      { href: "/admin/storage-usage", label: "Storage Usage", icon: HardDrive },
    ],
  },
  {
    label: "Governance & Security",
    items: [
      { href: "/admin/audit", label: "Audit Logs", icon: ClipboardList },
      { href: "/admin/feature-flags", label: "Feature Flags", icon: Flag },
      { href: "/admin/security", label: "Security", icon: ShieldCheck },
    ],
  },
];

export interface AdminSidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function AdminSidebar({ collapsed = false, onToggleCollapsed }: AdminSidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
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
          <div className="min-w-0">
            <Image
              src="/gala-dock-wordmark-white.png"
              alt="Gala Dock"
              width={110}
              height={47}
              className="h-[17px] w-auto shrink-0"
              priority
            />
            <p className="mt-1 text-sidebar-muted text-[10px] font-medium uppercase tracking-widest">
              Admin
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll py-4 space-y-0.5",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className="space-y-0.5">
            {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">{group.label}</p>}
            {collapsed && groupIndex > 0 && <div className="mx-2 my-2 border-t border-sidebar-border" aria-hidden="true" />}
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
                  active ? "bg-gradient-to-br from-[#6d45ff] to-[#7b5cff] shadow-[0_4px_20px_-4px_rgba(109,69,255,0.55)]" : "hover:bg-sidebar-hover"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0",
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
                  "w-4 h-4 shrink-0",
                  active ? "text-white" : "text-sidebar-muted group-hover:text-white"
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
            })}
          </div>
        ))}
      </nav>

      {/* Back to app + collapse control */}
      <div
        className={cn(
          "border-t border-sidebar-border shrink-0 space-y-1",
          collapsed ? "px-2 py-3" : "px-3 py-3"
        )}
      >
        {collapsed ? (
          <Link
            href="/event-manager/home"
            aria-label="Back to App"
            title="Back to App"
            className="group relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4.5 h-4.5" strokeWidth={1.8} />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-dropdown transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 z-50"
            >
              Back to App
            </span>
          </Link>
        ) : (
          <Link
            href="/event-manager/home"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors text-sm group"
          >
            <ArrowLeft className="w-4 h-4 text-sidebar-muted group-hover:text-white transition-colors" strokeWidth={1.8} />
            Back to App
          </Link>
        )}

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
