"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Star,
  CalendarX2,
  FileText,
  Download,
  Tag,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabNav } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDateShort } from "@/app/event-manager/rfqs/lib";
import {
  addRateCard,
  deleteRateCard,
  addBlockedDate,
  deleteBlockedDate,
  addRating,
  deleteRating,
  addContract,
  deleteContract,
  getContractUrl,
} from "./actions";

export interface ManageSupplier {
  id: string;
  name: string;
  status: string;
  category: string | null;
}
export interface RateCardRow {
  id: string;
  itemName: string;
  unit: string | null;
  unitPriceCents: number;
  currency: string;
  notes: string | null;
}
export interface BlockedDateRow {
  id: string;
  date: string;
  reason: string | null;
}
export interface RatingRow {
  id: string;
  rating: number;
  review: string | null;
  eventName: string | null;
  createdAt: string;
}
export interface ContractRow {
  id: string;
  title: string;
  status: string;
  hasFile: boolean;
  valueCents: number | null;
  signedAt: string | null;
  expiresAt: string | null;
  eventName: string | null;
}
export interface EventOption {
  id: string;
  name: string;
}

type TabId = "rates" | "availability" | "ratings" | "contracts";

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-surface-400";
const labelCls = "block text-sm font-medium text-surface-700 mb-1.5";
const primaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50";

