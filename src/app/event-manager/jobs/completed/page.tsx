import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, JOBS_TABS } from "@/components/ui/SectionTabs";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { JobsList } from "../JobsList";

export const dynamic = "force-dynamic";

export default async function CompletedJobsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("tasks")
    .select("id, title, status, due_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "done")
    .is("archived_at", null)
    .order("due_at", { ascending: false, nullsFirst: false })
    .limit(100);

  const rows = jobs ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Jobs"
        description="Jobs you've completed."
        tabs={<SectionTabs tabs={JOBS_TABS} />}
      />
      <div className="px-6 lg:px-8 pb-8">
        {rows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No completed jobs yet"
            description="Jobs move here once they're marked done."
          />
        ) : (
          <JobsList jobs={rows} />
        )}
      </div>
    </div>
  );
}
