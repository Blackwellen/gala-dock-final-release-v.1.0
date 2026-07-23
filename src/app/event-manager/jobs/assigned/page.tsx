import { UserCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, JOBS_TABS } from "@/components/ui/SectionTabs";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { JobsList } from "../JobsList";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["backlog", "todo", "in_progress", "blocked", "review"] as const;

export default async function AssignedJobsPage() {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", user.id);

  const taskIds = (assignments ?? []).map((a) => a.task_id);

  const { data: jobs } = taskIds.length
    ? await supabase
        .from("tasks")
        .select("id, title, status, due_at")
        .eq("workspace_id", workspaceId)
        .in("id", taskIds)
        .in("status", OPEN_STATUSES)
        .is("archived_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
    : { data: [] as { id: string; title: string; status: string; due_at: string | null }[] };

  const rows = jobs ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Jobs"
        description="Open jobs currently assigned to you."
        tabs={<SectionTabs tabs={JOBS_TABS} />}
      />
      <div className="px-6 lg:px-8 pb-8">
        {rows.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No jobs assigned to you"
            description="Open jobs assigned to you across events and RFQs will appear here."
          />
        ) : (
          <JobsList jobs={rows} />
        )}
      </div>
    </div>
  );
}
