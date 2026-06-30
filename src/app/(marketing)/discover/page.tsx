import Link from "next/link";
import type { Metadata } from "next";
import { CalendarRange, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discover events",
  description: "Find and book upcoming events on Gala Dock.",
};

// 15-9 / V2-8: public events directory + calendar. Lists PUBLISHED public pages (anon-readable via
// RLS) across organizers. Each links to its public event page (/e/[slug]).
export default async function DiscoverPage() {
  const supabase = await createClient();
  const { data: pages } = await supabase
    .from("event_public_pages")
    .select("slug, headline, summary, starts_at, city, country, category")
    .eq("published", true)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(100);

  const list = pages ?? [];

  function fmt(d: string | null) {
    if (!d) return "Date TBC";
    return new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }

  return (
    <div className="bg-surface-50">
      <header className="bg-[#0e0c27] text-white">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-3xl font-bold tracking-tight">Discover events</h1>
          <p className="mt-2 text-white/70">Upcoming events on Gala Dock — find one and grab your spot.</p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {list.length === 0 ? (
          <div className="rounded-xl border border-surface-200 bg-white p-10 text-center text-surface-500">
            No public events listed yet. Check back soon.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {list.map((p) => (
              <Link
                key={p.slug}
                href={`/e/${p.slug}`}
                className="group rounded-2xl border border-surface-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-24 bg-gradient-to-br from-brand-600 to-indigo-700" />
                <div className="p-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-brand-600">
                    <CalendarRange className="w-3.5 h-3.5" />
                    {fmt(p.starts_at)}
                  </div>
                  <h2 className="mt-1.5 text-base font-semibold text-surface-900 group-hover:text-brand-700">
                    {p.headline ?? "Event"}
                  </h2>
                  {p.summary && <p className="mt-1 text-sm text-surface-500 line-clamp-2">{p.summary}</p>}
                  {(p.city || p.country) && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-surface-400">
                      <MapPin className="w-3 h-3" /> {[p.city, p.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-surface-400">Powered by Gala Dock</p>
      </div>
    </div>
  );
}
