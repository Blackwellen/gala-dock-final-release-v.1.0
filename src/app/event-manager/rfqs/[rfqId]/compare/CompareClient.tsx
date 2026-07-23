"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Award, Columns3, Sparkles, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDateShort } from "../../lib";
import { awardRfq } from "../../actions";

export interface ComparisonLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ComparisonResponse {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierRating: number | null;
  supplierTier: string | null;
  version: number;
  totalAmountCents: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  exclusions: string | null;
  assumptions: string | null;
  notes: string | null;
  submittedAt: string | null;
  lineItems: ComparisonLineItem[];
}

export function CompareClient({
  rfqId,
  rfqTitle,
  isAwarded,
  awardedSupplierId,
  guestCount,
  responses,
}: {
  rfqId: string;
  rfqTitle: string;
  isAwarded: boolean;
  awardedSupplierId: string | null;
  guestCount: number;
  responses: ComparisonResponse[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [awardingId, setAwardingId] = useState<string | null>(null);

  const bestValueSupplierId = useMemo(() => {
    const priced = responses.filter((r) => r.totalAmountCents !== null);
    if (priced.length === 0) return null;
    return priced.reduce((best, r) =>
      (r.totalAmountCents ?? Infinity) < (best.totalAmountCents ?? Infinity) ? r : best
    ).supplierId;
  }, [responses]);

  function handleAward(response: ComparisonResponse) {
    if (
      !confirm(
        `Award this RFQ to ${response.supplierName}? All other recipients will be marked rejected.`
      )
    ) {
      return;
    }
    setAwardingId(response.supplierId);
    startTransition(async () => {
      try {
        await awardRfq(rfqId, response.supplierId, response.id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not award RFQ");
      } finally {
        setAwardingId(null);
      }
    });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Compare Responses — ${rfqTitle}`}
        description="Side-by-side formal quotes submitted against this RFQ"
        actions={
          <Link
            href={`/event-manager/rfqs/${rfqId}`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to RFQ
          </Link>
        }
      />

      <div className="p-6 max-w-[1600px] space-y-4">
        {responses.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Columns3}
              title="No formal responses yet"
              description="Once suppliers submit a formal response their quotes will appear here side-by-side."
              compact
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider w-40" />
                  {responses.map((r) => (
                    <th
                      key={r.id}
                      className={
                        "px-4 py-3 text-left align-bottom border-b border-surface-200 " +
                        (r.supplierId === bestValueSupplierId ? "bg-warning-50" : "")
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-surface-900">{r.supplierName}</p>
                        {r.supplierId === bestValueSupplierId && (
                          <Sparkles className="w-3.5 h-3.5 text-warning-500" strokeWidth={2} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.supplierTier && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200 capitalize">
                            {r.supplierTier}
                          </span>
                        )}
                        {r.supplierRating !== null && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-surface-500">
                            <Star className="w-3 h-3 fill-warning-400 text-warning-400" />
                            {r.supplierRating}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                <Row label="Total Quote" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => (
                    <span className="text-base font-bold tabular-nums text-surface-900">
                      {formatMoney(r.totalAmountCents)}
                    </span>
                  )}
                </Row>
                {guestCount > 0 && (
                  <Row label="Per Guest" responses={responses} bestId={bestValueSupplierId}>
                    {(r) => (
                      <span className="tabular-nums text-surface-700">
                        {r.totalAmountCents !== null
                          ? formatMoney(Math.round(r.totalAmountCents / guestCount))
                          : "—"}
                      </span>
                    )}
                  </Row>
                )}
                <Row label="Lead Time" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => <span className="text-surface-700">{r.leadTimeDays !== null ? `${r.leadTimeDays} days` : "—"}</span>}
                </Row>
                <Row label="Valid Until" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => <span className="text-surface-700">{formatDateShort(r.validUntil)}</span>}
                </Row>
                <Row label="Submitted" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => <span className="text-surface-500">{formatDateShort(r.submittedAt)}</span>}
                </Row>
                <Row label="Line Items" responses={responses} bestId={bestValueSupplierId}>
                  {(r) =>
                    r.lineItems.length === 0 ? (
                      <span className="text-surface-400">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {r.lineItems.map((li, i) => (
                          <li key={i} className="text-xs text-surface-600 flex justify-between gap-2">
                            <span className="truncate">
                              {li.quantity}× {li.description}
                            </span>
                            <span className="tabular-nums shrink-0">{formatMoney(li.quantity * li.unitPriceCents)}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  }
                </Row>
                <Row label="Notes" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => <span className="text-surface-600 whitespace-pre-wrap">{r.notes ?? "—"}</span>}
                </Row>
                <Row label="Exclusions" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => <span className="text-surface-600 whitespace-pre-wrap">{r.exclusions ?? "—"}</span>}
                </Row>
                <Row label="Assumptions" responses={responses} bestId={bestValueSupplierId}>
                  {(r) => <span className="text-surface-600 whitespace-pre-wrap">{r.assumptions ?? "—"}</span>}
                </Row>
                <tr>
                  <td className="px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Award</td>
                  {responses.map((r) => (
                    <td key={r.id} className={"px-4 py-3 " + (r.supplierId === bestValueSupplierId ? "bg-warning-50/50" : "")}>
                      {r.supplierId === awardedSupplierId ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-success-700 bg-success-50 border border-success-200 rounded-md">
                          <Award className="w-3.5 h-3.5" strokeWidth={2} />
                          Awarded
                        </span>
                      ) : isAwarded ? (
                        <span className="text-xs text-surface-400">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAward(r)}
                          disabled={pending && awardingId === r.supplierId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 transition-colors disabled:opacity-50"
                        >
                          <Award className="w-3.5 h-3.5" strokeWidth={2} />
                          {pending && awardingId === r.supplierId ? "Awarding…" : "Award"}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  responses,
  bestId,
  children,
}: {
  label: string;
  responses: ComparisonResponse[];
  bestId: string | null;
  children: (r: ComparisonResponse) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="px-4 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider align-top whitespace-nowrap">
        {label}
      </td>
      {responses.map((r) => (
        <td key={r.id} className={"px-4 py-3 align-top " + (r.supplierId === bestId ? "bg-warning-50/50" : "")}>
          {children(r)}
        </td>
      ))}
    </tr>
  );
}
