import { createAdminClient } from "@/lib/supabase/admin";
import type { Form, FormField } from "@/lib/supabase/types";
import { coerceFieldType, normaliseOptions } from "@/app/(app)/forms/lib";
import { PublicFormClient, type PublicField } from "./PublicFormClient";
import { FileX2 } from "lucide-react";

export const dynamic = "force-dynamic";

function Shell({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card max-w-md w-full p-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
          <FileX2 className="w-6 h-6 text-surface-400" strokeWidth={1.5} />
        </div>
        <h1 className="text-lg font-semibold text-surface-900">{title}</h1>
        <p className="mt-2 text-sm text-surface-500">{message}</p>
        <p className="mt-8 text-xs text-surface-400">Powered by Gala Dock</p>
      </div>
    </main>
  );
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ formToken: string }>;
}) {
  const { formToken } = await params;
  const admin = createAdminClient();

  const { data: form } = await admin
    .from("forms")
    .select("*")
    .eq("share_token", formToken)
    .maybeSingle();

  if (!form || (form as Form).deleted_at) {
    return (
      <Shell
        title="Form not found"
        message="This link is invalid or the form has been removed."
      />
    );
  }

  const f = form as Form;
  if (f.status !== "published") {
    return (
      <Shell
        title="Form unavailable"
        message="This form is not currently accepting responses. Please check back later."
      />
    );
  }

  const { data: workspace } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", f.workspace_id)
    .maybeSingle();

  const { data: fields } = await admin
    .from("form_fields")
    .select("*")
    .eq("form_id", f.id)
    .order("sort_order", { ascending: true });

  const publicFields: PublicField[] = ((fields ?? []) as FormField[]).map((fld) => ({
    id: fld.id,
    label: fld.label,
    fieldType: coerceFieldType(fld.field_type),
    placeholder: fld.placeholder,
    options: normaliseOptions(fld.options),
    required: fld.required,
  }));

  return (
    <PublicFormClient
      shareToken={formToken}
      workspaceName={workspace?.name ?? "Gala Dock"}
      title={f.title}
      description={f.description}
      fields={publicFields}
    />
  );
}
