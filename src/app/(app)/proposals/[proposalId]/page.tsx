import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Proposal, ProposalLineItem, ProposalStatus } from "@/lib/supabase/types";
import { ProposalDocument } from "../_components/ProposalDocument";
import { isExpired } from "../_lib/proposals";
import { ProposalActions } from "./ProposalActions";

export const metadata = { title: "Proposal" };

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const supabase = await createClient();

  const { data: proposalRow } = await supabase
    .from("proposals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", proposalId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!proposalRow) notFound();
  const proposal = proposalRow as Proposal;

  const { data: lineData } = await supabase
    .from("proposal_line_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: true });

  const lineItems = (lineData ?? []) as ProposalLineItem[];
  const effective: ProposalStatus = isExpired(proposal.valid_until, proposal.status as ProposalStatus)
    ? "expired"
    : (proposal.status as ProposalStatus);

  const shareToken = proposal.share_token ?? "";

  return (
    <div className="flex min-h-full flex-col bg-surface-50">
      <div className="border-b border-surface-200 bg-white px-6 py-5">
        <Link
          href="/proposals"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-800"
        >
          <ArrowLeft className="h-4 w-4" /> Proposals
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-surface-900">
              {proposal.title}
            </h1>
            <p className="mt-0.5 text-sm text-surface-500">{proposal.client_name}</p>
          </div>
          <StatusBadge status={effective} />
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main document */}
          <div className="rounded-xl border border-surface-200 bg-white p-8 shadow-card">
            <ProposalDocument
              proposal={proposal}
              lineItems={lineItems}
              workspaceName={workspace.name}
            />

            {/* Signature status */}
            <div className="mt-8 rounded-lg border border-surface-200 bg-surface-50 p-5">
              {proposal.signed_at && proposal.signed_by_name ? (
                <div>
                  <p className="text-sm font-semibold text-success-700">Signed</p>
                  <p className="mt-1 text-sm text-surface-600">
                    Signed by <span className="font-medium text-surface-900">{proposal.signed_by_name}</span> on{" "}
                    {new Date(proposal.signed_at).toLocaleString("en-GB")}
                  </p>
                  {proposal.signed_ip && (
                    <p className="mt-0.5 text-xs text-surface-400">IP recorded: {proposal.signed_ip}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-surface-500">Awaiting signature.</p>
              )}
            </div>
          </div>

          {/* Right rail */}
          <ProposalActions
            proposalId={proposal.id}
            status={effective}
            rawStatus={proposal.status as ProposalStatus}
            shareToken={shareToken}
            convertedInvoiceId={proposal.converted_invoice_id}
            createdAt={proposal.created_at}
            viewedAt={proposal.viewed_at}
            signedAt={proposal.signed_at}
          />
        </div>
      </div>
    </div>
  );
}
