import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Proposal } from "@/lib/supabase/types";
import { formatPence } from "./_lib/proposals";
import { ProposalsTable } from "./_components/ProposalsTable";

export const metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const proposals = (data ?? []) as Proposal[];

  const total = proposals.length;
  const awaiting = proposals.filter((p) => p.status === "sent" || p.status === "viewed").length;
  const totalValue = proposals.reduce((sum, p) => sum + (p.total_cents ?? 0), 0);
  const sentCount = proposals.filter((p) =>
    ["sent", "viewed", "signed", "declined", "converted", "expired"].includes(p.status)
  ).length;
  const signedCount = proposals.filter((p) => p.status === "signed" || p.status === "converted").length;
  const conversionRate = sentCount > 0 ? Math.round((signedCount / sentCount) * 100) : 0;

  return (
    <div className="flex min-h-full flex-col bg-surface-50">
      <PageHeader
        title="Proposals"
        description="Draft, send and track client proposals through to signature"
        actions={
          <Link
            href="/proposals/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            New Proposal
          </Link>
        }
      />

      <div className="flex-1 space-y-5 p-6">
        <KPIGrid className="lg:grid-cols-4 xl:grid-cols-4">
          <MetricCard label="Total Proposals" value={total} icon={FileText} />
          <MetricCard
            label="Awaiting Signature"
            value={awaiting}
            iconBg="bg-info-50"
            iconColor="text-info-600"
            icon={FileText}
          />
          <MetricCard
            label="Total Value"
            value={formatPence(totalValue)}
            iconBg="bg-success-50"
            iconColor="text-success-600"
            icon={FileText}
          />
          <MetricCard
            label="Conversion Rate"
            value={`${conversionRate}%`}
            iconBg="bg-brand-50"
            iconColor="text-brand-600"
            icon={FileText}
          />
        </KPIGrid>

        <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-card">
          {proposals.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No proposals yet"
              description="Create your first proposal to send to a client and capture an e-signature."
              action={
                <Link
                  href="/proposals/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" />
                  New Proposal
                </Link>
              }
            />
          ) : (
            <ProposalsTable proposals={proposals} />
          )}
        </div>
      </div>
    </div>
  );
}
