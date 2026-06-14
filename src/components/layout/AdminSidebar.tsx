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
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin",                label: "Admin Overview",  icon: LayoutDashboard },
  { href: "/admin/users",          label: "Users",           icon: Users },
  { href: "/admin/workspaces",     label: "Workspaces",      icon: Building2 },
  { href: "/admin/subscriptions",  label: "Subscriptions",   icon: CreditCard },
  { href: "/admin/affiliates",     label: "Affiliates",      icon: Link2 },
  { href: "/admin/support",        label: "Support",         icon: Headphones },
  { href: "/admin/audit",          label: "Audit Logs",      icon: ClipboardList },
  { href: "/admin/feature-flags",  label: "Feature Flags",   icon: Flag },
  { href: "/admin/system-health",  label: "System Health",   icon: Activity },
  { href: "/admin/email-logs",     label: "Email Logs",      icon: Mail },
  { href: "/admin/ai-usage",       label: "AI Usage",        icon: Cpu },
  { href: "/admin/automation-runs",label: "Automation Runs", icon: Workflow },
  { href: "/admin/storage-usage",  label: "Storage Usage",   icon: HardDrive },
  { href: "/admin/security",       label: "Security",        icon: ShieldCheck },
];

export function AdminSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
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
        <div>
          <p className="text-white font-semibold text-[14px] tracking-tight leading-tight">
            Gala Dock
          </p>
          <p className="text-[#7275a0] text-[10px] font-medium uppercase tracking-widest">
            Admin
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 space-y-0.5">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
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
                  "w-4 h-4 shrink-0",
                  active ? "text-white" : "text-[#7275a0] group-hover:text-white"
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Back to app */}
      <div className="px-3 py-4 border-t border-[#1f1d45]">
        <Link
          href="/home"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[#c8cae0] hover:bg-[#1a183d] hover:text-white transition-colors text-sm group"
        >
          <ArrowLeft className="w-4 h-4 text-[#7275a0] group-hover:text-white transition-colors" strokeWidth={1.8} />
          Back to App
        </Link>
      </div>
    </aside>
  );
}
