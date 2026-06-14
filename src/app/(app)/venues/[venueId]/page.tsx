import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  VenueDetailClient,
  type VenueDetail,
  type VenueDocRow,
  type VenueNoteRow,
  type LinkedEvent,
} from "./VenueDetailClient";
import { composeLocation, docHealth, formatDate } from "../lib";

export const dynamic = "force-dynamic";

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select(
      `id, name, status, website, capacity, notes,
       address_line1, address_line2, city, region, postal_code, country,
       contact_email, contact_phone, created_at, updated_at,
       category:venue_categories ( name )`
    )
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!venue) notFound();

  const [{ data: documents }, { data: notes }, { data: events }] =
    await Promise.all([
      supabase
        .from("venue_documents")
        .select(
          "id, doc_type, filename, file_size_bytes, expiry_date, status, created_at"
        )
        .eq("venue_id", venueId)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("venue_notes")
        .select("id, body, is_pinned, created_at, updated_at")
        .eq("venue_id", venueId)
        .eq("workspace_id", workspaceId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("id, name, client_name, start_at, guest_count_day, status")
        .eq("venue_id", venueId)
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("start_at", { ascending: false }),
    ]);

  const detail: VenueDetail = {
    id: venue.id,
    name: venue.name,
    status: venue.status,
    category: (venue.category as { name: string } | null)?.name ?? null,
    website: venue.website,
    capacity: venue.capacity,
    notes: venue.notes,
    location: composeLocation(venue),
    addressLine1: venue.address_line1,
    addressLine2: venue.address_line2,
    city: venue.city,
    region: venue.region,
    postalCode: venue.postal_code,
    country: venue.country,
    contactEmail: venue.contact_email,
    contactPhone: venue.contact_phone,
    createdAt: formatDate(venue.created_at),
  };

  const docRows: VenueDocRow[] = (documents ?? []).map((d) => ({
    id: d.id,
    docType: d.doc_type,
    filename: d.filename,
    sizeBytes: d.file_size_bytes,
    expiry: d.expiry_date ? formatDate(d.expiry_date) : "—",
    health: docHealth(d.expiry_date, d.status),
    created: formatDate(d.created_at),
  }));

  const noteRows: VenueNoteRow[] = (notes ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    isPinned: n.is_pinned,
    created: formatDate(n.created_at),
  }));

  const linkedEvents: LinkedEvent[] = (events ?? []).map((ev) => ({
    id: ev.id,
    name: ev.name,
    client: ev.client_name ?? "—",
    date: formatDate(ev.start_at),
    guests: ev.guest_count_day ?? null,
    status: ev.status,
  }));

  return (
    <VenueDetailClient
      venue={detail}
      documents={docRows}
      notes={noteRows}
      events={linkedEvents}
    />
  );
}
