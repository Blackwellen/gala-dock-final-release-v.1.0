"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import type { Proposal, ProposalStatus } from "@/lib/supabase/types";
import { formatPence, isExpired } from "../_lib/proposals";

const FILTERS: { id: ProposalStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "viewed", label: "Viewed" },
  { id: "signed", label: "Signed" },
  { id: "declined", label: "Declined" },
  { id: "converted", label: "Converted" },
];

function effectiveStatus(p: Proposal): ProposalStatus {
  const status = p.status as ProposalStatus;
  if (isExpired(p.valid_until, status)) return "expired";
  return status;
}

export function ProposalsTable({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return proposals.filter((p) => {
      const eff = effectiveStatus(p);
      if (filter !== "all" && eff !== filter) return false;
      if (q && !p.title.toLowerCase().includes(q) && !p.client_name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [proposals, filter, query]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-200 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (filter === f.id
                  ? "bg-brand-600 text-white"
                  : "bg-surface-100 text-surface-600 hover:bg-surface-200")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or client"
            className="w-56 rounded-lg border border-surface-200 py-1.5 pl-8 pr-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-surface-100 text-sm">
          <thead className="border-b border-surface-200 bg-surface-50">
            <tr>
              <Th>Title</Th>
              <Th>Client</Th>
              <Th>Event date</Th>
              <Th className="text-right">Value</Th>
              <Th>Status</Th>
              <Th>Valid until</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-surface-400">
                  No proposals match your filters.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/proposals/${p.id}`)}
                  className="cursor-pointer transition-colors hover:bg-surface-50"
                >
                  <td className="px-6 py-3 font-medium text-surface-900">{p.title}</td>
                  <td className="px-6 py-3 text-surface-600">{p.client_name}</td>
                  <td className="px-6 py-3 text-surface-500">
                    {p.event_date ? formatDate(p.event_date) : "—"}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold tabular-nums text-surface-900">
                    {formatPence(p.total_cents ?? 0, p.currency)}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={effectiveStatus(p)} />
                  </td>
                  <td className="px-6 py-3 text-surface-500">
                    {p.valid_until ? formatDate(p.valid_until) : "—"}
                  </td>
                  <td className="px-6 py-3 text-surface-500">{formatDate(p.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-500 " + className
      }
    >
      {children}
    </th>
  );
}
