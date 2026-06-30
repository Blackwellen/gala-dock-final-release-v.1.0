import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Form, FormField } from "@/lib/supabase/types";
import { FormBuilder, type EventOption, type FormBuilderInitial } from "../../FormBuilder";
import { coerceFieldType, coerceFormType, normaliseOptions } from "../../lib";

export const dynamic = "force-dynamic";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("forms")
    .select("*")
    .eq("id", formId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!form) notFound();
  const f = form as Form;

  const { data: fields } = await supabase
    .from("form_fields")
    .select("*")
    .eq("form_id", formId)
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const options: EventOption[] = (events ?? []).map((e) => ({ id: e.id, name: e.name }));

  const initial: FormBuilderInitial = {
    id: f.id,
    title: f.title,
    description: f.description ?? "",
    formType: coerceFormType(f.form_type),
    eventId: f.event_id,
    isPublished: f.status === "published",
    fields: ((fields ?? []) as FormField[]).map((fld, i) => ({
      key: `db_${fld.id}_${i}`,
      id: fld.id,
      field_type: coerceFieldType(fld.field_type),
      label: fld.label,
      placeholder: fld.placeholder ?? "",
      options: normaliseOptions(fld.options),
      required: fld.required,
    })),
  };

  return <FormBuilder initial={initial} events={options} />;
}
