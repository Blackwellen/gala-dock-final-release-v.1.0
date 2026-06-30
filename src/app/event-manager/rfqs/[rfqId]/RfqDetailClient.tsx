"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  CalendarClock,
  Columns3,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabNav } from "@/components/ui/TabNav";
import {
  RECIPIENT_STATUS_LABELS,
  rfqBadgeStatus,
  recipientBadgeStatus,
  formatMoney,
  formatDateShort,
} from "../lib";
import {
  updateRecipientResponse,
  awardRfq,
  deleteRfq,
} from "../actions";

export interface RfqDetail {
  id: string;
  title: string;
  scope: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  eventId: string | null;
  eventName: string | null;
}

export interface RecipientRow {
  id: string;
  supplierId: string;
  supplierName: string;
  status: string;
  quoteCents: number | null;
  notes: string | null;
  respondedAt: string | null;
}

export function RfqDetailClient({
  rfq,
  recipients,
}: {
  rfq: RfqDetail;
  recipients: RecipientRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<RecipientRow | null>(null);

  const responded = recipients.filter(
    (r) => r.quoteCents !== null && (r.status === "responded" || r.status === "accepted")
  );
  const hasComparison = responded.length >= 2;

  const [tab, setTab] = useState<"responses" | "compare">("responses");

  // Best value = lowest quote among responded recipients.
  const bestValueId = useMemo(() => {
    const withQuotes = recipients.filter((r) => r.quoteCents !== null);
    if (withQuotes.length === 0) return null;
    return withQuotes.reduce((best, r) =>
      (r.quoteCents ?? Infinity) < (best.quoteCents ?? Infinity) ? r : best
    ).id;
  }, [recipients]);

  function handleAward(recipientId: string) {
    if (!confirm("Award this RFQ to this supplier? All other recipients will be marked rejected.")) {
      return;
    }
    startTransition(async () => {
      try {
        await awardRfq(rfq.id, recipientId);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not award RFQ");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this RFQ? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await deleteRfq(rfq.id);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not delete RFQ");
      }
    });
  }

  const isAwarded = rfq.status === "awarded";

  const tabs = [
    { id: "responses", label: "Responses", count: recipients.length },
    ...(hasComparison ? [{ id: "compare", label: "Compare" }] : []),
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={rfq.title}
        description={rfq.eventName ? `For ${rfq.eventName}` : undefined}
        actions={
          <>
            <Link
              href="/event-manager/rfqs"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
              Back
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-danger-600 border border-surface-200 rounded-lg hover:bg-danger-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.8} />
              Delete
            </button>
          </>
        }
      />

      <div className="p-6 max-w-[1400px] grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* RFQ info card */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                Status
              </span>
              <StatusBadge status={rfqBadgeStatus(rfq.status) as never} />
            </div>
            <Field label="Scope">
              <p className="text-sm text-surface-700 whitespace-pre-wrap">
                {rfq.scope ?? "—"}
              </p>
            </Field>
            <Field label="Deadline">
              <span className="inline-flex items-center gap-1.5 text-sm text-surface-700">
                <CalendarClock className="w-4 h-4 text-surface-400" strokeWidth={1.8} />
                {formatDateShort(rfq.dueDate)}
              </span>
            </Field>
            <Field label="Created">
              <span className="text-sm text-surface-700">{formatDateShort(rfq.createdAt)}</span>
            </Field>
            {rfq.eventId && rfq.eventName && (
              <Field label="Event">
                <Link
                  href={`/event-manager/events/${rfq.eventId}`}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  {rfq.eventName}
                </Link>
              </Field>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="lg:col-span-2 space-y-4">
          {recipients.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState
                icon={Columns3}
                title="No recipients"
                description="This RFQ has no supplier recipients."
                compact
              />
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                <div className="border-b border-surface-200 px-2">
                  <TabNav tabs={tabs} active={tab} onChange={(id) => setTab(id as typeof tab)} />
                </div>

                {tab === "responses" ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 bg-surface-50">
                        <Th>Supplier</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Quote</Th>
                        <Th className="hidden md:table-cell">Responded</Th>
                        <th className="px-4 py-3 w-24" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {recipients.map((r) => (
                        <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-surface-900">{r.supplierName}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={recipientBadgeStatus(r.status) as never} />
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-surface-800">
                            {formatMoney(r.quoteCents)}
                          </td>
                          <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell whitespace-nowrap">
                            {formatDateShort(r.respondedAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setEditing(r)}
                                className="p-1.5 text-surface-400 hover:text-brand-600 rounded-md hover:bg-surface-100 transition-colors"
                                aria-label="Log response"
                              >
                                <Pencil className="w-4 h-4" strokeWidth={1.8} />
                              </button>
                              {!isAwarded && (
                                <button
                                  type="button"
                                  onClick={() => handleAward(r.id)}
                                  className="p-1.5 text-surface-400 hover:text-success-600 rounded-md hover:bg-surface-100 transition-colors"
                                  aria-label="Award"
                                >
                                  <Award className="w-4 h-4" strokeWidth={1.8} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <ComparisonMatrix
                    recipients={recipients}
                    bestValueId={bestValueId}
                    isAwarded={isAwarded}
                    onAward={handleAward}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {editing && (
        <ResponseModal
          rfqId={rfq.id}
          recipient={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ComparisonMatrix({
  recipients,
  bestValueId,
  isAwarded,
  onAward,
}: {
  recipients: RecipientRow[];
  bestValueId: string | null;
  isAwarded: boolean;
  onAward: (id: string) => void;
}) {
  const bestName =
    recipients.find((r) => r.id === bestValueId)?.supplierName ?? null;

  return (
    <div className="p-4 space-y-4 overflow-x-auto">
      {bestName && (
        <div className="flex items-center gap-2 rounded-lg bg-warning-50 border border-warning-200 px-3 py-2 text-sm text-warning-700">
          <Sparkles className="w-4 h-4 shrink-0" strokeWidth={1.8} />
          Best value: <strong>{bestName}</strong> at{" "}
          {formatMoney(recipients.find((r) => r.id === bestValueId)?.quoteCents ?? null)}
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider" />
            {recipients.map((r) => (
              <th
                key={r.id}
                className={
                  "px-3 py-2 text-left text-sm font-semibold text-surface-900 align-bottom " +
                  (r.id === bestValueId ? "bg-warning-50" : "")
                }
              >
                {r.supplierName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          <MatrixRow label="Quote" recipients={recipients} bestValueId={bestValueId}>
            {(r) => (
              <span className="tabular-nums font-medium text-surface-800">
                {formatMoney(r.quoteCents)}
              </span>
            )}
          </MatrixRow>
          <MatrixRow label="Status" recipients={recipients} bestValueId={bestValueId}>
            {(r) => <StatusBadge status={recipientBadgeStatus(r.status) as never} />}
          </MatrixRow>
          <MatrixRow label="Responded" recipients={recipients} bestValueId={bestValueId}>
            {(r) => <span className="text-surface-600">{formatDateShort(r.respondedAt)}</span>}
          </MatrixRow>
          <MatrixRow label="Notes" recipients={recipients} bestValueId={bestValueId}>
            {(r) => (
              <span className="text-surface-600 whitespace-pre-wrap">{r.notes ?? "—"}</span>
            )}
          </MatrixRow>
          <tr>
            <td className="px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Award
            </td>
            {recipients.map((r) => (
              <td
                key={r.id}
                className={"px-3 py-3 " + (r.id === bestValueId ? "bg-warning-50/50" : "")}
              >
                {r.status === "accepted" ? (
                  <StatusBadge status="accepted" />
                ) : isAwarded ? (
                  <span className="text-xs text-surface-400">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAward(r.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 transition-colors"
                  >
                    <Award className="w-3.5 h-3.5" strokeWidth={2} />
                    Award
                  </button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MatrixRow({
  label,
  recipients,
  bestValueId,
  children,
}: {
  label: string;
  recipients: RecipientRow[];
  bestValueId: string | null;
  children: (r: RecipientRow) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="px-3 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider align-top whitespace-nowrap">
        {label}
      </td>
      {recipients.map((r) => (
        <td
          key={r.id}
          className={"px-3 py-3 align-top " + (r.id === bestValueId ? "bg-warning-50/50" : "")}
        >
          {children(r)}
        </td>
      ))}
    </tr>
  );
}

function ResponseModal({
  rfqId,
  recipient,
  onClose,
  onSaved,
}: {
  rfqId: string;
  recipient: RecipientRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full px-3 py-2 text-sm text-surface-900 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-surface-400";

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateRecipientResponse(rfqId, recipient.id, formData);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save response");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40">
      <div className="bg-white rounded-xl shadow-xl border border-surface-200 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold text-surface-900">
            Log response — {recipient.supplierName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-surface-400 hover:text-surface-700 rounded-md hover:bg-surface-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
        <form action={onSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={recipient.status === "pending" || recipient.status === "viewed" ? "responded" : recipient.status}
              className={inputCls}
            >
              <option value="responded">{RECIPIENT_STATUS_LABELS.responded}</option>
              <option value="declined">{RECIPIENT_STATUS_LABELS.declined}</option>
              <option value="viewed">{RECIPIENT_STATUS_LABELS.viewed}</option>
              <option value="pending">{RECIPIENT_STATUS_LABELS.pending}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="quote_amount">
              Quote Amount (£)
            </label>
            <input
              id="quote_amount"
              name="quote_amount"
              type="text"
              inputMode="decimal"
              defaultValue={recipient.quoteCents !== null ? (recipient.quoteCents / 100).toString() : ""}
              placeholder="0.00"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={recipient.notes ?? ""}
              placeholder="Inclusions, terms, caveats…"
              className={inputCls}
            />
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save Response"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={
        "px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider " +
        (className ?? "")
      }
    >
      {children}
    </th>
  );
}