export function SupplierManageClient({
  supplier,
  rateCards,
  blockedDates,
  ratings,
  contracts,
  events,
}: {
  supplier: ManageSupplier;
  rateCards: RateCardRow[];
  blockedDates: BlockedDateRow[];
  ratings: RatingRow[];
  contracts: ContractRow[];
  events: EventOption[];
}) {
  const [tab, setTab] = useState<TabId>("rates");

  const avgRating = useMemo(() => {
    if (ratings.length === 0) return null;
    const sum = ratings.reduce((s, r) => s + r.rating, 0);
    return sum / ratings.length;
  }, [ratings]);

  const tabs = [
    { id: "rates", label: "Rate Cards", count: rateCards.length },
    { id: "availability", label: "Availability", count: blockedDates.length },
    { id: "ratings", label: "Ratings", count: ratings.length },
    { id: "contracts", label: "Contracts", count: contracts.length },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={supplier.name}
        description="Supplier management — rate cards, availability, ratings, and contracts"
        actions={
          <Link
            href={`/event-manager/suppliers/${supplier.id}`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
            Supplier
          </Link>
        }
        tabs={<TabNav tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />}
      />

      <div className="p-6 max-w-[1100px] space-y-6">
        {tab === "rates" && <RateCardsTab supplierId={supplier.id} rateCards={rateCards} />}
        {tab === "availability" && (
          <AvailabilityTab supplierId={supplier.id} blockedDates={blockedDates} />
        )}
        {tab === "ratings" && (
          <RatingsTab
            supplierId={supplier.id}
            ratings={ratings}
            events={events}
            avgRating={avgRating}
          />
        )}
        {tab === "contracts" && (
          <ContractsTab supplierId={supplier.id} contracts={contracts} events={events} />
        )}
      </div>
    </div>
  );
}

// ── Rate Cards ─────────────────────────────────────────────────────────────────

function RateCardsTab({
  supplierId,
  rateCards,
}: {
  supplierId: string;
  rateCards: RateCardRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addRateCard(supplierId, formData);
        setShowForm(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add rate");
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this rate?")) return;
    startTransition(async () => {
      try {
        await deleteRateCard(supplierId, id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not delete rate");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-surface-900">Rate Cards</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className={primaryBtn}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Rate
        </button>
      </div>

      {showForm && (
        <form
          action={onAdd}
          className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="item_name">
                Service / Item <span className="text-danger-500">*</span>
              </label>
              <input id="item_name" name="item_name" required placeholder="Three-Course Formal Dinner" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="unit">Unit</label>
              <input id="unit" name="unit" placeholder="per head" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="unit_price">Unit Price (£)</label>
              <input id="unit_price" name="unit_price" inputMode="decimal" placeholder="52.00" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="notes">Notes</label>
              <input id="notes" name="notes" placeholder="Optional" className={inputCls} />
            </div>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" className={primaryBtn}>Save Rate</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        {rateCards.length === 0 ? (
          <EmptyState icon={Tag} title="No rate cards yet" description="Add predefined service pricing so quotes populate automatically." compact />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <Th>Service</Th>
                <Th className="hidden sm:table-cell">Unit</Th>
                <Th className="text-right">Price</Th>
                <Th className="hidden md:table-cell">Notes</Th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {rateCards.map((r) => (
                <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-surface-900">{r.itemName}</td>
                  <td className="px-4 py-3.5 text-surface-500 hidden sm:table-cell">{r.unit ?? "—"}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-surface-800">{formatMoney(r.unitPriceCents)}</td>
                  <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{r.notes ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    <DeleteBtn onClick={() => onDelete(r.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Availability ───────────────────────────────────────────────────────────────

function AvailabilityTab({
  supplierId,
  blockedDates,
}: {
  supplierId: string;
  blockedDates: BlockedDateRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addBlockedDate(supplierId, formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not block date");
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteBlockedDate(supplierId, id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not remove block");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-surface-900">Availability</h2>
      <p className="text-sm text-surface-500">
        Blocking dates here helps you avoid conflicts when assigning suppliers to events.
      </p>

      <form
        action={onAdd}
        className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex flex-col sm:flex-row sm:items-end gap-4"
      >
        <div className="sm:w-48">
          <label className={labelCls} htmlFor="blocked_date">
            Unavailable Date <span className="text-danger-500">*</span>
          </label>
          <input id="blocked_date" name="blocked_date" type="date" required className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={labelCls} htmlFor="reason">Reason</label>
          <input id="reason" name="reason" placeholder="e.g. Already booked" className={inputCls} />
        </div>
        <button type="submit" className={primaryBtn}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Block Date
        </button>
      </form>
      {error && <p className="text-sm text-danger-600">{error}</p>}

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        {blockedDates.length === 0 ? (
          <EmptyState icon={CalendarX2} title="No blocked dates" description="This supplier is currently available on all dates." compact />
        ) : (
          <ul className="divide-y divide-surface-100">
            {blockedDates.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-danger-50 text-danger-600">
                    <CalendarX2 className="w-4 h-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-surface-900">{formatDateShort(b.date)}</p>
                    {b.reason && <p className="text-xs text-surface-500">{b.reason}</p>}
                  </div>
                </div>
                <DeleteBtn onClick={() => onDelete(b.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Ratings ────────────────────────────────────────────────────────────────────

function RatingsTab({
  supplierId,
  ratings,
  events,
  avgRating,
}: {
  supplierId: string;
  ratings: RatingRow[];
  events: EventOption[];
  avgRating: number | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addRating(supplierId, formData);
        setShowForm(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add rating");
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this rating?")) return;
    startTransition(async () => {
      try {
        await deleteRating(supplierId, id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not delete rating");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-surface-900">Ratings</h2>
          {avgRating !== null && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning-50 border border-warning-200 text-sm font-semibold text-warning-700">
              <Star className="w-4 h-4 fill-current" strokeWidth={0} />
              {avgRating.toFixed(1)}
              <span className="text-xs font-normal text-warning-600">avg ({ratings.length})</span>
            </span>
          )}
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)} className={primaryBtn}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Rating
        </button>
      </div>

      {showForm && (
        <form action={onAdd} className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="rating">
                Rating (1–5) <span className="text-danger-500">*</span>
              </label>
              <select id="rating" name="rating" required defaultValue="5" className={inputCls}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="event_id">Event</label>
              <select id="event_id" name="event_id" defaultValue="" className={inputCls}>
                <option value="">No linked event</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="review">Review</label>
              <textarea id="review" name="review" rows={3} placeholder="How did they perform?" className={inputCls} />
            </div>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" className={primaryBtn}>Save Rating</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900">Cancel</button>
          </div>
        </form>
      )}

      {ratings.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState icon={Star} title="No ratings yet" description="Rate this supplier after an event to build a performance history." compact />
        </div>
      ) : (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={
                          "w-4 h-4 " +
                          (i < r.rating ? "text-warning-500 fill-current" : "text-surface-200 fill-current")
                        }
                        strokeWidth={0}
                      />
                    ))}
                  </div>
                  {r.review && <p className="mt-2 text-sm text-surface-700 whitespace-pre-wrap">{r.review}</p>}
                  <p className="mt-2 text-xs text-surface-400">
                    {r.eventName ? `${r.eventName} · ` : ""}
                    {formatDateShort(r.createdAt)}
                  </p>
                </div>
                <DeleteBtn onClick={() => onDelete(r.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contracts ──────────────────────────────────────────────────────────────────

function ContractsTab({
  supplierId,
  contracts,
  events,
}: {
  supplierId: string;
  contracts: ContractRow[];
  events: EventOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function onAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addContract(supplierId, formData);
        setShowForm(false);
        setFileName(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add contract");
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this contract?")) return;
    startTransition(async () => {
      try {
        await deleteContract(supplierId, id);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not delete contract");
      }
    });
  }

  function onDownload(id: string) {
    startTransition(async () => {
      try {
        const url = await getContractUrl(supplierId, id);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not open file");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-surface-900">Contracts</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className={primaryBtn}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Contract
        </button>
      </div>

      {showForm && (
        <form action={onAdd} className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="title">
                Title <span className="text-danger-500">*</span>
              </label>
              <input id="title" name="title" required placeholder="Catering Services Agreement" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue="draft" className={inputCls}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="signed">Signed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="value">Value (£)</label>
              <input id="value" name="value" inputMode="decimal" placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="signed_at">Signed Date</label>
              <input id="signed_at" name="signed_at" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="expires_at">Expires</label>
              <input id="expires_at" name="expires_at" type="date" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="event_id">Event</label>
              <select id="event_id" name="event_id" defaultValue="" className={inputCls}>
                <option value="">No linked event</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <span className={labelCls}>Contract File (optional)</span>
              <label className="flex items-center gap-3 px-3 py-2 border border-dashed border-surface-300 rounded-lg cursor-pointer hover:bg-surface-50 transition-colors">
                <Download className="w-4 h-4 text-surface-400 rotate-180" strokeWidth={1.8} />
                <span className="text-sm text-surface-600">
                  {fileName ?? "Choose a file to upload…"}
                </span>
                <input
                  type="file"
                  name="file"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" className={primaryBtn}>Save Contract</button>
            <button type="button" onClick={() => { setShowForm(false); setFileName(null); }} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        {contracts.length === 0 ? (
          <EmptyState icon={FileText} title="No contracts yet" description="Track signed agreements, values, and expiry dates here." compact />
        ) : (
          <ul className="divide-y divide-surface-100">
            {contracts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-surface-900 truncate">{c.title}</p>
                    <StatusBadge status={c.status as never} />
                  </div>
                  <p className="mt-0.5 text-xs text-surface-500">
                    {c.eventName ? `${c.eventName} · ` : ""}
                    {c.valueCents !== null ? `${formatMoney(c.valueCents)} · ` : ""}
                    {c.signedAt ? `Signed ${formatDateShort(c.signedAt)}` : "Unsigned"}
                    {c.expiresAt ? ` · Expires ${formatDateShort(c.expiresAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.hasFile && (
                    <button
                      type="button"
                      onClick={() => onDownload(c.id)}
                      className="p-1.5 text-surface-400 hover:text-brand-600 rounded-md hover:bg-surface-100 transition-colors"
                      aria-label="Download file"
                    >
                      <Download className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  )}
                  <DeleteBtn onClick={() => onDelete(c.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────────

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 text-surface-400 hover:text-danger-600 rounded-md hover:bg-surface-100 transition-colors"
      aria-label="Delete"
    >
      <Trash2 className="w-4 h-4" strokeWidth={1.8} />
    </button>
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
