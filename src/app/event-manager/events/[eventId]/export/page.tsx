import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Printer } from "lucide-react";
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

export const metadata: Metadata = { title: "Export Event" };
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-surface-100 last:border-0">
      <span className="text-sm text-surface-500">{label}</span>
      <span className="text-sm font-medium text-surface-900 text-right">{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-surface-100">
        <h2 className="text-sm font-semibold text-surface-900">{title}</h2>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

export default async function ExportEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event) notFound();

  const { data: runSheet } = await supabase
    .from("event_run_sheet_items")
    .select("id, title, lane, starts_at, position")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  const status = toUiStatus(event.status);

  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Link
            href={`/event-manager/events/${event.id}`}
            className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to event
          </Link>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight">Export Event Pack</h1>
            <p className="text-sm text-surface-500 mt-0.5">{event.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Printer className="w-4 h-4" strokeWidth={1.8} />
              Print
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
              <Download className="w-4 h-4" strokeWidth={2} />
              Download PDF
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-[900px] space-y-5">
        <Card title="Event Summary">
          <Row label="Event Name" value={event.name} />
          <Row label="Status" value={STATUS_LABELS[status] ?? status} />
          <Row label="Type" value={event.event_type ?? "—"} />
          <Row label="Date" value={formatEventDate(event.start_at)} />
          <Row label="Venue" value={venueLabel(event) ?? "—"} />
          <Row label="Budget" value={formatGbpFromCents(event.budget_cents)} />
          <Row label="Day Guests" value={String(event.guest_count_day)} />
          <Row label="Evening Guests" value={String(event.guest_count_evening)} />
        </Card>

        <Card title="Client">
          <Row label="Name" value={clientLabel(event)} />
          <Row label="Email" value={event.client_email ?? "—"} />
          <Row label="Phone" value={event.client_phone ?? "—"} />
          <Row label="Company" value={event.client_company ?? "—"} />
        </Card>

        {event.description && (
          <Card title="Overview">
            <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-line py-1">
              {event.description}
            </p>
          </Card>
        )}

        <Card title="Run Sheet">
          {(runSheet ?? []).length === 0 ? (
            <p className="text-sm text-surface-400 italic py-1">No run sheet items.</p>
          ) : (
            <div className="divide-y divide-surface-100">
              {(runSheet ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-4 py-2.5">
                  <span className="text-sm font-mono font-semibold text-brand-600 w-14 shrink-0">
                    {formatTimeOfDay(r.starts_at, "TBC")}
                  </span>
                  <span className="text-sm text-surface-800 flex-1">{r.title}</span>
                  <span className="text-xs text-surface-400 capitalize">{r.lane ?? "other"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
