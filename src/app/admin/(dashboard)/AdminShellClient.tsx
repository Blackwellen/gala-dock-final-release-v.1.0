"use client";

import { useEffect, useState } from "react";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Bell, Shield } from "lucide-react";
import { AdminLogoutButton } from "./AdminLogoutButton";

const ADMIN_SIDEBAR_STORAGE_KEY = "gala-dock:admin-sidebar-collapsed";

export function AdminShellClient({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const cached = window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY);
    if (cached === "1" || cached === "0") setCollapsed(cached === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex h-full p-[var(--shell-viewport-padding)] gap-[var(--shell-gap)] bg-surface-100">
      <AdminSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

      <div className="flex-1 flex flex-col min-w-0 min-h-full gap-[var(--shell-gap)] overflow-hidden">
        {/* Admin top bar */}
        <header className="h-[var(--topbar-height)] bg-white/95 backdrop-blur-md border border-sidebar-border rounded-[var(--shell-radius)] shadow-shell-topbar flex items-center px-4 gap-3 shrink-0 z-30">
          <div className="flex items-center gap-2 text-xs font-semibold text-danger-600 bg-danger-50 border border-danger-200 px-3 py-1.5 rounded-lg">
            <Shield className="w-3.5 h-3.5" strokeWidth={2} />
            Admin Mode
          </div>
          <div className="flex-1" />
          <button className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors">
            <Bell className="w-4.5 h-4.5" strokeWidth={1.8} />
          </button>
          <AdminLogoutButton />
          <div className="w-7 h-7 rounded-full bg-danger-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold">A</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-surface-50 rounded-[var(--content-radius,var(--shell-radius))]">
          {children}
        </main>
      </div>
    </div>
  );
}
