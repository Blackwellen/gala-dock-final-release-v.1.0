"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  UtensilsCrossed,
  Users,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingStatusBadge } from "../../BookingStatusBadge";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_META,
  STAFF_ROLES,
  STAFF_ROLE_LABEL,
  formatDateTime,
  formatDate,
  formatTime,
  shiftHours,
} from "../../lib";
import {
  updateBookingStatus,
  deleteBooking,
  addFbSelection,
  removeFbSelection,
  addStaffAssignment,
  removeStaffAssignment,
} from "../../actions";

export interface BookingDetail {
  id: string;
  venueId: string;
  venueName: string;
  spaceId: string | null;
  spaceName: string | null;
  clientName: string;
  clientEmail: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  headcount: number | null;
  bookingValueCents: number;
  bookingValueLabel: string;
  hireFeeLabel: string;
  cateringTotalLabel: string;
  grandTotalLabel: string;
  notes: string | null;
}

export interface FbSelectionRow {
  id: string;
  packageId: string;
  packageName: string;
  perHeadLabel: string;
  quantity: number;
  covers: number;
  lineTotalLabel: string;
}

export interface PackageOption {
  id: string;
  name: string;
  perHeadLabel: string;
  minHeadcount: number | null;
}

export interface StaffMemberRow {
  id: string;
  staffName: string;
  role: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  notes: string | null;
}

const inputCls =
  "w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400";
const labelCls = "block text-xs font-medium text-surface-600 mb-1";

function PrimaryBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60 " +
        (props.className ?? "")
      }
    />
  );
}

function GhostBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-600 text-sm font-medium hover:border-surface-300 transition-colors " +
        (props.className ?? "")
      }
    />
  );
}

