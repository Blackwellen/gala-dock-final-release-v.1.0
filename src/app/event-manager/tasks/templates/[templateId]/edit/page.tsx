import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { TaskTemplate, TaskTemplateItem } from "@/lib/supabase/types";
import { TemplateEditClient } from "./TemplateEditClient";

export const metadata = { title: "Edit Task Template" };

export default async function EditTaskTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("task_templates")
    .select("*")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!template) notFound();

  const { data: items } = await supabase
    .from("task_template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("offset_days", { ascending: true });

  return (
    <TemplateEditClient
      template={template as TaskTemplate}
      items={(items ?? []) as TaskTemplateItem[]}
    />
  );
}
