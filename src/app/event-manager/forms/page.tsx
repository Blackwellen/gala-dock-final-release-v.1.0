import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Form, FormSubmission } from "@/lib/supabase/types";
import { FormsClient, type FormCard, type FormsKpis } from "./FormsClient";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: forms } = await supabase
    .from("forms")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const typed = (forms ?? []) as Form[];

  // Last submission date per form (single query, grouped client-side).
  const ids = typed.map((f) => f.id);
  let lastByForm = new Map<string, string>();
  let monthCount = 0;
  if (ids.length > 0) {
    const { data: subs } = await supabase
      .from("form_submissions")
      .select("form_id, created_at")
      .eq("workspace_id", workspaceId)
      .in("form_id", ids)
      .order("created_at", { ascending: false });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    for (const s of (subs ?? []) as Pick<FormSubmission, "form_id" | "created_at">[]) {
      if (!lastByForm.has(s.form_id)) lastByForm.set(s.form_id, s.created_at);
      if (new Date(s.created_at).getTime() >= monthStart) monthCount += 1;
    }
  }

  const cards: FormCard[] = typed.map((f) => ({
    id: f.id,
    title: f.title,
    formType: f.form_type as FormCard["formType"],
    status: f.status as FormCard["status"],
    submissionCount: f.submission_count,
    shareToken: f.share_token,
    lastSubmissionAt: lastByForm.get(f.id) ?? null,
  }));

  const kpis: FormsKpis = {
    total: typed.length,
    published: typed.filter((f) => f.status === "published").length,
    totalSubmissions: typed.reduce((sum, f) => sum + (f.submission_count ?? 0), 0),
    newThisMonth: monthCount,
  };

  return <FormsClient forms={cards} kpis={kpis} />;
}
