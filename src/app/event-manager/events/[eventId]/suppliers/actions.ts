"use server";

import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const SUPPLIER_EDITABLE = new Set(["role", "status", "notes"]);

export async function updateEventSupplierField(
  eventId: string,
  supplierId: string,
  field: string,
  value: string
): Promise<{ error?: string }> {
  if (!SUPPLIER_EDITABLE.has(field)) return { error: "Field not editable" };

  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("event_suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!existing) return { error: "Supplier record not found or no permission" };

  const parsedValue: string | null = value === "" ? null : value;

  const { error } = await supabase
    .from("event_suppliers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ [field]: parsedValue, updated_at: new Date().toISOString() } as any)
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  revalidatePath(`/event-manager/events/${eventId}/suppliers`);
  return {};
}
