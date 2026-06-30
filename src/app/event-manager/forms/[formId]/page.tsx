import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Form, FormField, FormSubmission, FormType, FormStatus } from "@/lib/supabase/types";
import { coerceFieldType, normaliseOptions } from "../lib";
import {
  FormDetailClient,
  type DetailField,
  type DetailSubmission,
} from "./FormDetailClient";

export const dynamic = "force-dynamic";

export default async function FormDetailPage({
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

  const { data: submissions } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("form_id", formId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const detailFields: DetailField[] = ((fields ?? []) as FormField[]).map((fld) => ({
    id: fld.id,
    label: fld.label,
    fieldType: coerceFieldType(fld.field_type),
    options: normaliseOptions(fld.options),
    required: fld.required,
  }));

  const detailSubmissions: DetailSubmission[] = ((submissions ?? []) as FormSubmission[]).map(
    (s) => ({
      id: s.id,
      createdAt: s.created_at,
      submitterName: s.submitter_name,
      submitterEmail: s.submitter_email,
      data: (s.data ?? {}) as Record<string, unknown>,
      createdLeadId: s.created_lead_id,
    })
  );

  return (
    <FormDetailClient
      form={{
        id: f.id,
        title: f.title,
        description: f.description,
        formType: f.form_type as FormType,
        status: f.status as FormStatus,
        shareToken: f.share_token,
        submissionCount: f.submission_count,
      }}
      fields={detailFields}
      submissions={detailSubmissions}
    />
  );
}
