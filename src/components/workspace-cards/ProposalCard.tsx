import Link from "next/link";
import { formatCurrency, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface ProposalCardData {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  eventDate: string | null;
  totalCents: number | null;
  currency: string;
  marginPct: number | null;
  coverImageUrl: string | null;
}

export function ProposalCard({ proposal, className }: { proposal: ProposalCardData; className?: string }) {
  return (
    <Link
      href={`/event-manager/proposals/${proposal.id}`}
      className={cn(
        "group block rounded-xl border border-surface-200 bg-white overflow-hidden hover:border-brand-300 hover:shadow-md transition-all",
        className
      )}
    >
      <div className="relative h-20 bg-gradient-to-br from-brand-600 to-indigo-700">
        {proposal.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proposal.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute top-2 right-2">
          <StatusBadge status={proposal.status as Parameters<typeof StatusBadge>[0]["status"]} />
        </div>
      </div>
      <div className="p-3.5">
        <h3 className="font-semibold text-surface-900 text-sm truncate group-hover:text-brand-700">{proposal.title}</h3>
        {proposal.clientName && <p className="text-xs text-surface-500 truncate">{proposal.clientName}</p>}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-surface-500">
            {proposal.eventDate ? new Date(proposal.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date TBC"}
          </span>
          {proposal.totalCents != null && (
            <span className="font-semibold text-surface-900">{formatCurrency(proposal.totalCents / 100, proposal.currency)}</span>
          )}
        </div>
        {proposal.marginPct != null && (
          <p className="mt-1 text-[11px] text-surface-400">{proposal.marginPct.toFixed(0)}% margin</p>
        )}
      </div>
    </Link>
  );
}
