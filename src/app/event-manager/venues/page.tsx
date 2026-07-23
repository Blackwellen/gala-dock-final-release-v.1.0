import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { VenuesClient, type VenueRow, type VenuesKpis } from "./VenuesClient";
import { composeLocation, formatDate } from "./lib";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Venues + their category name, scoped to workspace, excluding soft-deleted.
  const { data: venues } = await supabase
    .from("venues")
    .select(
      `id, name, status, capacity, city, region, address_line1, postal_code,
       updated_at, created_at, is_preferred, is_verified, rating,
       response_time_hours, avg_spend_cents, last_used_at, best_fit_event_types,
       category:venue_categories ( name )`
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  // Primary contacts (one lookup, keyed by venue_id) for the preferred cards.
  const { data: contacts } = await supabase
    .from("venue_contacts")
    .select("venue_id, name, email, phone")
    .eq("workspace_id", workspaceId)
    .eq("is_primary", true);
  const contactByVenue = new Map((contacts ?? []).map((c) => [c.venue_id, c]));

  // Derive "last used" from the linked events (most recent start_at per venue)
  // as a fallback for venues that don't have last_used_at populated yet.
  const { data: eventLinks } = await supabase
    .from("events")
    .select("venue_id, start_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .not("venue_id", "is", null);

  const lastUsed = new Map<string, number>();
  for (const ev of eventLinks ?? []) {
    if (!ev.venue_id || !ev.start_at) continue;
    const t = new Date(ev.start_at).getTime();
    if (Number.isNaN(t)) continue;
    const prev = lastUsed.get(ev.venue_id);
    if (prev === undefined || t > prev) lastUsed.set(ev.venue_id, t);
  }

  const rows: VenueRow[] = (venues ?? []).map((v) => {
    const category = (v.category as { name: string } | null)?.name ?? null;
    const lu = v.last_used_at ?? (lastUsed.has(v.id) ? new Date(lastUsed.get(v.id)!).toISOString() : null);
    const contact = contactByVenue.get(v.id);
    return {
      id: v.id,
      name: v.name,
      category,
      location: composeLocation(v),
      city: v.city,
      capacity: v.capacity,
      status: v.status,
      isPreferred: v.is_preferred ?? v.status === "preferred",
      isVerified: v.is_verified ?? false,
      rating: v.rating != null ? Number(v.rating) : null,
      responseTimeHours: v.response_time_hours != null ? Number(v.response_time_hours) : null,
      avgSpendCents: v.avg_spend_cents,
      bestFitEventTypes: Array.isArray(v.best_fit_event_types) ? (v.best_fit_event_types as string[]) : [],
      contactName: contact?.name ?? null,
      contactEmail: contact?.email ?? null,
      contactPhone: contact?.phone ?? null,
      lastUsed: lu ? formatDate(lu) : "—",
      lastUsedAt: lu,
    };
  });

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
  const withCapacity = rows.filter((r) => r.capacity != null);
  const avgCapacity =
    withCapacity.length > 0
      ? Math.round(withCapacity.reduce((sum, r) => sum + (r.capacity ?? 0), 0) / withCapacity.length)
      : 0;
  const preferredRows = rows.filter((r) => r.isPreferred);
  const withRating = rows.filter((r) => r.rating != null);
  const avgRating = withRating.length > 0 ? withRating.reduce((s, r) => s + (r.rating ?? 0), 0) / withRating.length : 0;
  const withSpend = rows.filter((r) => r.avgSpendCents != null);
  const avgSpend = withSpend.length > 0 ? Math.round(withSpend.reduce((s, r) => s + (r.avgSpendCents ?? 0), 0) / withSpend.length) : 0;
  const recentlyUsed = rows.filter((r) => r.lastUsedAt && now.getTime() - new Date(r.lastUsedAt).getTime() < 1000 * 60 * 60 * 24 * 90).length;

  const kpis: VenuesKpis = {
    total: rows.length,
    activeThisYear: (eventLinks ?? []).filter((ev) => {
      if (!ev.start_at) return false;
      const t = new Date(ev.start_at).getTime();
      return !Number.isNaN(t) && t >= startOfYear;
    }).length,
    preferred: preferredRows.length,
    avgCapacity,
    avgRating,
    avgSpendCents: avgSpend,
    recentlyUsed,
    activeRelationships: rows.filter((r) => r.contactName).length,
  };

  // Unique category names (for filter tabs) preserving first-seen order.
  const categories = Array.from(
    new Set(rows.map((r) => r.category).filter((c): c is string => !!c))
  );

  return <VenuesClient venues={rows} kpis={kpis} categories={categories} />;
}