export function BookingDetailClient({
  booking,
  selections,
  packageOptions,
  staff,
}: {
  booking: BookingDetail;
  selections: FbSelectionRow[];
  packageOptions: PackageOption[];
  staff: StaffMemberRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [addingFb, setAddingFb] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);

  function setStatus(status: string) {
    start(async () => {
      await updateBookingStatus(booking.id, status);
    });
  }

  function remove() {
    if (!confirm("Delete this booking? This cannot be undone.")) return;
    start(async () => {
      await deleteBooking(booking.id);
    });
  }

  function submitFb(formData: FormData) {
    start(async () => {
      await addFbSelection(booking.id, formData);
      setAddingFb(false);
    });
  }

  function removeFb(id: string) {
    start(async () => {
      await removeFbSelection(booking.id, id);
    });
  }

  function submitStaff(formData: FormData) {
    start(async () => {
      await addStaffAssignment(booking.venueId, formData, booking.id);
      setAddingStaff(false);
    });
  }

  function removeStaff(id: string) {
    if (!confirm("Remove this staff assignment?")) return;
    start(async () => {
      await removeStaffAssignment(id, booking.venueId, booking.id);
    });
  }

  const totalStaffHours = staff.reduce(
    (sum, s) => sum + (shiftHours(s.shiftStart, s.shiftEnd) ?? 0),
    0
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={booking.clientName}
        description={`${booking.venueName}${booking.spaceName ? " · " + booking.spaceName : ""}`}
        actions={
          <button
            type="button"
            onClick={() => router.push(`/venue-management/${booking.venueId}`)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-800"
          >
            <ArrowLeft className="w-4 h-4" /> Back to venue
          </button>
        }
      />

      <div className="flex-1 px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status lifecycle */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-surface-800">Status</h2>
              <BookingStatusBadge status={booking.status} />
            </div>
            <div className="flex flex-wrap gap-2">
              {BOOKING_STATUSES.map((s) => {
                const isCurrent = booking.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={pending || isCurrent}
                    onClick={() => setStatus(s)}
                    className={
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:cursor-default " +
                      (isCurrent
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-surface-600 border-surface-200 hover:border-brand-300 hover:text-brand-600")
                    }
                  >
                    {BOOKING_STATUS_META[s].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Booking details */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-surface-800">Booking Details</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Detail label="Client" value={booking.clientName} />
              <Detail label="Email" value={booking.clientEmail ?? "—"} />
              <Detail label="Space" value={booking.spaceName ?? "—"} />
              <Detail label="Headcount" value={booking.headcount != null ? String(booking.headcount) : "—"} />
              <Detail label="Starts" value={formatDateTime(booking.startAt)} />
              <Detail label="Ends" value={formatDateTime(booking.endAt)} />
            </dl>
            {booking.notes && (
              <div>
                <p className={labelCls}>Notes</p>
                <p className="text-sm text-surface-700 whitespace-pre-wrap">{booking.notes}</p>
              </div>
            )}
          </div>

          {/* F&B selections */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-800">F&B Selections</h2>
              {!addingFb && packageOptions.length > 0 && (
                <PrimaryBtn onClick={() => setAddingFb(true)}>
                  <Plus className="w-4 h-4" /> Add
                </PrimaryBtn>
              )}
            </div>

            {addingFb && (
              <form action={submitFb} className="rounded-lg bg-surface-50 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Package</label>
                    <select name="package_id" required className={inputCls} defaultValue="">
                      <option value="" disabled>
                        Choose a package
                      </option>
                      {packageOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.perHeadLabel}/head
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Covers (defaults to headcount)</label>
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      defaultValue={booking.headcount ?? 1}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <PrimaryBtn type="submit" disabled={pending}>
                    Add selection
                  </PrimaryBtn>
                  <GhostBtn type="button" onClick={() => setAddingFb(false)}>
                    Cancel
                  </GhostBtn>
                </div>
              </form>
            )}

            {selections.length === 0 && !addingFb ? (
              packageOptions.length === 0 ? (
                <p className="text-sm text-surface-400 py-4">
                  No F&B packages defined for this venue yet. Add packages on the venue's F&B tab first.
                </p>
              ) : (
                <EmptyState
                  compact
                  icon={UtensilsCrossed}
                  title="No catering selected"
                  description="Attach an F&B package to build the catering total."
                />
              )
            ) : selections.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-surface-400 border-b border-surface-100">
                    <th className="py-2 font-medium">Package</th>
                    <th className="py-2 font-medium">Per head</th>
                    <th className="py-2 font-medium">Covers</th>
                    <th className="py-2 font-medium">Total</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {selections.map((sel) => (
                    <tr key={sel.id} className="border-b border-surface-50 last:border-0">
                      <td className="py-2.5 font-medium text-surface-800">{sel.packageName}</td>
                      <td className="py-2.5 text-surface-600">{sel.perHeadLabel}</td>
                      <td className="py-2.5 text-surface-600 tabular-nums">{sel.covers}</td>
                      <td className="py-2.5 font-medium text-surface-900 tabular-nums">
                        {sel.lineTotalLabel}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeFb(sel.id)}
                          className="p-1 rounded text-surface-400 hover:text-danger-600"
                          aria-label="Remove selection"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          {/* Staff */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-800">
                Assigned Staff
                {totalStaffHours > 0 && (
                  <span className="ml-2 text-xs font-normal text-surface-400">
                    {totalStaffHours} hrs
                  </span>
                )}
              </h2>
              {!addingStaff && (
                <PrimaryBtn onClick={() => setAddingStaff(true)}>
                  <Plus className="w-4 h-4" /> Add
                </PrimaryBtn>
              )}
            </div>

            {addingStaff && (
              <form action={submitStaff} className="rounded-lg bg-surface-50 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Staff name *</label>
                    <input name="staff_name" required className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Role</label>
                    <select name="role" className={inputCls} defaultValue="other">
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {STAFF_ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Shift date</label>
                    <input name="shift_date" type="date" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Start</label>
                      <input name="shift_start_time" type="time" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>End</label>
                      <input name="shift_end_time" type="time" className={inputCls} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <PrimaryBtn type="submit" disabled={pending}>
                    Add staff
                  </PrimaryBtn>
                  <GhostBtn type="button" onClick={() => setAddingStaff(false)}>
                    Cancel
                  </GhostBtn>
                </div>
              </form>
            )}

            {staff.length === 0 && !addingStaff ? (
              <EmptyState
                compact
                icon={Users}
                title="No staff assigned"
                description="Schedule venue staff for this booking with shift times."
              />
            ) : staff.length > 0 ? (
              <div className="divide-y divide-surface-100">
                {staff.map((s) => {
                  const hrs = shiftHours(s.shiftStart, s.shiftEnd);
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-surface-800">{s.staffName}</p>
                        <p className="text-xs text-surface-500">
                          {s.role ? STAFF_ROLE_LABEL[s.role] ?? s.role : "—"}
                          {s.shiftStart
                            ? ` · ${formatDate(s.shiftStart)} ${formatTime(s.shiftStart)}–${formatTime(s.shiftEnd)}`
                            : ""}
                          {hrs != null ? ` · ${hrs} hrs` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStaff(s.id)}
                        className="p-1.5 rounded-md text-surface-400 hover:text-danger-600 hover:bg-surface-50"
                        aria-label="Remove staff"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          {/* BEO-style summary */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-surface-800">Event Order Summary</h2>
            </div>
            <dl className="space-y-2 text-sm">
              <SummaryRow label="Venue" value={booking.venueName} />
              <SummaryRow label="Space" value={booking.spaceName ?? "—"} />
              <SummaryRow label="Event date" value={formatDate(booking.startAt)} />
              <SummaryRow
                label="Service window"
                value={
                  booking.startAt
                    ? `${formatTime(booking.startAt)}–${formatTime(booking.endAt)}`
                    : "—"
                }
              />
              <SummaryRow
                label="Headcount"
                value={booking.headcount != null ? String(booking.headcount) : "—"}
              />
              <SummaryRow label="Staff assigned" value={String(staff.length)} />
            </dl>
            <hr className="border-surface-100" />
            <dl className="space-y-2 text-sm">
              <SummaryRow label="Hire fee (space)" value={booking.hireFeeLabel} />
              <SummaryRow label="Booking value" value={booking.bookingValueLabel} />
              <SummaryRow label="Catering total" value={booking.cateringTotalLabel} />
              <div className="flex items-center justify-between pt-1">
                <dt className="text-sm font-semibold text-surface-900">Grand total</dt>
                <dd className="text-base font-bold text-surface-900 tabular-nums">
                  {booking.grandTotalLabel}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-surface-400">
              Booking value + catering. Hire fee shown for reference.
            </p>
          </div>

          {/* Danger zone */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-2 text-sm font-medium text-danger-600 hover:text-danger-700 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" /> Delete booking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-surface-400">{label}</dt>
      <dd className="text-sm text-surface-800 mt-0.5">{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-surface-500">{label}</dt>
      <dd className="text-surface-800 font-medium text-right">{value}</dd>
    </div>
  );
}
