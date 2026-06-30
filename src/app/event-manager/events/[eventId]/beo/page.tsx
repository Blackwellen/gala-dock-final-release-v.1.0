import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  toUiStatus,
  clientLabel,
  venueLabel,
  formatEventDate,
  formatTimeOfDay,
  formatGbpFromCents,
} from "../../_lib";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Banquet Event Order" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  "new-enquiry": "New Enquiry",
  briefing: "Briefing",
  quoting: "Quoting",
  "awaiting-approval": "Awaiting Approval",
  confirmed: "Confirmed",
  "in-delivery": "In Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  body { visibility: hidden !important; background: #ffffff !important; }
  .beo-page, .beo-page * { visibility: visible !important; }
  .beo-page { position: fixed !important; top: 0; left: 0; width: 100% !important;
    max-width: 100% !important; margin: 0 !important; padding: 0 !important;
    box-shadow: none !important; border: none !important; border-radius: 0 !important; }
  .beo-section { break-inside: avoid; }
}
`;

interface SupplierRow {
  id: string;
  role_on_event: string | null;
  status: string;
  suppliers: {
    name: string | null;
    primary_email: string | null;
    primary_phone: string | null;
  } | null;
}

export default async function BeoPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  const [{ data: guestData }, { data: supplierData }, { data: runSheet }] =
    await Promise.all([
      supabase
        .from("event_guests")
        .select("guest_type, rsvp_status, meal_choice, dietary_notes, plus_one_name")
        .eq("workspace_id", workspaceId)
        .eq("event_id", eventId),
      supabase
        .from("event_suppliers")
        .select(
          "id, role_on_event, status, suppliers(name, primary_email, primary_phone)"
        )
        .eq("workspace_id", workspaceId)
        .eq("event_id", eventId),
      supabase
        .from("event_run_sheet_items")
        .select("id, title, lane, section, starts_at, notes, position")
        .eq("workspace_id", workspaceId)
        .eq("event_id", eventId)
        .order("position", { ascending: true }),
    ]);

  const guests = guestData ?? [];
  const suppliers = (supplierData ?? []) as unknown as SupplierRow[];
  const runItems = runSheet ?? [];

  // ── Guest summary (confirmed only counts toward catering numbers) ──────────
  const confirmed = guests.filter((g) => g.rsvp_status === "confirmed");
  const dayGuests = confirmed.filter(
    (g) => g.guest_type === "day" || g.guest_type === "both"
  ).length;
  const eveningGuests = confirmed.filter(
    (g) => g.guest_type === "evening" || g.guest_type === "both"
  ).length;
  const plusOnes = confirmed.filter(
    (g) => g.plus_one_name && g.plus_one_name.trim().length > 0
  ).length;

  // ── Meal-choice summary from confirmed guests ──────────────────────────────
  const mealCounts = new Map<string, number>();
  for (const g of confirmed) {
    const choice = (g.meal_choice ?? "").trim();
    if (!choice) continue;
    mealCounts.set(choice, (mealCounts.get(choice) ?? 0) + 1);
  }
  const meals = [...mealCounts.entries()].sort((a, b) => b[1] - a[1]);
  const noMealCount = confirmed.length - [...mealCounts.values()].reduce((a, b) => a + b, 0);

  const dietary = [
    ...new Set(
      guests
        .map((g) => (g.dietary_notes ?? "").trim())
        .filter((d) => d.length > 0)
    ),
  ];

  const status = toUiStatus(event.status);
  const generatedOn = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <div className="min-h-full bg-surface-50 animate-fade-in">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar — hidden when printing */}
      <div className="beo-no-print bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-surface-900 tracking-tight">
          Banquet Event Order
        </h1>
        <PrintButton />
      </div>

      {/* The document */}
      <div className="p-6 flex justify-center">
        <div className="beo-page bg-white w-full max-w-[820px] rounded-xl border border-surface-200 shadow-card p-8 sm:p-10 space-y-8">
          {/* Header */}
          <header className="flex items-start justify-between gap-6 border-b border-surface-200 pb-6">
            <div>
              <div className="text-lg font-bold text-brand-600 tracking-tight">Gala Dock</div>
              <h2 className="mt-3 text-2xl font-bold text-surface-900 tracking-tight">
                Banquet Event Order
              </h2>
              <p className="text-sm text-surface-500 mt-1">{workspace.name}</p>
            </div>
            <div className="text-right text-xs text-surface-500 leading-relaxed">
              <div>Generated</div>
              <div className="font-medium text-surface-700">{generatedOn}</div>
              <div className="mt-2">Ref</div>
              <div className="font-mono font-medium text-surface-700">
                BEO-{event.id.slice(0, 8).toUpperCase()}
              </div>
            </div>
          </header>

          {/* Event overview */}
          <Section title="Event Overview">
            <Grid>
              <Field label="Event Name" value={event.name} />
              <Field label="Status" value={STATUS_LABELS[status] ?? status} />
              <Field label="Event Type" value={event.event_type ?? "—"} />
              <Field label="Date" value={formatEventDate(event.start_at)} />
              <Field label="Start Time" value={formatTimeOfDay(event.start_at, "TBC")} />
              <Field label="End Time" value={formatTimeOfDay(event.end_at, "TBC")} />
              <Field label="Venue" value={venueLabel(event) ?? "—"} />
              <Field
                label="Venue Address"
                value={event.venue_address_snapshot ?? "—"}
              />
              <Field label="Client" value={clientLabel(event)} />
              <Field label="Budget" value={formatGbpFromCents(event.budget_cents)} />
            </Grid>
          </Section>

          {/* Guest summary */}
          <Section title="Guest Summary">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Confirmed" value={String(confirmed.length)} />
              <Stat label="Day Guests" value={String(dayGuests)} />
              <Stat label="Evening Guests" value={String(eveningGuests)} />
              <Stat label="Plus Ones" value={String(plusOnes)} />
            </div>
            <p className="mt-3 text-xs text-surface-400">
              Counts reflect confirmed RSVPs. Planned capacity:{" "}
              {event.guest_count_day} day / {event.guest_count_evening} evening.
            </p>
          </Section>

          {/* Catering summary */}
          <Section title="Catering Summary">
            {meals.length === 0 && noMealCount === confirmed.length ? (
              <p className="text-sm text-surface-400 italic">
                No meal choices recorded for confirmed guests.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {meals.map(([choice, count]) => (
                  <span
                    key={choice}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium text-surface-900">{choice}</span>
                    <span className="tabular-nums font-semibold text-brand-600">{count}</span>
                  </span>
                ))}
                {noMealCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-3 py-1.5 text-sm">
                    <span className="font-medium text-surface-500">No choice yet</span>
                    <span className="tabular-nums font-semibold text-surface-500">{noMealCount}</span>
                  </span>
                )}
              </div>
            )}

            {dietary.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                  Dietary Requirements
                </h4>
                <ul className="list-disc pl-5 space-y-1">
                  {dietary.map((d, i) => (
                    <li key={i} className="text-sm text-surface-700">{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {/* Supplier contacts */}
          <Section title="Supplier Contacts">
            {suppliers.length === 0 ? (
              <p className="text-sm text-surface-400 italic">No suppliers assigned.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left">
                    <th className="py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wider">Supplier</th>
                    <th className="py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
                    <th className="py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wider">Phone</th>
                    <th className="py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wider">Email</th>
                    <th className="py-2 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-4 font-medium text-surface-900">
                        {s.suppliers?.name ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-surface-600">{s.role_on_event ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-surface-600">{s.suppliers?.primary_phone ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-surface-600">{s.suppliers?.primary_email ?? "—"}</td>
                      <td className="py-2.5 text-surface-600 capitalize">{s.status.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Run sheet */}
          <Section title="Run Sheet">
            {runItems.length === 0 ? (
              <p className="text-sm text-surface-400 italic">No run sheet items.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {runItems.map((r) => (
                  <div key={r.id} className="flex items-start gap-4 py-2.5">
                    <span className="text-sm font-mono font-semibold text-brand-600 w-16 shrink-0">
                      {formatTimeOfDay(r.starts_at, "TBC")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-surface-900">{r.title}</span>
                      {r.notes && (
                        <p className="text-xs text-surface-500 mt-0.5">{r.notes}</p>
                      )}
                    </div>
                    <span className="text-xs text-surface-400 capitalize shrink-0">
                      {r.section ?? r.lane ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Key contacts */}
          <Section title="Key Contacts">
            <Grid>
              <Field label="Client" value={clientLabel(event)} />
              <Field label="Client Email" value={event.client_email ?? "—"} />
              <Field label="Client Phone" value={event.client_phone ?? "—"} />
              <Field label="Company" value={event.client_company ?? "—"} />
            </Grid>
          </Section>

          {/* Notes */}
          {(event.description || event.internal_notes) && (
            <Section title="Notes & Special Requirements">
              {event.description && (
                <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-line">
                  {event.description}
                </p>
              )}
              {event.internal_notes && (
                <p className="mt-3 text-sm text-surface-700 leading-relaxed whitespace-pre-line">
                  {event.internal_notes}
                </p>
              )}
            </Section>
          )}

          <footer className="border-t border-surface-200 pt-4 text-xs text-surface-400 text-center">
            {workspace.name} · Generated by Gala Dock · {generatedOn}
          </footer>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="beo-section">
      <h3 className="text-sm font-bold text-surface-900 uppercase tracking-wider border-b border-surface-100 pb-2 mb-4">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">{children}</dl>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-50 pb-1.5">
      <dt className="text-sm text-surface-500">{label}</dt>
      <dd className="text-sm font-medium text-surface-900 text-right">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3">
      <div className="text-2xl font-bold text-surface-900 tabular-nums">{value}</div>
      <div className="text-xs text-surface-500 mt-0.5">{label}</div>
    </div>
  );
}
