import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { calendar, directory, facets, type Directory } from "@/lib/public/directory";
import type { DirectoryViewProps } from "@/components/public/directory-view";

const TZ = "Europe/London";
const PAGE = 12;
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** Builds the directory page model for /events, /events/in/[city] and /events/category/[category]. */
export async function loadDirectory(scope: "all" | "city" | "category", key: string | null, sp: Record<string, string | undefined>, copy: { heading: string; eyebrow: string; intro: string; place: string; basePath: string }) {
  const sb = (await createClient()) as unknown as SupabaseClient;
  const range = (["today", "weekend", "month"].includes(sp.when ?? "") ? sp.when : "upcoming") as DirectoryViewProps["range"];
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(50, Number.parseInt(sp.page ?? "1", 10) || 1));
  const now = new Date();
  const mAnchor = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? `${sp.m}-01` : `${ymd(now).slice(0, 7)}-01`;
  const [y, m] = mAnchor.split("-").map(Number) as [number, number];
  const shift = (k: number) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const nextWeekend = ymd(new Date(now.getTime() + 7 * 864e5));

  const win = range === "upcoming" ? null : await calendar(sb, range, null, scope, key, 100);
  // Search runs over the listed set (names / venue / city); the directory read has no text filter, so q pages in memory.
  let dir: Directory;
  if (q) {
    const all = await directory(sb, scope, key, { from: win?.from ?? null, to: win?.to ?? null, limit: 100, offset: 0 });
    const hit = all.events.filter(e => `${e.name} ${e.venue_name ?? ""} ${e.city ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    dir = { total: hit.length, events: hit.slice((page - 1) * PAGE, page * PAGE), featured: all.featured };
  } else dir = await directory(sb, scope, key, { from: win?.from ?? null, to: win?.to ?? null, limit: PAGE, offset: (page - 1) * PAGE });

  const [f, month, today, weekend, nextWk, thisMonth, { data: { user } }] = await Promise.all([
    facets(sb), calendar(sb, "month", mAnchor, scope, key, 100), calendar(sb, "today", null, scope, key, 1), calendar(sb, "weekend", null, scope, key, 1),
    calendar(sb, "weekend", nextWeekend, scope, key, 1), calendar(sb, "month", null, scope, key, 1), sb.auth.getUser(),
  ]);
  let following = false;
  if (user && (scope === "city" || scope === "category") && key) {
    const { data } = await sb.from("follows").select("subject_key").eq("subject_kind", scope).eq("subject_key", key.toLowerCase()).maybeSingle();
    following = !!data;
  }
  const base = copy.basePath;
  const props: DirectoryViewProps = {
    ...copy, dir, facets: f, q, range, page, pageSize: PAGE,
    activeCategory: scope === "category" ? key : null, activeCity: scope === "city" ? key : null,
    month: { anchor: mAnchor.slice(0, 7), prev: shift(-1), next: shift(1), days: month?.days ?? [],
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) },
    popular: [
      { label: "Today", href: `${base}?when=today`, count: today?.total ?? 0 },
      { label: "This weekend", href: `${base}?when=weekend`, count: weekend?.total ?? 0 },
      { label: "Next weekend", href: `/events/calendar?range=weekend&date=${nextWeekend}${scope === "city" && key ? `&city=${key}` : ""}`, count: nextWk?.total ?? 0 },
      { label: "This month", href: `${base}?when=month`, count: thisMonth?.total ?? 0 },
    ],
    follow: (scope === "city" || scope === "category") && key ? { kind: scope, subject: key, following, signedIn: !!user } : null,
    // Hero: a real event photo from this listing when one exists, else the shared discovery photo (never a generated image).
    hero: dir.events.find(e => e.cover_image)?.cover_image ?? "/assets/gd/hero-discover.webp",
  };
  return props;
}
