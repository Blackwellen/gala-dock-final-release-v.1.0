"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Plus, Upload, Download, Users2,
  X, Pencil, Trash2, UtensilsCrossed, FileSpreadsheet, Check,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import {
  addGuest,
  updateGuest,
  removeGuest,
  importGuests,
} from "@/app/(app)/events/[eventId]/guest-actions";

/** Mirrors the (non-exported) GuestInput shape in guest-actions.ts. */
export interface GuestInput {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guest_type: string;
  rsvp_status: string;
  meal_choice: string | null;
  dietary_notes: string | null;
  table_number: string | null;
  seat_number: string | null;
  plus_one_name: string | null;
  notes: string | null;
}

export interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guest_type: string;
  rsvp_status: string;
  meal_choice: string | null;
  dietary_notes: string | null;
  table_number: string | null;
  seat_number: string | null;
  plus_one_name: string | null;
  notes: string | null;
}

const GUEST_TYPES = ["day", "evening", "both"] as const;
const RSVP_STATUSES = ["pending", "confirmed", "declined", "maybe"] as const;

const GUEST_TYPE_LABELS: Record<string, string> = {
  day: "Day",
  evening: "Evening",
  both: "Both",
};

type RsvpBadge = "confirmed" | "pending" | "declined" | "maybe";
function rsvpBadge(status: string): RsvpBadge {
  return (RSVP_STATUSES as readonly string[]).includes(status)
    ? (status as RsvpBadge)
    : "pending";
}

const EMPTY_FORM: GuestInput = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  guest_type: "day",
  rsvp_status: "pending",
  meal_choice: "",
  dietary_notes: "",
  table_number: "",
  seat_number: "",
  plus_one_name: "",
  notes: "",
};

function rowToForm(row: GuestRow): GuestInput {
  return {
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    guest_type: row.guest_type ?? "day",
    rsvp_status: row.rsvp_status ?? "pending",
    meal_choice: row.meal_choice ?? "",
    dietary_notes: row.dietary_notes ?? "",
    table_number: row.table_number ?? "",
    seat_number: row.seat_number ?? "",
    plus_one_name: row.plus_one_name ?? "",
    notes: row.notes ?? "",
  };
}

