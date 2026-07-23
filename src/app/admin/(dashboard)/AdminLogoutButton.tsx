"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AdminLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      title="Sign out of admin"
      className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
    >
      <LogOut className="w-4.5 h-4.5" strokeWidth={1.8} />
    </button>
  );
}
