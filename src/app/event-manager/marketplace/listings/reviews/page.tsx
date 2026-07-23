import { Star, Lock } from "lucide-react";
import { getPersonaContext } from "@/lib/flags/context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, LISTINGS_TABS } from "@/components/ui/SectionTabs";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < rounded ? "fill-warning-400 text-warning-400" : "text-surface-200"}`}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

export default async function ListingReviewsPage() {
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
          <h2 className="text-xl font-semibold text-surface-900 mb-2">Reviews</h2>
          <p className="text-sm text-surface-500">
            The marketplace is not enabled for this workspace yet. Contact your workspace owner or
            Gala Dock support to turn it on.
          </p>
        </div>
      </div>
    );
  }

  if (!workspaceId) return null;

  const supabase = await createClient();

  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("id, title")
    .eq("workspace_id", workspaceId);

  const listingList = listings ?? [];
  const listingIds = listingList.map((l) => l.id);
  const listingTitleById = new Map(listingList.map((l) => [l.id, l.title]));

  const { data: reviews } = listingIds.length
    ? await supabase
        .from("marketplace_reviews")
        .select(
          "id, listing_id, reviewer_workspace_id, rating, quality_rating, communication_rating, reliability_rating, value_rating, professionalism_rating, body, created_at"
        )
        .in("listing_id", listingIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  const reviewList = (reviews ?? []) as Array<{
    id: string;
    listing_id: string;
    reviewer_workspace_id: string;
    rating: number;
    body: string | null;
    created_at: string;
  }>;

  const reviewerIds = Array.from(new Set(reviewList.map((r) => r.reviewer_workspace_id)));
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from("workspaces").select("id, name").in("id", reviewerIds)
    : { data: [] as { id: string; name: string }[] };
  const reviewerNameById = new Map((reviewers ?? []).map((w) => [w.id, w.name]));

  const reviewIds = reviewList.map((r) => r.id);
  const { data: responses } = reviewIds.length
    ? await supabase
        .from("marketplace_review_responses")
        .select("review_id, body, created_at")
        .in("review_id", reviewIds)
    : { data: [] as { review_id: string; body: string; created_at: string }[] };
  const responseByReviewId = new Map((responses ?? []).map((r) => [r.review_id, r]));

  const averageRating =
    reviewList.length > 0
      ? reviewList.reduce((sum, r) => sum + Number(r.rating), 0) / reviewList.length
      : 0;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Reviews"
        description="What buyers are saying about your listings after completed bookings."
        tabs={<SectionTabs tabs={LISTINGS_TABS} />}
      />

      <div className="flex-1 px-6 py-6 space-y-4">
        {reviewList.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Star}
              title="No reviews yet"
              description="Reviews appear here once a buyer completes a booking against one of your listings and leaves feedback."
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm text-surface-600">
              <Stars rating={averageRating} />
              <span className="font-semibold text-surface-900">{averageRating.toFixed(1)}</span>
              <span>average across {reviewList.length} review{reviewList.length === 1 ? "" : "s"}</span>
            </div>

            <div className="space-y-3">
              {reviewList.map((r) => {
                const response = responseByReviewId.get(r.id);
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-surface-900">
                          {reviewerNameById.get(r.reviewer_workspace_id) ?? "Anonymous organizer"}
                        </p>
                        <p className="text-xs text-surface-400 mt-0.5">
                          {listingTitleById.get(r.listing_id) ?? "Listing"} · {formatDate(r.created_at)}
                        </p>
                      </div>
                      <Stars rating={Number(r.rating)} />
                    </div>
                    {r.body && <p className="mt-3 text-sm text-surface-700">{r.body}</p>}
                    {response && (
                      <div className="mt-3 pl-4 border-l-2 border-surface-200">
                        <p className="text-xs font-semibold text-surface-500">Your response</p>
                        <p className="text-sm text-surface-700 mt-1">{response.body}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
