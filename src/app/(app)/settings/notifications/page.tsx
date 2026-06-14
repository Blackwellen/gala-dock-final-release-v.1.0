import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { NotificationsForm, GROUPS } from "./NotificationsForm";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("user_notification_preferences")
    .select("category, channel, enabled")
    .eq("user_id", user.id);

  // Seed defaults: in-app on for all, email on for all except system.
  const initialPrefs = Object.fromEntries(
    GROUPS.map((g) => [g.key, { in_app: true, email: g.key !== "system" }])
  ) as Record<string, { in_app: boolean; email: boolean }>;

  for (const r of rows ?? []) {
    if (initialPrefs[r.category] && (r.channel === "in_app" || r.channel === "email")) {
      initialPrefs[r.category][r.channel] = r.enabled;
    }
  }

  return (
    <SettingsShell title="Notifications" description="Choose which notifications you receive in-app and by email.">
      <NotificationsForm initialPrefs={initialPrefs} />
    </SettingsShell>
  );
}
