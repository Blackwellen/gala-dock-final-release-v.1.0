"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  CalendarRange,
  UtensilsCrossed,
  Users,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BookingStatusBadge } from "../BookingStatusBadge";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_META,
  STAFF_ROLES,
  STAFF_ROLE_LABEL,
  formatDate,
  formatTime,
  dateKey,
  shiftHours,
} from "../lib";
import {
  createSpace,
  updateSpace,
  deleteSpace,
  createBooking,
  createFbPackage,
  updateFbPackage,
  deleteFbPackage,
  addStaffAssignment,
  removeStaffAssignment,
} from "../actions";

export interface SpaceRow {
  id: string;
  name: string;
  description: string | null;
  capacitySeated: number | null;
  capacityStanding: number | null;
  areaSqm: number | null;
  hireFeeCents: number | null;
  hireFeeLabel: string;
  sortOrder: number;
}

export interface BookingRow {
  id: string;
  spaceId: string | null;
  spaceName: string;
  clientName: string;
  clientEmail: string | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
  headcount: number | null;
  totalCents: number;
  totalLabel: string;
}

export interface FbPackageRow {
  id: string;
  name: string;
  description: string | null;
  perHeadCents: number;
  perHeadLabel: string;
  minHeadcount: number | null;
  sortOrder: number;
}

export interface StaffRow {
  id: string;
  bookingId: string | null;
  bookingClient: string | null;
  staffName: string;
  role: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  notes: string | null;
}

const TABS = [
  { id: "spaces", label: "Spaces" },
  { id: "bookings", label: "Bookings" },
  { id: "fb", label: "F&B Packages" },
  { id: "availability", label: "Availability" },
  { id: "staff", label: "Staff" },
];

// ── Small shared field helpers ───────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400";
const labelCls = "block text-xs font-medium text-surface-600 mb-1";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

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

// ── Main client ──────────────────────────────────────────────────────────────

export function VenueWorkspaceClient({
  venueId,
  venueName,
  venueLocation,
  venueStatus,
  spaces,
  bookings,
  packages,
  staff,
}: {
  venueId: string;
  venueName: string;
  venueLocation: string;
  venueStatus: string;
  spaces: SpaceRow[];
  bookings: BookingRow[];
  packages: FbPackageRow[];
  staff: StaffRow[];
}) {
  const router = useRouter();
  const [active, setActive] = useState("spaces");

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={venueName}
        description={venueLocation}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={venueStatus as never} />
            <button
              type="button"
              onClick={() => router.push("/venue-management")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-800"
            >
              <ArrowLeft className="w-4 h-4" /> All venues
            </button>
          </div>
        }
        tabs={
          <TabNav
            tabs={TABS.map((t) => ({
              ...t,
              count:
                t.id === "spaces"
                  ? spaces.length
                  : t.id === "bookings"
                  ? bookings.length
                  : t.id === "fb"
                  ? packages.length
                  : t.id === "staff"
                  ? staff.length
                  : undefined,
            }))}
            active={active}
            onChange={setActive}
          />
        }
      />

      <div className="flex-1 px-6 py-6">
        {active === "spaces" && <SpacesTab venueId={venueId} spaces={spaces} />}
        {active === "bookings" && (
          <BookingsTab venueId={venueId} spaces={spaces} bookings={bookings} />
        )}
        {active === "fb" && <FbTab venueId={venueId} packages={packages} />}
        {active === "availability" && <AvailabilityTab bookings={bookings} />}
        {active === "staff" && (
          <StaffTab venueId={venueId} staff={staff} bookings={bookings} />
        )}
      </div>
    </div>
  );
}

// ── Spaces tab ───────────────────────────────────────────────────────────────

