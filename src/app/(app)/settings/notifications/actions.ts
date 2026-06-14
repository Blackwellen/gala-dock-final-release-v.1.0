"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PrefInput {
  category: string;
  channel: "in_app" | "email";
  enabled: boolean;
}

/**
 * Save the current user's notification preferences. Each (category, channel)
 * pair is upserted into user_notification_preferences.
 */
export async function updateNotificationPreferences(
  prefs: PrefInput[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  for (const p of prefs) {
    const { data: existing } = await supabase
      .from("user_notification_preferences")
      .select("id")
      .eq("user_id", user.id)
      .eq("category", p.category)
      .eq("channel", p.channel)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("user_notification_preferences")
        .update({ enabled: p.enabled })
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("user_notification_preferences")
        .insert({
          user_id: user.id,
          category: p.category,
          channel: p.channel,
          enabled: p.enabled,
        });
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/settings/notifications");
  return { ok: true };
}
