import Link from "next/link";
import { Store, Plus, Lock } from "lucide-react";
import { getPersonaContext } from "@/lib/flags/context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, LISTINGS_TABS } from "@/components/ui/SectionTabs";
import { categoryLabel } from "../categories";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  live: "bg-success-50 text-success-700 border-success-200",
  draft: "bg-surface-100 text-surface-600 border-surface-200",
  paused: "bg-warning-50 text-warning-700 border-warning-200",
};

export default async function MyListingsPage() {
  const { workspaceId, workspaceType, flags } = await getPersonaContext();

  const marketplaceFlagOn =
    workspaceType === "venue" ? flags.marketplaceVenue : flags.marketplaceSupplier;

  if (!marketplaceFlagOn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="max-w-md w-full rounded-2xl border border-surface-200 bg-white p-10 text-center shadow-card">
          <div className="mx-auto w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mb-5">
            <Lock className="w-6 h-6 text-brand-600" />
          </div>
          <h2 className="text-xl font-semibold text-surface-900 mb-2">My Listings</h2>
          <p className="text-sm text-surface-500">
            The marketplace is not enabled for this workspace yet. Contact your workspace owner or
            Gala Dock support to turn it on.
          </p>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return null;
  }

  const supabase = await createClient();
  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("id, title, category, status, price_from_cents, price_unit, currency, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  const list = listings ?? [];

  function formatPrice(cents: number, currency: string, unit: string) {
    const amount = (cents / 100).toLocaleString("en-GB", { style: "currency", currency });
    const suffix = unit === "per_hour" ? "/hr" : unit === "per_head" ? "/head" : unit === "per_day" ? "/day" : "";
    return `From ${amount}${suffix}`;
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="My Listings"
        description="What buyers (event organizers and venue managers) see when they browse the marketplace."
        tabs={<SectionTabs tabs={LISTINGS_TABS} />}
        actions={
          <Link
            href="/event-manager/marketplace/listings/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New listing
          </Link>
        }
      />

      <div className="flex-1 px-6 py-6">
        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Store}
              title="No listings yet"
              description="Create your first listing to appear in the marketplace and start receiving bookings."
              action={
                <Link
                  href="/event-manager/marketplace/listings/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  Create a listing
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((l) => (
              <Link
                key={l.id}
                href={`/event-manager/marketplace/listings/${l.id}/edit`}
                className="rounded-xl border border-surface-200 bg-white p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-surface-900">{l.title}</h3>
                  <span
                    className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[l.status] ?? STATUS_STYLE.draft}`}
                  >
                    {l.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-surface-500">{categoryLabel(l.category)}</p>
                <p className="mt-3 text-sm font-medium text-surface-700">
                  {formatPrice(l.price_from_cents, l.currency, l.price_unit)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
