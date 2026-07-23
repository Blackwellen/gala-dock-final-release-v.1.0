import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { EditVenueForm, type EditVenueData } from "./EditVenueForm";

export const dynamic = "force-dynamic";

export default async function EditVenuePage({
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
      `id, name, status, is_preferred, website, capacity,
       address_line1, address_line2, city, region, postal_code,
       contact_email, contact_phone, notes`
    )
    .eq("id", venueId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!venue) notFound();

  const data: EditVenueData = {
    id: venue.id,
    name: venue.name,
    status: venue.status === "active" || venue.status === "archived" ? venue.status : "active",
    isPreferred: venue.is_preferred ?? false,
    website: venue.website ?? "",
    addressLine1: venue.address_line1 ?? "",
    addressLine2: venue.address_line2 ?? "",
    city: venue.city ?? "",
    region: venue.region ?? "",
    postalCode: venue.postal_code ?? "",
    capacity: venue.capacity != null ? String(venue.capacity) : "",
    contactEmail: venue.contact_email ?? "",
    contactPhone: venue.contact_phone ?? "",
    notes: venue.notes ?? "",
  };

  return <EditVenueForm venue={data} />;
}
