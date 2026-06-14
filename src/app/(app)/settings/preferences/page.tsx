import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { PreferencesForm } from "./PreferencesForm";

export const metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("locale").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("workspace_settings")
      .select("default_currency")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  return (
    <SettingsShell title="Preferences" description="Customise how dates, currencies, and language appear across the app.">
      <PreferencesForm
        initialLanguage={profile?.locale ?? "en-GB"}
        initialCurrency={settings?.default_currency ?? "GBP"}
      />
    </SettingsShell>
  );
}
