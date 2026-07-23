"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Network, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AffiliateDashboardShell({ email, children }: { email: string; children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/affiliate/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-surface-200">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/gala-dock-logo.png" alt="Gala Dock" width={116} height={29} />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold">
              <Network className="w-3 h-3" strokeWidth={2.5} />
              Affiliate
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-surface-500">{email}</p>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold text-surface-900 mb-1">Affiliate Dashboard</h1>
        <p className="text-sm text-surface-500 mb-6">Your referral links, conversions and earnings.</p>
        {children}
      </main>
    </div>
  );
}
