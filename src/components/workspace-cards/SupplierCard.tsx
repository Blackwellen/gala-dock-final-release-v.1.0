import Link from "next/link";
import { ShieldCheck, Star, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface SupplierCardData {
  id: string;
  name: string;
  status: string;
  category: string | null;
  ratingInternal: number | null;
  logoUrl: string | null;
  insuranceExpiry: string | null;
  responseTimeLabel?: string | null;
}

export function SupplierCard({ supplier, className }: { supplier: SupplierCardData; className?: string }) {
  const insuranceValid = supplier.insuranceExpiry ? new Date(supplier.insuranceExpiry) > new Date() : null;
  return (
    <Link
      href={`/event-manager/suppliers/${supplier.id}`}
      className={cn(
        "group block rounded-xl border border-surface-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition-all",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-100 text-sm font-semibold text-surface-600 overflow-hidden">
          {supplier.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={supplier.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            supplier.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-surface-900 text-sm truncate group-hover:text-brand-700">{supplier.name}</p>
          {supplier.category && <p className="text-xs text-surface-500">{supplier.category}</p>}
        </div>
        <StatusBadge status={supplier.status as Parameters<typeof StatusBadge>[0]["status"]} />
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-surface-500">
        {supplier.ratingInternal != null && (
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-warning-400 text-warning-400" /> {supplier.ratingInternal.toFixed(1)}
          </span>
        )}
        {insuranceValid != null && (
          <span className={cn("flex items-center gap-1", insuranceValid ? "text-success-600" : "text-danger-600")}>
            <ShieldCheck className="w-3.5 h-3.5" /> {insuranceValid ? "Insured" : "Insurance expired"}
          </span>
        )}
        {supplier.responseTimeLabel && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {supplier.responseTimeLabel}
          </span>
        )}
      </div>
    </Link>
  );
}
