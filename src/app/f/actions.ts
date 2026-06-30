"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { coerceFieldType, isInputField } from "@/app/event-manager/forms/lib";

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

/**
 * Public form submission. No auth. Resolves the form by its share token via the
 * service-role client, validates required fields server-side, inserts a
 * submission, bumps the form's submission_count, and — for enquiry forms —
 * creates a linked lead.
 */
export async function submitPublicForm(
  shareToken: string,
  values: Record<string, string | string[]>
): Promise<SubmitResult> {
  const admin = createAdminClient();

  const { data: form } = await admin
    .from("forms")
    .select("id, workspace_id, form_type, status, submission_count, deleted_at")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (!form || form.deleted_at) return { ok: false, error: "Form not found." };
  if (form.status !== "published")
    return { ok: false, error: "This form is not currently accepting responses." };

  const { data: fields } = await admin
    .from("form_fields")
    .select("*")
    .eq("form_id", form.id)
    .order("sort_order", { ascending: true });

  // Server-side required validation.
  for (const f of fields ?? []) {
    const type = coerceFieldType(f.field_type);
    if (!isInputField(type) || !f.required) continue;
    const v = values[f.id];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
    if (empty) return { ok: false, error: `"${f.label}" is required.` };
  }

  // Derive submitter name/email from any matching field labels.
  let submitterName: string | null = null;
  let submitterEmail: string | null = null;
  for (const f of fields ?? []) {
    const label = f.label.toLowerCase();
    const raw = values[f.id];
    const text = Array.isArray(raw) ? raw.join(", ") : (raw ?? "");
    if (!text) continue;
    if (!submitterEmail && (label.includes("email") || /@/.test(text))) {
      if (/@/.test(text)) submitterEmail = text;
    }
    if (!submitterName && label.includes("name")) submitterName = text;
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null;
  const userAgent = hdrs.get("user-agent");

  const { data: submission, error: submissionError } = await admin
    .from("form_submissions")
    .insert({
      form_id: form.id,
      workspace_id: form.workspace_id,
      data: values,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      ip_address: ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // Enquiry forms auto-create a lead in the workspace pipeline.
  if (form.form_type === "enquiry") {
    const { data: lead } = await admin
      .from("leads")
      .insert({
        workspace_id: form.workspace_id,
        title: submitterName ? `Enquiry — ${submitterName}` : "Website enquiry",
        client_name: submitterName ?? "Website enquiry",
        client_email: submitterEmail,
        stage: "new-enquiry",
        source: "website",
        notes: "Created automatically from a public enquiry form submission.",
      })
      .select("id")
      .single();

    if (lead) {
      await admin
        .from("form_submissions")
        .update({ created_lead_id: lead.id })
        .eq("id", submission.id);
    }
  }

  // Increment the submission counter (read current value to avoid an RPC dep).
  await admin
    .from("forms")
    .update({ submission_count: (form.submission_count ?? 0) + 1 })
    .eq("id", form.id);

  return { ok: true };
}
