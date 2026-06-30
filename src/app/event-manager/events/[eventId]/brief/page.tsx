import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { FileText, Download, Users, Calendar, Wallet, Building2 } from "lucide-react";
import { InlineEditField } from "@/components/events/InlineEditField";
import { updateEventField } from "./actions";

export const dynamic = "force-dynamic";

function gbp(cents: number | null | undefined) {
  if (!cents) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function BriefPage({ params }: { params: Promise<{ eventId: string }> }) {
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

  const ev = event as Record<string, unknown>;

  const startDate = event.start_at
    ? new Date(event.start_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : undefined;
  const endDate = event.end_at
    ? new Date(event.end_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : undefined;

  // Bind server action to this event
  const save = (field: string) =>
    updateEventField.bind(null, eventId, field);

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Event Brief</h2>
          <p className="text-sm text-surface-500">Hover any field and click the pencil to edit inline.</p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors shadow-sm">
          <Download className="h-4 w-4" strokeWidth={1.8} />
          Export PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Main brief sections */}
        <div className="lg:col-span-2 space-y-5">

          {/* Client & scope */}
          <section className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-500" strokeWidth={1.8} />
              <h3 className="text-sm font-semibold text-surface-900">Client &amp; Scope</h3>
            </div>
            <dl className="px-5 py-3">
              <InlineEditField label="Event Name"         value={event.name}                      onSave={save("name")}         placeholder="Enter event name" />
              <InlineEditField label="Client / Company"   value={ev.client_name as string}        onSave={save("client_name")}  placeholder="Client or company name" />
              <InlineEditField label="Client Email"       value={ev.client_email as string}       onSave={save("client_email")} type="email" placeholder="client@company.com" />
              <InlineEditField label="Client Phone"       value={ev.client_phone as string}       onSave={save("client_phone")} type="tel" placeholder="+44 7700 000000" />
              <InlineEditField label="Event Type"         value={event.event_type}                onSave={save("event_type")}
                type="select"
                options={[
                  { label: "Conference",  value: "conference" },
                  { label: "Corporate",   value: "corporate" },
                  { label: "Wedding",     value: "wedding" },
                  { label: "Gala",        value: "gala" },
                  { label: "Festival",    value: "festival" },
                  { label: "Networking",  value: "networking" },
                  { label: "Product Launch", value: "product_launch" },
                  { label: "Workshop",    value: "workshop" },
                  { label: "Charity",     value: "charity" },
                  { label: "Exhibition",  value: "exhibition" },
                  { label: "Awards",      value: "awards" },
                  { label: "Other",       value: "other" },
                ]}
              />
              <InlineEditField label="Event Format"       value={(ev.event_format as string)}     onSave={save("event_format")}
                type="select"
                options={[
                  { label: "In Person",  value: "in_person" },
                  { label: "Online",     value: "online" },
                  { label: "Hybrid",     value: "hybrid" },
                ]}
              />
            </dl>
          </section>

          {/* Dates & venue */}
          <section className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-500" strokeWidth={1.8} />
              <h3 className="text-sm font-semibold text-surface-900">Dates &amp; Venue</h3>
            </div>
            <dl className="px-5 py-3">
              <InlineEditField label="Start Date / Time" value={event.start_at ? String(event.start_at).slice(0, 16) : undefined} onSave={save("start_at")} type="datetime-local"
                valueClassName="text-sm text-surface-900 font-medium"
                placeholder="Set start date"
              />
              {startDate && (
                <div className="flex items-start gap-3 py-1 pl-48">
                  <p className="text-xs text-surface-400">{startDate}</p>
                </div>
              )}
              <InlineEditField label="End Date / Time" value={event.end_at ? String(event.end_at).slice(0, 16) : undefined} onSave={save("end_at")} type="datetime-local"
                valueClassName="text-sm text-surface-900"
                placeholder="Set end date"
              />
              {endDate && (
                <div className="flex items-start gap-3 py-1 pl-48">
                  <p className="text-xs text-surface-400">{endDate}</p>
                </div>
              )}
              <InlineEditField label="Venue Name"    value={event.venue_name_snapshot}    onSave={save("venue_name_snapshot")}    placeholder="Venue or location name" />
              <InlineEditField label="Venue Address" value={event.venue_address_snapshot} onSave={save("venue_address_snapshot")} placeholder="Full address" type="textarea" rows={2} />
            </dl>
          </section>

          {/* Audience */}
          <section className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-500" strokeWidth={1.8} />
              <h3 className="text-sm font-semibold text-surface-900">Audience &amp; Capacity</h3>
            </div>
            <dl className="px-5 py-3">
              <InlineEditField label="Day Capacity"    value={event.guest_count_day != null ? String(event.guest_count_day) : undefined}   onSave={save("guest_count_day")}   type="number" placeholder="e.g. 500" />
              <InlineEditField label="Online Capacity" value={(ev.capacity_online as number) != null ? String(ev.capacity_online) : undefined} onSave={save("capacity_online")} type="number" placeholder="e.g. 1000" />
              <div className="flex items-start gap-3 py-3 border-b border-surface-100 last:border-0">
                <dt className="w-48 shrink-0 text-xs font-semibold text-surface-500 pt-0.5">Flags</dt>
                <dd className="flex flex-wrap gap-2 flex-1">
                  {Boolean(ev.is_public)    && <span className="rounded-full bg-success-100 px-2.5 py-0.5 text-xs font-semibold text-success-700">Public</span>}
                  {Boolean(ev.is_ticketed)  && <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">Ticketed</span>}
                  {Boolean(ev.is_vip)       && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">VIP</span>}
                  {Boolean(ev.is_hybrid)    && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Hybrid</span>}
                  {!ev.is_public && !ev.is_ticketed && !ev.is_vip && !ev.is_hybrid && (
                    <span className="text-sm text-surface-400 italic">No flags set</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Objectives & notes */}
          <section className="rounded-xl border border-surface-200 bg-white shadow-card">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-500" strokeWidth={1.8} />
              <h3 className="text-sm font-semibold text-surface-900">Objectives &amp; Notes</h3>
            </div>
            <dl className="px-5 py-4 space-y-2">
              <InlineEditField
                label="Description"
                value={event.description}
                onSave={save("description")}
                type="textarea"
                rows={3}
                placeholder="Short public description of the event…"
              />
              <InlineEditField
                label="Brief Notes"
                value={(ev.brief_notes as string)}
                onSave={save("brief_notes")}
                type="textarea"
                rows={5}
                placeholder="Full client brief, requirements, key deliverables and objectives…"
              />
              <InlineEditField
                label="Objectives"
                value={(ev.objectives as string)}
                onSave={save("objectives")}
                type="textarea"
                rows={3}
                placeholder="Specific measurable outcomes for this event…"
              />
            </dl>
          </section>

        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Budget */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="h-4 w-4 text-brand-500" />
              <h3 className="text-sm font-semibold text-surface-900">Budget</h3>
            </div>
            <dl>
              <InlineEditField
                label="Total Budget"
                value={event.budget_cents != null ? String(Math.round(event.budget_cents / 100)) : undefined}
                onSave={async (v) => {
                  "use server";
                  // budget_cents stored in pence, user enters £
                  const pounds = parseFloat(v.replace(/[^0-9.]/g, ""));
                  if (isNaN(pounds)) return { error: "Enter a valid amount" };
                  return updateEventField(eventId, "budget_cents", String(Math.round(pounds * 100)));
                }}
                type="number"
                prefix="£"
                placeholder="e.g. 50000"
              />
            </dl>
            <div className="mt-3 pt-3 border-t border-surface-100 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-500">Total</span>
                <span className="font-semibold text-surface-900">{gbp(event.budget_cents)}</span>
              </div>
            </div>
          </div>

          {/* Event flags */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Event Tags</h3>
            <div className="flex flex-wrap gap-2">
              {Boolean(ev.is_public)    && <span className="rounded-full bg-success-100 px-2.5 py-1 text-xs font-semibold text-success-700">Public</span>}
              {Boolean(ev.is_ticketed)  && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Ticketed</span>}
              {Boolean(ev.is_vip)       && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">VIP</span>}
              {Boolean(ev.is_hybrid)    && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">Hybrid</span>}
              {Boolean(ev.event_format) && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  {String(ev.event_format).replace(/_/g, " ")}
                </span>
              )}
              {event.event_type && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 capitalize">
                  {event.event_type.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
