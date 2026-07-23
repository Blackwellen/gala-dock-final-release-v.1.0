import { redirect } from "next/navigation";

// Route-per-tab profile: bare /venues/[venueId] always resolves to Overview so
// the tab strip, deep links and browser back/forward all behave consistently.
export default async function VenueDetailIndexPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  redirect(`/event-manager/venues/${venueId}/overview`);
}
