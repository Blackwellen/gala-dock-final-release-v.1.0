"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Sparkles,
  HelpCircle,
  ChevronDown,
  Menu,
  CalendarDays,
  Users2,
  CheckSquare,
  Banknote,
  FolderOpen,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { openCopilot } from "@/lib/shell/copilot-bus";
import type { WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";
import type { ShellNotification } from "@/lib/shell/data";

const QUICK_CREATE = [
  { label: "New Event",       icon: CalendarDays, href: "/event-manager/events/new" },
  { label: "New Supplier",    icon: Users2,       href: "/event-manager/suppliers/new" },
  { label: "New Task",        icon: CheckSquare,  href: "/event-manager/tasks/new" },
  { label: "New Quote",       icon: Banknote,     href: "/event-manager/finance/quotes/new" },
  { label: "New Invoice",     icon: Banknote,     href: "/event-manager/finance/invoices/new" },
  { label: "Upload File",     icon: FolderOpen,   href: "/event-manager/library/files" },
  { label: "Invite Client",   icon: UserPlus,     href: "/event-manager/settings/team" },
  { label: "Invite Supplier", icon: UserPlus,     href: "/event-manager/suppliers/new" },
];

interface TopNavProps {
  breadcrumb?: { label: string; href?: string }[];
  onMenuToggle?: () => void;
  workspaceType?: WorkspaceType;
  flags?: Partial<FlagMap>;
  notifications?: ShellNotification[];
  unreadCount?: number;
  userInitials?: string;
  userEmail?: string;
}

export function TopNav({
  breadcrumb,
  onMenuToggle,
  workspaceType = "organizer",
  flags,
  notifications = [],
  unreadCount = 0,
  userInitials = "GD",
  userEmail = "",
}: TopNavProps) {
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K opens the command palette anywhere in the shell.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="h-14 bg-white border-b border-surface-200 flex items-center px-4 gap-3 shrink-0 relative z-30">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        workspaceType={workspaceType}
        flags={flags}
      />
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-1.5 rounded-md text-surface-500 hover:bg-surface-100 transition-colors"
        aria-label="Toggle menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 flex-1 min-w-0">
        {breadcrumb?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-surface-300 text-sm">/</span>}
            {crumb.href && i < breadcrumb.length - 1 ? (
              <Link
                href={crumb.href}
                className="text-sm text-surface-500 hover:text-surface-900 transition-colors truncate"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-sm font-medium text-surface-900 truncate">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Search */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm hover:border-brand-300 hover:bg-white transition-all w-52 xl:w-64 group"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left text-surface-400 text-xs">
            Search anything...
          </span>
          <kbd className="hidden xl:inline-flex items-center gap-0.5 text-[10px] font-mono bg-surface-100 border border-surface-200 px-1.5 py-0.5 rounded text-surface-400">
            ⌘K
          </kbd>
        </button>
        {/* Search (mobile icon) */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="md:hidden p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors"
          aria-label="Search"
        >
          <Search className="w-4.5 h-4.5" strokeWidth={1.8} />
        </button>

        {/* Quick Create */}
        <div className="relative">
          <button
            onClick={() => { setQuickCreateOpen(!quickCreateOpen); setUserMenuOpen(false); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              quickCreateOpen
                ? "bg-brand-600 text-white"
                : "bg-brand-600 text-white hover:bg-brand-700"
            )}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Create</span>
          </button>

          {quickCreateOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setQuickCreateOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-surface-200 shadow-dropdown py-1.5 z-50 animate-scale-in">
                {QUICK_CREATE.map(({ label, icon: Icon, href }) => (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setQuickCreateOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-surface-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-surface-400" strokeWidth={1.8} />
                    {label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Copilot */}
        <button
          onClick={() => openCopilot()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors border border-brand-200 hover:border-brand-300"
          title="Open Gala Copilot"
        >
          <Sparkles className="w-4 h-4" strokeWidth={1.8} />
          <span className="hidden md:inline text-xs font-medium">Copilot</span>
        </button>

        {/* Notifications */}
        <NotificationsMenu notifications={notifications} unreadCount={unreadCount} />

        {/* Help */}
        <button className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors">
          <HelpCircle className="w-4.5 h-4.5" strokeWidth={1.8} />
        </button>

        {/* User avatar */}
        <div className="relative">
          <button
            onClick={() => { setUserMenuOpen(!userMenuOpen); setQuickCreateOpen(false); }}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
              <span className="text-white text-[11px] font-semibold">{userInitials}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-surface-400 hidden sm:block" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-surface-200 shadow-dropdown z-50 animate-scale-in overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-100">
                  <p className="text-sm font-medium text-surface-900 truncate">My Account</p>
                  <p className="text-xs text-surface-500 truncate">{userEmail || "Signed in"}</p>
                </div>
                {/* Account tier only — Workspace + Billing live in the admin-only
                    sidebar Settings (3-settings model). Account is for everyone. */}
                <div className="py-1.5">
                  {[
                    { label: "Account Settings", href: "/event-manager/settings/account" },
                    { label: "Notifications",    href: "/event-manager/settings/account#notifications" },
                    { label: "Security",         href: "/event-manager/settings/account#security" },
                    { label: "Help & Support",   href: "/help" },
                  ].map(({ label, href }) => (
                    <Link
                      key={label}
                      href={href}
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-surface-700 hover:bg-surface-50 hover:text-surface-900 transition-colors"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-surface-100 py-1.5">
                  <button className="w-full text-left px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors">
                    Logout
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
