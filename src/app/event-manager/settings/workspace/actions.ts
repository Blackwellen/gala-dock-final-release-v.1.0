"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Update workspace identity (name + timezone) for the active workspace.
 * Slug is immutable after creation and not written here.
 */
export async function updateWorkspace(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  const timezone = str(formData.get("timezone"));

  const patch: { name?: string; timezone?: string } = {};
  if (name) patch.name = name;
  if (timezone) patch.timezone = timezone;

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("workspaces")
    .update(patch)
    .eq("id", workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/event-manager/settings/workspace");
  return { ok: true };
}

/**
 * Set whether a supplier workspace operates solo (no roster) or as an agency
 * (manages an internal team/roster). Gates the Team/Roster nav item — see
 * src/lib/nav/app-nav.ts and supabase/migrations/20260720_supplier_type.sql.
 * No-op (rejected) for non-supplier workspaces.
 */
export async function updateSupplierType(
  supplierType: "solo" | "agency"
): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, workspace } = await requireWorkspace();
  if (workspace.workspace_type !== "supplier") {
    return { ok: false, error: "Only supplier workspaces have a business type." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("workspaces")
    .update({ supplier_type: supplierType })
    .eq("id", workspaceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/event-manager/settings/workspace");
  return { ok: true };
}
