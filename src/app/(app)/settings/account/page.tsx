import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { AccountForm } from "./AccountForm";

export const metadata = { title: "Account Settings" };

export default async function AccountSettingsPage() {
  const { user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <SettingsShell title="Account" description="Manage your personal profile and contact details.">
      <AccountForm
        initialName={profile?.display_name ?? ""}
        email={user.email ?? ""}
        initialTimezone={profile?.timezone ?? "Europe/London"}
      />
    </SettingsShell>
  );
}
