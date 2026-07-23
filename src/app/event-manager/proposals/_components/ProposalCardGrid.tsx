"use client";

import { FileText, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { OwnerAvatar } from "@/components/sales/SalesPrimitives";
import type { Proposal } from "@/lib/supabase/types";
import { effectiveStatus, nextActionLabel } from "./proposalHelpers";
import { ProposalCard, type ProposalCardData } from "@/components/workspace-cards/ProposalCard";

/** Map a `Proposal` row onto the shared `ProposalCardData` shape used by the reusable `ProposalCard`. */
function toProposalCardData(p: Proposal): ProposalCardData {
  return {
    id: p.id,
    title: p.title,
    status: effectiveStatus(p),
    clientName: p.client_name,
    eventDate: p.event_date,
    totalCents: p.total_cents,
    currency: p.currency,
    marginPct: p.margin_pct,
    coverImageUrl: p.cover_image_url,
  };
}

export function ProposalCardGrid({
  proposals,
  ownerNameById,
}: {
  proposals: Proposal[];
  ownerNameById: Map<string, string>;
}) {
  if (proposals.length === 0) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white shadow-card">
        <EmptyState
          icon={FileText}
          title="No proposals match your filters"
          description="Try a different filter, search term, or create your first proposal."
          action={
            <Link
              href="/event-manager/proposals/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              New Proposal
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {proposals.map((p) => {
        const ownerName = p.owner_id ? ownerNameById.get(p.owner_id) ?? "Assigned" : null;
        return (
          <div key={p.id} className="flex flex-col gap-2">
            <ProposalCard proposal={toProposalCardData(p)} />
            <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
              <span className="truncate font-medium text-brand-600">{nextActionLabel(p)}</span>
              <span className="flex shrink-0 items-center gap-1 text-surface-400">
                <OwnerAvatar name={ownerName} size="xs" />
                {ownerName ?? "Unassigned"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
