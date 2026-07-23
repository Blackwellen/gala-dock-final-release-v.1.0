import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, JOBS_TABS } from "@/components/ui/SectionTabs";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { EvidenceList, type EvidenceRow } from "./EvidenceList";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function filenameFromPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export default async function JobEvidencePage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: attachments } = await supabase
    .from("task_attachments")
    .select("id, task_id, mime, size_bytes, storage_path, uploaded_by, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const attachmentList = attachments ?? [];

  const taskIds = Array.from(new Set(attachmentList.map((a) => a.task_id)));
  const { data: tasks } = taskIds.length
    ? await supabase.from("tasks").select("id, title").in("id", taskIds)
    : { data: [] as { id: string; title: string }[] };
  const taskTitleById = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  const uploaderIds = Array.from(new Set(attachmentList.map((a) => a.uploaded_by)));
  const { data: profiles } = uploaderIds.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", uploaderIds)
    : { data: [] as { user_id: string; display_name: string | null }[] };
  const uploaderNameById = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Team member"]));

  const rows: EvidenceRow[] = attachmentList.map((a) => ({
    id: a.id,
    taskId: a.task_id,
    taskTitle: taskTitleById.get(a.task_id) ?? "Job",
    filename: filenameFromPath(a.storage_path),
    mime: a.mime,
    sizeLabel: formatBytes(a.size_bytes),
    uploadedByName: uploaderNameById.get(a.uploaded_by) ?? "Team member",
    createdAtLabel: formatDate(a.created_at),
  }));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Jobs"
        description="Photos and documents uploaded as proof of completion for your jobs."
        tabs={<SectionTabs tabs={JOBS_TABS} />}
      />
      <div className="px-6 lg:px-8 pb-8">
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No evidence uploaded yet"
            description="Photos and documents attached to your jobs as proof of completion will appear here."
          />
        ) : (
          <EvidenceList rows={rows} />
        )}
      </div>
    </div>
  );
}
