import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { VenueProfileShell, type VenueProfileHeaderData } from "@/components/venues/VenueProfileShell";
import { composeLocation, formatDate, formatGBP } from "../lib";

export const dynamic = "force-dynamic";

export default async function VenueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("venues")
    .select(
      `id, name, status, is_preferred, is_verified, rating, avg_spend_cents,
       last_used_at, capacity, city, region, address_line1, postal_code,
       contact_email, contact_phone,
       category:venue_categories ( name )`
    )
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!venue) notFound();

  const [{ data: primaryContact }, { count: spacesCount }] = await Promise.all([
    supabase
      .from("venue_contacts")
      .select("name, email, phone")
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("venue_spaces")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("workspace_id", workspaceId),
  ]);

  const header: VenueProfileHeaderData = {
    id: venue.id,
    name: venue.name,
    coverUrl: null,
    isPreferred: venue.is_preferred ?? venue.status === "preferred",
    isVerified: venue.is_verified ?? false,
    rating: venue.rating != null ? Number(venue.rating) : null,
    venueType: (venue.category as { name: string } | null)?.name ?? null,
    location: composeLocation(venue),
    primaryContactName: primaryContact?.name ?? null,
    primaryContactEmail: primaryContact?.email ?? venue.contact_email,
    primaryContactPhone: primaryContact?.phone ?? venue.contact_phone,
    maxCapacity: venue.capacity,
    spacesCount: spacesCount ?? 0,
    avgSpendLabel: formatGBP(venue.avg_spend_cents),
    commercialStatus: venue.status === "preferred" ? "active" : venue.status,
    lastUsedLabel: venue.last_used_at ? formatDate(venue.last_used_at) : "—",
  };

  return <VenueProfileShell venue={header}>{children}</VenueProfileShell>;
}
