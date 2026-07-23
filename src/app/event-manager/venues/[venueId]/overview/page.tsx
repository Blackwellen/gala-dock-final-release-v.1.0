import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate, formatGBP, DOC_TYPE_LABEL } from "../../lib";
import { Phone, Mail, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-surface-500">{label}</span>
      <span className="text-surface-800 font-medium text-right">{value}</span>
    </div>
  );
}

export default async function VenueOverviewPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [
    { data: venue },
    { data: contacts },
    { data: terms },
    { data: access },
    { data: documents },
  ] = await Promise.all([
    supabase
      .from("venues")
      .select(
        `id, name, website, notes, capacity, status, created_at, best_fit_event_types,
         accessibility_features, review_date, preferred_reason,
         category:venue_categories ( name )`
      )
      .eq("id", venueId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("venue_contacts")
      .select("id, name, role, email, phone, is_primary")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("venue_commercial_terms")
      .select("hire_rate_from_cents, day_rate_cents, security_deposit_pct:standard_deposit_pct, catering_in_house:corkage_policy")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("venue_access_details")
      .select("step_free_access, accessible_toilets, passenger_lifts, hearing_loop, on_site_parking, loading_bay")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("venue_documents")
      .select("id, doc_type, category, filename")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!venue) notFound();

  const eventTypes: string[] = Array.isArray(venue.best_fit_event_types) ? (venue.best_fit_event_types as string[]) : [];

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6 min-w-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Venue Details">
            <Row label="Venue Type" value={(venue.category as { name: string } | null)?.name ?? "—"} />
            <Row label="Capacity" value={venue.capacity ?? "—"} />
            <Row label="Website" value={venue.website ?? "—"} />
            <Row label="Venue Since" value={formatDate(venue.created_at)} />
            <Row label="Review Date" value={venue.review_date ? formatDate(venue.review_date) : "—"} />
          </Card>

          <Card title="Contacts" action={<a href={`/event-manager/venues/${venueId}/notes`} className="text-xs font-medium text-brand-600">View all</a>}>
            {(contacts ?? []).length === 0 ? (
              <p className="text-sm text-surface-400">No contacts recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {(contacts ?? []).slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-start justify-between text-sm">
                    <div>
                      <p className="font-medium text-surface-800">{c.name}</p>
                      <p className="text-xs text-surface-500">{c.role ?? (c.is_primary ? "Primary Contact" : "Contact")}</p>
                    </div>
                    <div className="flex items-center gap-2 text-surface-400">
                      {c.email && <Mail className="w-3.5 h-3.5" strokeWidth={1.8} />}
                      {c.phone && <Phone className="w-3.5 h-3.5" strokeWidth={1.8} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Facilities & Accessibility">
            <Row label="Step-Free Access" value={access?.step_free_access ? "Yes" : "—"} />
            <Row label="Accessible Toilets" value={access?.accessible_toilets ? "Yes" : "—"} />
            <Row label="Passenger Lifts" value={access?.passenger_lifts ?? "—"} />
            <Row label="Hearing Loop" value={access?.hearing_loop ? "Yes" : "—"} />
            <Row label="On-Site Parking" value={access?.on_site_parking ?? "—"} />
          </Card>

          <Card title="Typical Event Types">
            {eventTypes.length === 0 ? (
              <p className="text-sm text-surface-400">Not yet recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {eventTypes.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-100 text-surface-600">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card title="Commercial Summary">
            <Row label="Hire Rate (From)" value={formatGBP(terms?.hire_rate_from_cents)} />
            <Row label="Day Rate" value={formatGBP(terms?.day_rate_cents)} />
            <Row label="Standard Deposit" value={terms?.security_deposit_pct != null ? `${terms.security_deposit_pct}%` : "—"} />
            <Row label="Corkage Policy" value={terms?.catering_in_house ?? "—"} />
          </Card>

          <Card title="Documents" action={<a href={`/event-manager/venues/${venueId}/documents`} className="text-xs font-medium text-brand-600">View all</a>}>
            {(documents ?? []).length === 0 ? (
              <p className="text-sm text-surface-400">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {(documents ?? []).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm text-surface-700">
                    <FileText className="w-3.5 h-3.5 text-surface-400 shrink-0" strokeWidth={1.8} />
                    <span className="truncate flex-1">{d.filename}</span>
                    <span className="text-xs text-surface-400 shrink-0">{DOC_TYPE_LABEL[d.category ?? d.doc_type] ?? d.doc_type}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {venue.notes && (
          <Card title="Notes">
            <p className="text-sm text-surface-600 whitespace-pre-line">{venue.notes}</p>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Quick Facts">
          <Row label="Status" value={venue.status} />
          <Row label="Capacity" value={venue.capacity ?? "—"} />
        </InsightCard>
        {venue.preferred_reason && (
          <InsightCard title="Preferred Notes">
            <p className="text-sm text-surface-600 italic">&ldquo;{venue.preferred_reason}&rdquo;</p>
          </InsightCard>
        )}
      </div>
    </div>
  );
}
