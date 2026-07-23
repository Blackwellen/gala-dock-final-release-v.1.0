import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Clock } from "lucide-react";
import { getListingByServiceSlug, toSupplierCard } from "@/lib/marketplace/queries";
import { formatPriceFrom } from "@/lib/marketplace/format";
import { RequestQuoteForm } from "./RequestQuoteForm";

// Live Supabase-backed data (Phase 4) — cannot be statically generated at build time.
export const dynamic = "force-dynamic";

export default async function RequestQuotePage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const result = await getListingByServiceSlug(serviceSlug);
  if (!result) notFound();
  const supplier = toSupplierCard(result.row, result.workspaceName, result.workspaceSlug ?? result.workspaceId);

  return (
    <div className="px-6 py-6 max-w-[880px] mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs mb-2 flex-wrap">
        <Link href="/event-manager/marketplace" className="text-surface-400 hover:text-surface-700">
          Marketplace
        </Link>
        <span className="text-surface-300">/</span>
        <Link
          href={`/event-manager/marketplace/suppliers/${supplier.slug}`}
          className="text-surface-400 hover:text-surface-700"
        >
          {supplier.name}
        </Link>
        <span className="text-surface-300">/</span>
        <Link
          href={`/event-manager/marketplace/services/${supplier.serviceSlug}`}
          className="text-surface-400 hover:text-surface-700"
        >
          {supplier.serviceName}
        </Link>
        <span className="text-surface-300">/</span>
        <span className="text-surface-700 font-medium">Request Quote</span>
      </nav>

      <Link
        href={`/event-manager/marketplace/services/${supplier.serviceSlug}`}
        className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to service
      </Link>

      <h1 className="text-2xl font-semibold text-surface-900 tracking-tight">Request a quote</h1>
      <p className="mt-1 text-sm text-surface-500">
        Tell {supplier.name} about your event and they&apos;ll get back to you with pricing.
      </p>

      {/* Listing summary card */}
      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-surface-200 bg-white p-4 shadow-card">
        <div className="w-14 h-14 rounded-xl bg-surface-900 text-white flex items-center justify-center shrink-0">
          <span className="text-[9px] font-semibold text-center leading-tight px-1">{supplier.logoInitial}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-surface-900 truncate">{supplier.serviceName}</p>
            {supplier.verified && <BadgeCheck className="w-4 h-4 text-brand-600 shrink-0" />}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            by {supplier.name} · {supplier.category}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-surface-900">
            {formatPriceFrom(supplier.priceFromCents, supplier.priceUnit)}
          </p>
          <p className="inline-flex items-center gap-1 text-[11px] text-surface-500 mt-0.5">
            <Clock className="w-3 h-3" />
            Typically responds in {supplier.responseTime}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <RequestQuoteForm
          listingId={supplier.serviceId}
          supplierName={supplier.name}
          responseTime={supplier.responseTime}
        />
      </div>
    </div>
  );
}
