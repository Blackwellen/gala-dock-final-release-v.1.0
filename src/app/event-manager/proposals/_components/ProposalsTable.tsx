"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, FileText, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { EventTypeThumb, OwnerAvatar, formatMoney } from "@/components/sales/SalesPrimitives";
import type { Proposal } from "@/lib/supabase/types";
import { effectiveStatus, nextActionLabel, proposalCode } from "./proposalHelpers";

export function ProposalsTable({
  proposals,
  ownerNameById,
}: {
  proposals: Proposal[];
  ownerNameById: Map<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    setSelected((prev) => (prev.size === proposals.length ? new Set() : new Set(proposals.map((p) => p.id))));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (proposals.length === 0) {
    return (
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
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full divide-y divide-surface-100 text-sm">
        <thead className="border-b border-surface-200 bg-surface-50">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={selected.size === proposals.length && proposals.length > 0}
                onChange={toggleAll}
                onClick={(e) => e.stopPropagation()}
                className="h-3.5 w-3.5 rounded border-surface-300"
                aria-label="Select all proposals"
              />
            </th>
            <Th>Proposal</Th>
            <Th className="hidden lg:table-cell">Event</Th>
            <Th className="hidden md:table-cell">Client</Th>
            <Th className="hidden xl:table-cell">Sent</Th>
            <Th className="hidden xl:table-cell">Expiry</Th>
            <Th className="text-right">Value</Th>
            <Th className="hidden lg:table-cell text-right">Margin</Th>
            <Th className="hidden xl:table-cell">Version</Th>
            <Th className="hidden md:table-cell">Owner</Th>
            <Th>Status</Th>
            <Th className="hidden lg:table-cell">Next Action</Th>
            <th className="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {proposals.map((p) => {
            const status = effectiveStatus(p);
            const ownerName = p.owner_id ? ownerNameById.get(p.owner_id) ?? "Assigned" : null;
            return (
              <tr
                key={p.id}
                onClick={() => router.push(`/event-manager/proposals/${p.id}`)}
                className="cursor-pointer transition-colors hover:bg-surface-50"
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="h-3.5 w-3.5 rounded border-surface-300"
                    aria-label={`Select ${p.title}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <EventTypeThumb type={p.event_type} imageUrl={p.cover_image_url} className="h-8 w-8 shrink-0" iconClassName="h-4 w-4" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-surface-900">{p.title}</p>
                      <p className="truncate text-xs text-surface-400">{proposalCode(p)}</p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <div className="flex flex-col gap-0.5">
                    {p.event_type && (
                      <span className="w-fit rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[11px] font-medium text-surface-600">
                        {p.event_type}
                      </span>
                    )}
                    <span className="text-xs text-surface-400">
                      {p.event_date ? formatDate(p.event_date) : "—"}
                    </span>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-surface-600 md:table-cell">{p.client_name}</td>
                <td className="hidden px-4 py-3 text-surface-500 xl:table-cell">
                  {p.status !== "draft" ? formatDate(p.created_at) : "—"}
                </td>
                <td className="hidden px-4 py-3 text-surface-500 xl:table-cell">
                  {p.valid_until ? formatDate(p.valid_until) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-surface-900">
                  {formatMoney(p.total_cents, p.currency)}
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums text-surface-600 lg:table-cell">
                  {p.margin_pct !== null && p.margin_pct !== undefined ? `${p.margin_pct}%` : "—"}
                </td>
                <td className="hidden px-4 py-3 text-surface-500 xl:table-cell">v{p.version}</td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {ownerName ? (
                    <div className="flex items-center gap-2">
                      <OwnerAvatar name={ownerName} size="xs" />
                      <span className="truncate text-xs text-surface-600">{ownerName}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-surface-400">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={status} />
                </td>
                <td className="hidden px-4 py-3 text-xs text-surface-500 lg:table-cell">
                  {nextActionLabel(p)}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-700"
                    aria-label={`More actions for ${p.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-500 " + className
      }
    >
      {children}
    </th>
  );
}
