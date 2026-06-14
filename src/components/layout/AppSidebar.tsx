"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  CalendarDays,
  Building2,
  Hotel,
  Users2,
  ClipboardList,
  CheckSquare,
  UsersRound,
  Banknote,
  MessageSquare,
  FolderOpen,
  Settings2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/home",            label: "Home",       icon: LayoutDashboard },
  { href: "/leads",           label: "Leads",      icon: Megaphone },
  { href: "/events",          label: "Events",     icon: CalendarDays },
  { href: "/venues",          label: "Venues",     icon: Building2 },
  { href: "/venue-management", label: "Venue Ops", icon: Hotel },
  { href: "/suppliers",       label: "Suppliers",  icon: Users2 },
  { href: "/rfqs",            label: "RFQs",       icon: ClipboardList },
  { href: "/tasks",           label: "Tasks",      icon: CheckSquare },
  { href: "/team",            label: "Team",       icon: UsersRound },
  { href: "/finance",         label: "Finance",    icon: Banknote },
  { href: "/inbox",           label: "Inbox",      icon: MessageSquare },
  { href: "/library",         label: "Library",    icon: FolderOpen },
  { href: "/settings",        label: "Settings",   icon: Settings2 },
];

export function AppSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/home") return pathname === "/home";
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
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
      </nav>

      {/* Bottom workspace strip */}
      <div className="px-3 py-4 border-t border-[#1f1d45] space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#1a183d] cursor-pointer transition-colors group">
          <div className="w-7 h-7 rounded-md bg-brand-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-bold">GD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#c8cae0] text-xs font-medium truncate group-hover:text-white transition-colors">
              My Workspace
            </p>
            <p className="text-[#7275a0] text-[10px] truncate">Professional Plan</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#7275a0] group-hover:text-white transition-colors shrink-0" />
        </div>
      </div>
    </aside>
  );
}
