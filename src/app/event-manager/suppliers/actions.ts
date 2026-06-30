"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { SupplierStatus } from "@/lib/supabase/types";

const VALID_STATUSES: SupplierStatus[] = [
  "active",
  "paused",
  "archived",
  "suspended_by_admin",
];

function coerceStatus(raw: FormDataEntryValue | null): SupplierStatus {
  const value = String(raw ?? "active");
  return (VALID_STATUSES as string[]).includes(value)
    ? (value as SupplierStatus)
    : "active";
}

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

function rating(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.round(n)) : null;
}

/**
 * Create a new supplier (and optional primary contact) scoped to the active
 * workspace, then redirect to the new supplier's detail page.
 */
export async function createSupplier(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Supplier name is required");

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name,
      status: coerceStatus(formData.get("status")),
      category_id: str(formData.get("category_id")),
      website: str(formData.get("website")),
      primary_email: str(formData.get("primary_email")),
      primary_phone: str(formData.get("primary_phone")),
      notes: str(formData.get("notes")),
      rating_internal: rating(formData.get("rating_internal")),
    })
    .select("id")
    .single();

  if (error || !supplier) {
    throw new Error(error?.message ?? "Failed to create supplier");
  }

  // Optionally create a primary contact when contact details were provided.
  const contactName = str(formData.get("contact_name"));
  const contactEmail = str(formData.get("contact_email"));
  const contactPhone = str(formData.get("contact_phone"));
  if (contactName || contactEmail || contactPhone) {
    await supabase.from("supplier_contacts").insert({
      workspace_id: workspaceId,
      supplier_id: supplier.id,
      name: contactName ?? name,
      email: contactEmail,
      phone: contactPhone,
      role: str(formData.get("contact_role")),
      is_primary: true,
    });
  }

  revalidatePath("/event-manager/suppliers");
  redirect(`/event-manager/suppliers/${supplier.id}`);
}

/**
 * Update an existing supplier scoped to the active workspace, then redirect
 * back to its detail page.
 */
export async function updateSupplier(supplierId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const name = str(formData.get("name"));
  if (!name) throw new Error("Supplier name is required");

  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      status: coerceStatus(formData.get("status")),
      category_id: str(formData.get("category_id")),
      website: str(formData.get("website")),
      primary_email: str(formData.get("primary_email")),
      primary_phone: str(formData.get("primary_phone")),
      notes: str(formData.get("notes")),
      rating_internal: rating(formData.get("rating_internal")),
    })
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/suppliers");
  revalidatePath(`/event-manager/suppliers/${supplierId}`);
  redirect(`/event-manager/suppliers/${supplierId}`);
}
