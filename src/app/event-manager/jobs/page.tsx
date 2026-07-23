import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, JOBS_TABS } from "@/components/ui/SectionTabs";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { JobsList } from "./JobsList";

export const dynamic = "force-dynamic";

// Supplier "Jobs" view — the supplier persona's work queue (tasks/jobs in their workspace).
// Overview shows every job in the workspace; see Assigned/Completed/Evidence for the
// depth sub-tabs (JOBS_TABS in @/components/ui/SectionTabs).
export default async function JobsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("tasks")
    .select("id, title, status, due_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(50);

  const rows = jobs ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Jobs"
        description="Work assigned to you across events."
        tabs={<SectionTabs tabs={JOBS_TABS} />}
      />
      <div className="px-6 lg:px-8 pb-8">
        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Jobs you're assigned to from events and RFQs will appear here."
          />
        ) : (
          <JobsList jobs={rows} />
        )}
      </div>
    </div>
  );
}
