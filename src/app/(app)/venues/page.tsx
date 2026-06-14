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
       updated_at, created_at,
       category:venue_categories ( name )`
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  // Derive "last used" from the linked events (most recent start_at per venue).
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
    const lu = lastUsed.get(v.id);
    return {
      id: v.id,
      name: v.name,
      category,
      location: composeLocation(v),
      capacity: v.capacity,
      status: v.status,
      lastUsed: lu ? formatDate(new Date(lu).toISOString()) : "—",
    };
  });

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
  const withCapacity = rows.filter((r) => r.capacity != null);
  const avgCapacity =
    withCapacity.length > 0
      ? Math.round(
          withCapacity.reduce((sum, r) => sum + (r.capacity ?? 0), 0) /
            withCapacity.length
        )
      : 0;
  const kpis: VenuesKpis = {
    total: rows.length,
    activeThisYear: (eventLinks ?? []).filter((ev) => {
      if (!ev.start_at) return false;
      const t = new Date(ev.start_at).getTime();
      return !Number.isNaN(t) && t >= startOfYear;
    }).length,
    preferred: rows.filter((r) => r.status === "preferred").length,
    avgCapacity,
  };

  // Unique category names (for filter tabs) preserving first-seen order.
  const categories = Array.from(
    new Set(rows.map((r) => r.category).filter((c): c is string => !!c))
  );

  return <VenuesClient venues={rows} kpis={kpis} categories={categories} />;
}
