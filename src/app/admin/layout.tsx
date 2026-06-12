"use client";

import { useState } from "react";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Bell, Search, Shield } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <AdminSidebar />

      <div className="flex-1 flex flex-col min-w-0 min-h-full overflow-hidden">
        {/* Admin top bar */}
        <header className="h-14 bg-white border-b border-surface-200 flex items-center px-4 gap-3 shrink-0 z-30">
          <div className="flex items-center gap-2 text-xs font-semibold text-danger-600 bg-danger-50 border border-danger-200 px-3 py-1.5 rounded-lg">
            <Shield className="w-3.5 h-3.5" strokeWidth={2} />
            Admin Mode
          </div>
          <div className="flex-1" />
          <button className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors">
            <Bell className="w-4.5 h-4.5" strokeWidth={1.8} />
          </button>
          <div className="w-7 h-7 rounded-full bg-danger-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold">A</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-surface-50">
          {children}
        </main>
      </div>
    </div>
  );
}
