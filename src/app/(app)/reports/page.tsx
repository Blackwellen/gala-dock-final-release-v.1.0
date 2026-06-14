import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { loadReportsData } from "./data";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { workspaceId } = await requireWorkspace();
  const data = await loadReportsData(workspaceId);

  return (
    <div className="min-h-full bg-surface-50">
      <PageHeader
        title="Reports & Analytics"
        description="Live performance across revenue, events, suppliers, team and clients."
        actions={
          <Link
            href="/finance"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-600 hover:text-surface-900 px-3 py-1.5 rounded-lg border border-surface-200 bg-white hover:bg-surface-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to Finance
          </Link>
        }
      />
      <ReportsClient data={data} />
    </div>
  );
}
