import Link from "next/link";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { requireWorkspace, canManageWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { AccountForm } from "./AccountForm";

export const metadata = { title: "Account Settings" };

export default async function AccountSettingsPage() {
  const { user } = await requireWorkspace();
  const canManage = await canManageWorkspace();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <SettingsShell title="Account" description="Manage your personal profile and contact details." canManageWorkspace={canManage}>
      <AccountForm
        initialName={profile?.display_name ?? ""}
        email={user.email ?? ""}
        initialTimezone={profile?.timezone ?? "Europe/London"}
      />

      <Link
        href="/mfa/setup"
        className="mt-6 flex items-center justify-between p-4 rounded-xl border border-surface-200 hover:border-surface-300 hover:bg-surface-50 transition-all max-w-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-semibold text-surface-800">Two-factor authentication</p>
            <p className="text-xs text-surface-500">Add an authenticator app for extra security</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-surface-400" strokeWidth={2} />
      </Link>
    </SettingsShell>
  );
}
