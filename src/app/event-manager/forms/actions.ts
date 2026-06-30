"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  coerceFormType,
  coerceFieldType,
  needsOptions,
} from "./lib";
import type { FieldType } from "@/lib/supabase/types";

function str(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/** A field definition coming back from the builder client (JSON-encoded). */
interface FieldInput {
  id?: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  options: string[];
  required: boolean;
  sort_order: number;
}

function parseFields(raw: FormDataEntryValue | null): FieldInput[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((f, i) => {
    const obj = (f ?? {}) as Record<string, unknown>;
    const fieldType: FieldType = coerceFieldType(obj.field_type as string);
    const label = String(obj.label ?? "").trim() || "Untitled field";
    const options = Array.isArray(obj.options)
      ? (obj.options as unknown[]).map((o) => String(o)).filter((o) => o.trim() !== "")
      : [];
    return {
      id: typeof obj.id === "string" && obj.id ? obj.id : undefined,
      field_type: fieldType,
      label,
      placeholder: obj.placeholder ? String(obj.placeholder) : null,
      options: needsOptions(fieldType) ? options : [],
      required: Boolean(obj.required),
      sort_order: i,
    };
  });
}

async function assertForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  formId: string
) {
  const { data } = await supabase
    .from("forms")
    .select("id, status, share_token")
    .eq("id", formId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Form not found");
  return data;
}

/**
 * Sync the field set for a form. Existing fields (carrying a db id) are updated
 * in place so their ids — which submission `data` keys reference — survive an
 * edit. New fields are inserted, and any fields no longer present are deleted.
 */
async function syncFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  formId: string,
  fields: FieldInput[]
) {
  // Existing field ids for this form, to compute deletions.
  const { data: existingRows } = await supabase
    .from("form_fields")
    .select("id")
    .eq("form_id", formId)
    .eq("workspace_id", workspaceId);
  const existingIds = new Set((existingRows ?? []).map((r) => r.id));
  const keptIds = new Set<string>();

  for (const f of fields) {
    const base = {
      field_type: f.field_type,
      label: f.label,
      placeholder: f.placeholder,
      options: f.options,
      required: f.required,
      sort_order: f.sort_order,
    };
    if (f.id && existingIds.has(f.id)) {
      keptIds.add(f.id);
      const { error } = await supabase
        .from("form_fields")
        .update(base)
        .eq("id", f.id)
        .eq("form_id", formId)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("form_fields")
        .insert({ form_id: formId, workspace_id: workspaceId, ...base });
      if (error) throw new Error(error.message);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    await supabase
      .from("form_fields")
      .delete()
      .eq("form_id", formId)
      .eq("workspace_id", workspaceId)
      .in("id", toDelete);
  }
}

/**
 * Create a new form with its fields. `publish` controls whether the form goes
 * live immediately (generating a share token) or is saved as a draft.
 */
export async function createForm(formData: FormData) {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const title = str(formData.get("title"));
  if (!title) throw new Error("Form title is required");

  const publish = String(formData.get("publish") ?? "") === "true";
  const formType = coerceFormType(str(formData.get("form_type")));
  const fields = parseFields(formData.get("fields"));

  const { data: form, error } = await supabase
    .from("forms")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title,
      description: str(formData.get("description")),
      form_type: formType,
      event_id: str(formData.get("event_id")),
      status: publish ? "published" : "draft",
      share_token: publish ? randomUUID() : null,
    })
    .select("id")
    .single();

  if (error || !form) throw new Error(error?.message ?? "Failed to create form");

  await syncFields(supabase, workspaceId, form.id, fields);

  revalidatePath("/event-manager/forms");
  redirect(`/event-manager/forms/${form.id}`);
}

/** Update an existing form's metadata + field set. */
export async function updateForm(formId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const existing = await assertForm(supabase, workspaceId, formId);

  const title = str(formData.get("title"));
  if (!title) throw new Error("Form title is required");

  const publish = String(formData.get("publish") ?? "") === "true";
  const formType = coerceFormType(str(formData.get("form_type")));
  const fields = parseFields(formData.get("fields"));

  // Publishing for the first time mints a share token; otherwise keep the
  // current status unless explicitly publishing.
  const nextStatus = publish ? "published" : existing.status;
  const nextToken =
    publish && !existing.share_token ? randomUUID() : existing.share_token;

  const { error } = await supabase
    .from("forms")
    .update({
      title,
      description: str(formData.get("description")),
      form_type: formType,
      event_id: str(formData.get("event_id")),
      status: nextStatus,
      share_token: nextToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  await syncFields(supabase, workspaceId, formId, fields);

  revalidatePath("/event-manager/forms");
  revalidatePath(`/event-manager/forms/${formId}`);
  redirect(`/event-manager/forms/${formId}`);
}

/** Publish a draft form: set status + mint a share token if missing. */
export async function publishForm(formId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const existing = await assertForm(supabase, workspaceId, formId);

  const { error } = await supabase
    .from("forms")
    .update({
      status: "published",
      share_token: existing.share_token ?? randomUUID(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/forms");
  revalidatePath(`/event-manager/forms/${formId}`);
}

/** Archive (or unarchive) a form. */
export async function setFormStatus(formId: string, status: "draft" | "published" | "archived") {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  await assertForm(supabase, workspaceId, formId);

  const { error } = await supabase
    .from("forms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", formId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/forms");
  revalidatePath(`/event-manager/forms/${formId}`);
}

/** Soft-delete a form and return to the register. */
export async function deleteForm(formId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("forms")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", formId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/forms");
  redirect("/event-manager/forms");
}
