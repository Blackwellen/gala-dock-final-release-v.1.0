import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditListingForm } from "./EditListingForm";

export const dynamic = "force-dynamic";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", listingId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!listing) notFound();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title={listing.title} description="Edit your listing and control its marketplace visibility." />
      <div className="flex-1 px-6 py-6 max-w-2xl">
        <EditListingForm listing={listing} />
      </div>
    </div>
  );
}
