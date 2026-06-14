"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/** Update the current user's profile (display name + timezone). */
export async function updateProfile(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const display_name = str(formData.get("display_name"));
  const timezone = str(formData.get("timezone"));

  const patch: { display_name?: string | null; timezone?: string } = {};
  patch.display_name = display_name;
  if (timezone) patch.timezone = timezone;

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/account");
  return { ok: true };
}
