"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

/**
 * Save user/workspace preferences that map to real columns:
 *  - language  -> profiles.locale (current user)
 *  - currency  -> workspace_settings.default_currency (active workspace)
 * Date format and theme are UI-only in this release (no backing columns).
 */
export async function updatePreferences(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const locale = String(formData.get("language") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();

  if (locale) {
    const { error } = await supabase
      .from("profiles")
      .update({ locale })
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  }

  if (currency) {
    const { data: existing } = await supabase
      .from("workspace_settings")
      .select("id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("workspace_settings")
        .update({ default_currency: currency })
        .eq("workspace_id", workspaceId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("workspace_settings")
        .insert({ workspace_id: workspaceId, default_currency: currency });
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/event-manager/settings/preferences");
  return { ok: true };
}