/** Wrap a CSV cell value, escaping quotes/commas/newlines. */
function csvCell(value: string | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Parse a CSV string into a 2D array, honouring quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

const CSV_HEADERS = [
  "First Name", "Last Name", "Email", "Guest Type", "RSVP Status", "Meal Choice", "Dietary Notes",
];

function normaliseGuestType(raw: string): string {
  const v = raw.trim().toLowerCase();
  return (GUEST_TYPES as readonly string[]).includes(v) ? v : "day";
}
function normaliseRsvp(raw: string): string {
  const v = raw.trim().toLowerCase();
  return (RSVP_STATUSES as readonly string[]).includes(v) ? v : "pending";
}

type ParsedImportRow = GuestInput;

export function GuestsTab({
  eventId,
  guests,
}: {
  eventId: string;
  guests: GuestRow[];
}) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [rsvpFilter, setRsvpFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GuestInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { total: guests.length, confirmed: 0, pending: 0, declined: 0 };
    for (const g of guests) {
      if (g.rsvp_status === "confirmed") c.confirmed++;
      else if (g.rsvp_status === "pending") c.pending++;
      else if (g.rsvp_status === "declined") c.declined++;
    }
    return c;
  }, [guests]);

  const filtered = useMemo(() => {
    return guests.filter((g) => {
      if (typeFilter !== "all" && g.guest_type !== typeFilter) return false;
      if (rsvpFilter !== "all" && g.rsvp_status !== rsvpFilter) return false;
      return true;
    });
  }, [guests, typeFilter, rsvpFilter]);

  // Meal summary across confirmed guests (the BEO catering input).
  const mealSummary = useMemo(() => {
    const confirmed = guests.filter((g) => g.rsvp_status === "confirmed");
    const tally = new Map<string, number>();
    let unspecified = 0;
    for (const g of confirmed) {
      const meal = (g.meal_choice ?? "").trim();
      if (!meal) { unspecified++; continue; }
      tally.set(meal, (tally.get(meal) ?? 0) + 1);
    }
    return {
      totalConfirmed: confirmed.length,
      entries: Array.from(tally.entries()).sort((a, b) => b[1] - a[1]),
      unspecified,
    };
  }, [guests]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: GuestRow) {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function setField<K extends keyof GuestInput>(key: K, value: GuestInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submitForm() {
    if (!String(form.first_name).trim() && !String(form.last_name).trim()) {
      setFormError("A first or last name is required.");
      return;
    }
    setFormError(null);
    const payload = form;
    const id = editingId;
    startTransition(async () => {
      const res = id
        ? await updateGuest(eventId, id, payload)
        : await addGuest(eventId, payload);
      if (res.ok) {
        closeForm();
      } else {
        setFormError(res.error ?? "Something went wrong.");
      }
    });
  }

  function handleRemove(row: GuestRow) {
    const name = `${row.first_name} ${row.last_name}`.trim() || "this guest";
    if (!window.confirm(`Remove ${name} from the guest list?`)) return;
    setActionError(null);
    startTransition(async () => {
      const res = await removeGuest(eventId, row.id);
      if (!res.ok) setActionError(res.error ?? "Failed to remove guest.");
    });
  }

  function handleExport() {
    const lines = [CSV_HEADERS.join(",")];
    for (const g of filtered) {
      lines.push([
        csvCell(g.first_name),
        csvCell(g.last_name),
        csvCell(g.email),
        csvCell(GUEST_TYPE_LABELS[g.guest_type] ?? g.guest_type),
        csvCell(g.rsvp_status),
        csvCell(g.meal_choice),
        csvCell(g.dietary_notes),
      ].join(","));
    }
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guest-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const sample = "Jane,Smith,jane@example.com,Both,confirmed,Beef,None";
    const blob = new Blob([CSV_HEADERS.join(",") + "\r\n" + sample], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guest-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openImport() {
    setImportRows([]);
    setImportError(null);
    setImportSummary(null);
    setImportOpen(true);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const grid = parseCsv(text);
        if (grid.length === 0) {
          setImportError("The file appears to be empty.");
          setImportRows([]);
          return;
        }
        // Detect and skip a header row if present.
        const first = grid[0].map((c) => c.trim().toLowerCase());
        const hasHeader = first[0] === "first name" || first.includes("first name");
        const dataRows = hasHeader ? grid.slice(1) : grid;
        let skipped = 0;
        const parsed: ParsedImportRow[] = [];
        for (const cols of dataRows) {
          const firstName = (cols[0] ?? "").trim();
          const lastName = (cols[1] ?? "").trim();
          if (!firstName && !lastName) { skipped++; continue; }
          parsed.push({
            first_name: firstName,
            last_name: lastName,
            email: (cols[2] ?? "").trim() || null,
            guest_type: normaliseGuestType(cols[3] ?? ""),
            rsvp_status: normaliseRsvp(cols[4] ?? ""),
            meal_choice: (cols[5] ?? "").trim() || null,
            dietary_notes: (cols[6] ?? "").trim() || null,
            phone: null,
            table_number: null,
            seat_number: null,
            plus_one_name: null,
            notes: null,
          });
        }
        if (parsed.length === 0) {
          setImportError("No valid rows found. Each guest needs a first or last name.");
        }
        setImportRows(parsed);
        setImportSummary(
          `${parsed.length} guest${parsed.length === 1 ? "" : "s"} ready` +
          (skipped > 0 ? `, ${skipped} row${skipped === 1 ? "" : "s"} skipped` : ""),
        );
      } catch {
        setImportError("Could not parse this CSV file.");
        setImportRows([]);
      }
    };
    reader.onerror = () => setImportError("Could not read the file.");
    reader.readAsText(file);
  }

  function runImport() {
    if (importRows.length === 0) return;
    setImportError(null);
    const payload: GuestInput[] = importRows;
    startTransition(async () => {
      const res = await importGuests(eventId, payload);
      if (res.ok) {
        setImportOpen(false);
        setImportRows([]);
      } else {
        setImportError(res.error ?? "Import failed.");
      }
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* KPI strip */}
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Total Guests" value={counts.total} icon={Users2} iconColor="text-brand-600" iconBg="bg-brand-50" />
        <MetricCard label="Confirmed" value={counts.confirmed} icon={Check} iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Pending" value={counts.pending} icon={Users2} iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Declined" value={counts.declined} icon={X} iconColor="text-danger-600" iconBg="bg-danger-50" />
      </KPIGrid>

      {actionError && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-2.5 text-sm text-danger-700">
          {actionError}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />Add Guest
        </button>
        <button onClick={openImport} className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Upload className="w-4 h-4" strokeWidth={1.8} />Import CSV
        </button>
        <button onClick={handleExport} disabled={guests.length === 0} className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Download className="w-4 h-4" strokeWidth={1.8} />Export CSV
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-surface-200 rounded-lg text-surface-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Types</option>
            <option value="day">Day</option>
            <option value="evening">Evening</option>
            <option value="both">Both</option>
          </select>
          <select
            value={rsvpFilter}
            onChange={(e) => setRsvpFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-surface-200 rounded-lg text-surface-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All RSVPs</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
            <option value="maybe">Maybe</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {guests.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No guests yet"
          description="Add guests one at a time or import a CSV to build the guest list, track RSVPs and capture meal choices."
        />
      ) : filtered.length === 0 ? (
        <EmptyState compact icon={Users2} title="No matching guests" description="No guests match the current filters." />
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  {["Name", "Email", "Type", "RSVP", "Meal", "Dietary", "Table", "Plus One", ""].map((h, i) => (
                    <th key={i} className={cn(
                      "px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider",
                      (h === "Email" || h === "Dietary" || h === "Plus One") && "hidden lg:table-cell",
                      (h === "Meal" || h === "Table") && "hidden md:table-cell",
                      !h && "w-20",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((g) => (
                  <tr key={g.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-4 py-3.5 font-medium text-surface-900 whitespace-nowrap">
                      {`${g.first_name} ${g.last_name}`.trim() || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{g.email ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-600">{GUEST_TYPE_LABELS[g.guest_type] ?? g.guest_type}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={rsvpBadge(g.rsvp_status)} /></td>
                    <td className="px-4 py-3.5 text-surface-600 hidden md:table-cell">{g.meal_choice ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{g.dietary_notes ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-600 hidden md:table-cell">{g.table_number ?? "—"}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{g.plus_one_name ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" aria-label="Edit guest">
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                        </button>
                        <button onClick={() => handleRemove(g)} className="p-1.5 rounded-lg text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors" aria-label="Remove guest">
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Meal-choice summary */}
      {mealSummary.totalConfirmed > 0 && (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden max-w-[760px]">
          <div className="px-5 py-3.5 border-b border-surface-100 flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-brand-500" strokeWidth={1.8} />
            <h3 className="text-sm font-semibold text-surface-900">Meal Summary</h3>
            <span className="ml-auto text-xs text-surface-400">{mealSummary.totalConfirmed} confirmed</span>
          </div>
          <div className="p-5 flex flex-wrap gap-3">
            {mealSummary.entries.length === 0 && mealSummary.unspecified === mealSummary.totalConfirmed ? (
              <p className="text-sm text-surface-400">No meal choices recorded yet.</p>
            ) : (
              <>
                {mealSummary.entries.map(([meal, count]) => (
                  <div key={meal} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-200 bg-surface-50">
                    <span className="text-sm font-medium text-surface-700">{meal}</span>
                    <span className="text-sm font-bold text-brand-600 tabular-nums">{count}</span>
                  </div>
                ))}
                {mealSummary.unspecified > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-200 bg-surface-50">
                    <span className="text-sm font-medium text-surface-500">Not specified</span>
                    <span className="text-sm font-bold text-surface-500 tabular-nums">{mealSummary.unspecified}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit drawer */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button className="absolute inset-0 bg-surface-900/30" onClick={closeForm} aria-label="Close" />
          <div className="relative w-full max-w-md h-full bg-white shadow-xl flex flex-col animate-slide-in overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-surface-900">{editingId ? "Edit Guest" : "Add Guest"}</h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" aria-label="Close">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" required>
                  <input value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Last Name">
                  <input value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Email">
                <input type="email" value={form.email ?? ""} onChange={(e) => setField("email", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Guest Type" required>
                  <select value={form.guest_type} onChange={(e) => setField("guest_type", e.target.value)} className={inputCls}>
                    <option value="day">Day</option>
                    <option value="evening">Evening</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
                <Field label="RSVP Status" required>
                  <select value={form.rsvp_status} onChange={(e) => setField("rsvp_status", e.target.value)} className={inputCls}>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="declined">Declined</option>
                    <option value="maybe">Maybe</option>
                  </select>
                </Field>
              </div>
              <Field label="Meal Choice">
                <input value={form.meal_choice ?? ""} onChange={(e) => setField("meal_choice", e.target.value)} className={inputCls} placeholder="e.g. Beef, Vegetarian" />
              </Field>
              <Field label="Dietary Notes">
                <input value={form.dietary_notes ?? ""} onChange={(e) => setField("dietary_notes", e.target.value)} className={inputCls} placeholder="e.g. Nut allergy" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Table Number">
                  <input value={form.table_number ?? ""} onChange={(e) => setField("table_number", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Seat Number">
                  <input value={form.seat_number ?? ""} onChange={(e) => setField("seat_number", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Plus One Name">
                <input value={form.plus_one_name ?? ""} onChange={(e) => setField("plus_one_name", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Notes">
                <textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} rows={3} className={cn(inputCls, "resize-none")} />
              </Field>

              {formError && <p className="text-sm text-danger-600">{formError}</p>}
            </div>

            <div className="px-5 py-4 border-t border-surface-200 flex justify-end gap-2 shrink-0">
              <button onClick={closeForm} className="px-4 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">Cancel</button>
              <button onClick={submitForm} disabled={isPending} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand disabled:opacity-60">
                {isPending ? "Saving…" : "Save Guest"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-surface-900/40" onClick={() => setImportOpen(false)} aria-label="Close" />
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-xl shadow-xl flex flex-col overflow-hidden animate-fade-in">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-surface-900">Import Guests from CSV</h3>
              <button onClick={() => setImportOpen(false)} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" aria-label="Close">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand cursor-pointer">
                  <Upload className="w-4 h-4" strokeWidth={2} />Choose CSV File
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                </label>
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
                  <FileSpreadsheet className="w-4 h-4" strokeWidth={1.8} />Download Template
                </button>
              </div>

              <p className="text-xs text-surface-400">
                Expected columns: {CSV_HEADERS.join(", ")}. Rows without a name are skipped.
              </p>

              {importError && <p className="text-sm text-danger-600">{importError}</p>}
              {importSummary && !importError && (
                <p className="text-sm text-surface-600">{importSummary}</p>
              )}

              {importRows.length > 0 && (
                <div className="border border-surface-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-surface-50 border-b border-surface-200 text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Preview {importRows.length > 10 ? "(first 10)" : ""}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-100 bg-white">
                          {["Name", "Email", "Type", "RSVP", "Meal"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-surface-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100">
                        {importRows.slice(0, 10).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-medium text-surface-900">{`${r.first_name} ${r.last_name}`.trim()}</td>
                            <td className="px-3 py-2 text-surface-500">{r.email ?? "—"}</td>
                            <td className="px-3 py-2 text-surface-600">{GUEST_TYPE_LABELS[r.guest_type] ?? r.guest_type}</td>
                            <td className="px-3 py-2"><StatusBadge status={rsvpBadge(r.rsvp_status)} /></td>
                            <td className="px-3 py-2 text-surface-600">{r.meal_choice ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-surface-200 flex justify-end gap-2 shrink-0">
              <button onClick={() => setImportOpen(false)} className="px-4 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">Cancel</button>
              <button onClick={runImport} disabled={isPending || importRows.length === 0} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand disabled:opacity-60 disabled:cursor-not-allowed">
                {isPending ? "Importing…" : `Import ${importRows.length} Guest${importRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-surface-200 rounded-lg text-surface-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-danger-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