function SpacesTab({ venueId, spaces }: { venueId: string; spaces: SpaceRow[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<SpaceRow | null>(null);
  const [creating, setCreating] = useState(false);

  function submit(formData: FormData) {
    start(async () => {
      if (editing) await updateSpace(venueId, editing.id, formData);
      else await createSpace(venueId, formData);
      setEditing(null);
      setCreating(false);
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this space? This cannot be undone.")) return;
    start(async () => {
      await deleteSpace(venueId, id);
    });
  }

  const showForm = creating || editing !== null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-surface-800">Bookable Spaces</h2>
        {!showForm && (
          <PrimaryBtn onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> Add Space
          </PrimaryBtn>
        )}
      </div>

      {showForm && (
        <form
          action={submit}
          className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name *">
              <input name="name" required defaultValue={editing?.name ?? ""} className={inputCls} />
            </Field>
            <Field label="Hire fee (£)">
              <input
                name="hire_fee"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing?.hireFeeCents != null ? editing.hireFeeCents / 100 : ""}
                className={inputCls}
              />
            </Field>
            <Field label="Seated capacity">
              <input
                name="capacity_seated"
                type="number"
                min="0"
                defaultValue={editing?.capacitySeated ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Standing capacity">
              <input
                name="capacity_standing"
                type="number"
                min="0"
                defaultValue={editing?.capacityStanding ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Area (m²)">
              <input
                name="area_sqm"
                type="number"
                step="0.1"
                min="0"
                defaultValue={editing?.areaSqm ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Sort order">
              <input
                name="sort_order"
                type="number"
                defaultValue={editing?.sortOrder ?? 0}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description ?? ""}
              className={inputCls}
            />
          </Field>
          <div className="flex gap-2">
            <PrimaryBtn type="submit" disabled={pending}>
              {editing ? "Save changes" : "Create space"}
            </PrimaryBtn>
            <GhostBtn
              type="button"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </GhostBtn>
          </div>
        </form>
      )}

      {spaces.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={Layers}
            title="No spaces yet"
            description="Add the bookable spaces in this venue — ballrooms, terraces, suites — with their capacities and hire fees."
            action={
              <PrimaryBtn onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> Add Space
              </PrimaryBtn>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {spaces.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-surface-900">{s.name}</h3>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="p-1.5 rounded-md text-surface-400 hover:text-brand-600 hover:bg-surface-50"
                    aria-label="Edit space"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="p-1.5 rounded-md text-surface-400 hover:text-danger-600 hover:bg-surface-50"
                    aria-label="Delete space"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {s.description && (
                <p className="text-xs text-surface-500 line-clamp-2">{s.description}</p>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {s.capacitySeated != null && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600">
                    {s.capacitySeated} seated
                  </span>
                )}
                {s.capacityStanding != null && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600">
                    {s.capacityStanding} standing
                  </span>
                )}
                {s.areaSqm != null && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600">
                    {s.areaSqm} m²
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-surface-900">{s.hireFeeLabel}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bookings tab ─────────────────────────────────────────────────────────────

function BookingsTab({
  venueId,
  spaces,
  bookings,
}: {
  venueId: string;
  spaces: SpaceRow[];
  bookings: BookingRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);

  function submit(formData: FormData) {
    start(async () => {
      await createBooking(venueId, formData);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-surface-800">Bookings</h2>
        {!creating && (
          <PrimaryBtn onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> New Booking
          </PrimaryBtn>
        )}
      </div>

      {creating && (
        <form
          action={submit}
          className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client name *">
              <input name="client_name" required className={inputCls} />
            </Field>
            <Field label="Client email">
              <input name="client_email" type="email" className={inputCls} />
            </Field>
            <Field label="Space">
              <select name="space_id" className={inputCls} defaultValue="">
                <option value="">— No space —</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" className={inputCls} defaultValue="enquiry">
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BOOKING_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <input name="start_date" type="date" className={inputCls} />
            </Field>
            <Field label="Start time">
              <input name="start_time" type="time" className={inputCls} />
            </Field>
            <Field label="End date">
              <input name="end_date" type="date" className={inputCls} />
            </Field>
            <Field label="End time">
              <input name="end_time" type="time" className={inputCls} />
            </Field>
            <Field label="Headcount">
              <input name="headcount" type="number" min="0" className={inputCls} />
            </Field>
            <Field label="Total value (£)">
              <input name="total" type="number" step="0.01" min="0" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={inputCls} />
          </Field>
          <div className="flex gap-2">
            <PrimaryBtn type="submit" disabled={pending}>
              Create booking
            </PrimaryBtn>
            <GhostBtn type="button" onClick={() => setCreating(false)}>
              Cancel
            </GhostBtn>
          </div>
        </form>
      )}

      {bookings.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={CalendarRange}
            title="No bookings yet"
            description="Log enquiries and bookings against this venue. Track them through the lifecycle from enquiry to completed."
            action={
              <PrimaryBtn onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> New Booking
              </PrimaryBtn>
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Space</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Guests</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => router.push(`/venue-management/bookings/${b.id}`)}
                  className="border-b border-surface-100 last:border-0 hover:bg-surface-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-surface-900">{b.clientName}</p>
                    {b.clientEmail && (
                      <p className="text-xs text-surface-400">{b.clientEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-surface-600">{b.spaceName}</td>
                  <td className="px-4 py-3 text-surface-600">{formatDate(b.startAt)}</td>
                  <td className="px-4 py-3 text-surface-600 tabular-nums">
                    {b.headcount ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-surface-900 font-medium tabular-nums">
                    {b.totalLabel}
                  </td>
                  <td className="px-4 py-3">
                    <BookingStatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── F&B tab ──────────────────────────────────────────────────────────────────

function FbTab({ venueId, packages }: { venueId: string; packages: FbPackageRow[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<FbPackageRow | null>(null);
  const [creating, setCreating] = useState(false);

  function submit(formData: FormData) {
    start(async () => {
      if (editing) await updateFbPackage(venueId, editing.id, formData);
      else await createFbPackage(venueId, formData);
      setEditing(null);
      setCreating(false);
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this package?")) return;
    start(async () => {
      await deleteFbPackage(venueId, id);
    });
  }

  const showForm = creating || editing !== null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-surface-800">F&B Packages</h2>
        {!showForm && (
          <PrimaryBtn onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> Add Package
          </PrimaryBtn>
        )}
      </div>

      {showForm && (
        <form
          action={submit}
          className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name *">
              <input name="name" required defaultValue={editing?.name ?? ""} className={inputCls} />
            </Field>
            <Field label="Per head (£)">
              <input
                name="per_head"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing ? editing.perHeadCents / 100 : ""}
                className={inputCls}
              />
            </Field>
            <Field label="Minimum headcount">
              <input
                name="min_headcount"
                type="number"
                min="0"
                defaultValue={editing?.minHeadcount ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Sort order">
              <input
                name="sort_order"
                type="number"
                defaultValue={editing?.sortOrder ?? 0}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description ?? ""}
              className={inputCls}
            />
          </Field>
          <div className="flex gap-2">
            <PrimaryBtn type="submit" disabled={pending}>
              {editing ? "Save changes" : "Create package"}
            </PrimaryBtn>
            <GhostBtn
              type="button"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </GhostBtn>
          </div>
        </form>
      )}

      {packages.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={UtensilsCrossed}
            title="No F&B packages yet"
            description="Define catering packages with per-head pricing. Attach them to bookings to build the catering total."
            action={
              <PrimaryBtn onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> Add Package
              </PrimaryBtn>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-surface-900">{p.name}</h3>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="p-1.5 rounded-md text-surface-400 hover:text-brand-600 hover:bg-surface-50"
                    aria-label="Edit package"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="p-1.5 rounded-md text-surface-400 hover:text-danger-600 hover:bg-surface-50"
                    aria-label="Delete package"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {p.description && (
                <p className="text-xs text-surface-500 line-clamp-2">{p.description}</p>
              )}
              <div className="flex items-end justify-between">
                <p className="text-lg font-bold text-surface-900">
                  {p.perHeadLabel}
                  <span className="text-xs font-normal text-surface-400"> / head</span>
                </p>
                {p.minHeadcount != null && (
                  <span className="text-xs text-surface-500">min {p.minHeadcount}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Availability tab (calendar) ──────────────────────────────────────────────

function AvailabilityTab({ bookings }: { bookings: BookingRow[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  const byDay = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const key = dateKey(b.startAt);
    if (!key) continue;
    const arr = byDay.get(key) ?? [];
    arr.push(b);
    byDay.set(key, arr);
  }

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthLabel = firstOfMonth.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function move(delta: number) {
    setCursor((c) => {
      const m = c.month + delta;
      const year = c.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-surface-800">{monthLabel}</h2>
        <div className="flex gap-2">
          <GhostBtn type="button" onClick={() => move(-1)}>
            Previous
          </GhostBtn>
          <GhostBtn
            type="button"
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
          >
            Today
          </GhostBtn>
          <GhostBtn type="button" onClick={() => move(1)}>
            Next
          </GhostBtn>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-surface-200 text-center text-xs font-medium uppercase tracking-wider text-surface-400">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null)
              return <div key={`e${i}`} className="min-h-[92px] border-b border-r border-surface-100 bg-surface-50/40" />;
            const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayBookings = byDay.get(key) ?? [];
            const isToday =
              today.getFullYear() === cursor.year &&
              today.getMonth() === cursor.month &&
              today.getDate() === day;
            return (
              <div
                key={key}
                className="min-h-[92px] border-b border-r border-surface-100 p-1.5 last:border-r-0"
              >
                <div
                  className={
                    "text-xs font-medium mb-1 " +
                    (isToday
                      ? "text-brand-600 font-bold"
                      : "text-surface-400")
                  }
                >
                  {day}
                </div>
                <div className="space-y-1">
                  {dayBookings.slice(0, 3).map((b) => {
                    const meta =
                      BOOKING_STATUS_META[
                        (BOOKING_STATUSES as readonly string[]).includes(b.status)
                          ? (b.status as keyof typeof BOOKING_STATUS_META)
                          : "enquiry"
                      ];
                    return (
                      <a
                        key={b.id}
                        href={`/venue-management/bookings/${b.id}`}
                        className={
                          "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium border " +
                          meta.classes
                        }
                        title={`${b.clientName} — ${meta.label}`}
                      >
                        {b.clientName}
                      </a>
                    );
                  })}
                  {dayBookings.length > 3 && (
                    <p className="text-[10px] text-surface-400 pl-1">
                      +{dayBookings.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {BOOKING_STATUSES.filter((s) => s !== "cancelled").map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs text-surface-500">
            <span className={"w-2.5 h-2.5 rounded-full " + BOOKING_STATUS_META[s].kanbanDot} />
            {BOOKING_STATUS_META[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Staff tab ────────────────────────────────────────────────────────────────

function StaffTab({
  venueId,
  staff,
  bookings,
}: {
  venueId: string;
  staff: StaffRow[];
  bookings: BookingRow[];
}) {
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);

  function submit(formData: FormData) {
    start(async () => {
      await addStaffAssignment(venueId, formData);
      setCreating(false);
    });
  }

  function remove(id: string, bookingId: string | null) {
    if (!confirm("Remove this staff assignment?")) return;
    start(async () => {
      await removeStaffAssignment(id, venueId, bookingId ?? undefined);
    });
  }

  const totalHours = staff.reduce(
    (sum, s) => sum + (shiftHours(s.shiftStart, s.shiftEnd) ?? 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-surface-800">
          Staff Assignments
          <span className="ml-2 text-xs font-normal text-surface-400">
            {totalHours > 0 ? `${totalHours} hrs total` : ""}
          </span>
        </h2>
        {!creating && (
          <PrimaryBtn onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> Add Staff
          </PrimaryBtn>
        )}
      </div>

      {creating && (
        <form
          action={submit}
          className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Staff name *">
              <input name="staff_name" required className={inputCls} />
            </Field>
            <Field label="Role">
              <select name="role" className={inputCls} defaultValue="other">
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {STAFF_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Booking">
              <select name="booking_id" className={inputCls} defaultValue="">
                <option value="">— Unassigned —</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.clientName} ({formatDate(b.startAt)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Shift date">
              <input name="shift_date" type="date" className={inputCls} />
            </Field>
            <Field label="Shift start">
              <input name="shift_start_time" type="time" className={inputCls} />
            </Field>
            <Field label="Shift end">
              <input name="shift_end_time" type="time" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea name="notes" rows={2} className={inputCls} />
          </Field>
          <div className="flex gap-2">
            <PrimaryBtn type="submit" disabled={pending}>
              Add staff member
            </PrimaryBtn>
            <GhostBtn type="button" onClick={() => setCreating(false)}>
              Cancel
            </GhostBtn>
          </div>
        </form>
      )}

      {staff.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={Users}
            title="No staff assigned"
            description="Schedule venue staff — managers, chefs, floor and AV crew — against bookings, with shift times."
            action={
              <PrimaryBtn onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> Add Staff
              </PrimaryBtn>
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Shift</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const hrs = shiftHours(s.shiftStart, s.shiftEnd);
                return (
                  <tr key={s.id} className="border-b border-surface-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-surface-900">{s.staffName}</td>
                    <td className="px-4 py-3 text-surface-600">
                      {s.role ? STAFF_ROLE_LABEL[s.role] ?? s.role : "—"}
                    </td>
                    <td className="px-4 py-3 text-surface-600">{s.bookingClient ?? "—"}</td>
                    <td className="px-4 py-3 text-surface-600">
                      {s.shiftStart
                        ? `${formatDate(s.shiftStart)} ${formatTime(s.shiftStart)}–${formatTime(s.shiftEnd)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-surface-600 tabular-nums">
                      {hrs != null ? `${hrs}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove(s.id, s.bookingId)}
                        className="p-1.5 rounded-md text-surface-400 hover:text-danger-600 hover:bg-surface-50"
                        aria-label="Remove assignment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
