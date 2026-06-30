import Link from "next/link";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Supplier "Jobs" view — the supplier persona's work queue (tasks/jobs in their workspace).
export default async function JobsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("tasks")
    .select("id, title, status, due_at")
    .eq("workspace_id", workspaceId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(50);

  const rows = jobs ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Jobs" description="Work assigned to you across events." />
      <div className="px-6 lg:px-8 pb-8">
        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Jobs you're assigned to from events and RFQs will appear here."
          />
        ) : (
          <div className="rounded-xl border border-surface-200 bg-white divide-y divide-surface-100">
            {rows.map((j) => (
              <Link
                key={j.id}
                href={`/event-manager/tasks/${j.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-50"
              >
                <span className="text-sm text-surface-800 truncate">{j.title}</span>
                <span className="text-xs text-surface-400 shrink-0 ml-3">{String(j.status)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
