"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

/**
 * Persist branding into the workspaces.branding JSON column. Only the brand
 * colour is editable here; logo/favicon are upload-only and out of scope for
 * this wiring pass (no storage URL fields are written).
 */
export async function updateBranding(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, workspace } = await requireWorkspace();
  const supabase = await createClient();

  const brandColor = String(formData.get("brand_color") ?? "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return { ok: false, error: "Enter a valid hex colour (e.g. #4F46E5)." };
  }

  const current =
    workspace.branding && typeof workspace.branding === "object" && !Array.isArray(workspace.branding)
      ? (workspace.branding as Record<string, Json>)
      : {};

  const branding: Json = { ...current, brand_color: brandColor };

  const { error } = await supabase
    .from("workspaces")
    .update({ branding })
    .eq("id", workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/event-manager/settings/branding");
  return { ok: true };
}
