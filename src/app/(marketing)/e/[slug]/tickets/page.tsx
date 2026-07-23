import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { r2PublicUrl } from "@/lib/storage/r2";
import { TicketSeatSelector } from "./TicketSeatSelector";

export const dynamic = "force-dynamic";

// Purchase step 1/2: choose tickets + section availability. Step 3 (review & pay) is
// /e/[slug]/checkout. Real inventory only — quantities/remaining come straight from
// ticket_types.quantity - sold, re-validated again server-side at checkout submission.
export default async function TicketSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("event_public_pages")
    .select("event_id, workspace_id, headline, hero_path, starts_at, ends_at, venue_name, city, category")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) notFound();

  const { data: tickets } = await supabase
    .from("ticket_types")
    .select("id, name, description, price_cents, currency, quantity, sold, status")
    .eq("event_id", page.event_id)
    .eq("status", "on_sale")
    .order("price_cents", { ascending: true });

  const tiers = (tickets ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    priceCents: t.price_cents,
    currency: t.currency,
    remaining: t.quantity != null ? Math.max(0, t.quantity - t.sold) : null,
    soldOut: t.quantity != null ? t.quantity - t.sold <= 0 : false,
  }));

  const sections = (tickets ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    remaining: t.quantity != null ? Math.max(0, t.quantity - t.sold) : null,
    capacity: t.quantity,
    priceCents: t.price_cents,
  }));

  return (
    <div className="bg-surface-50 min-h-screen">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {/* Step indicator */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <ol className="flex items-center gap-2 text-sm">
            <li className="flex items-center gap-2 font-semibold text-brand-700">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-xs text-white">1</span>
              Choose Tickets
            </li>
            <span className="h-px w-8 bg-surface-200" />
            <li className="flex items-center gap-2 text-surface-400">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-surface-300 text-xs">2</span>
              Review &amp; Pay
            </li>
          </ol>
          <p className="flex items-center gap-1.5 text-xs text-surface-500">
            <ShieldCheck className="w-3.5 h-3.5 text-success-600" /> Secure checkout · your data is protected
          </p>
        </div>

        {/* Event summary */}
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-surface-200 bg-white p-4">
          <div className="h-16 w-16 shrink-0 rounded-lg bg-gradient-to-br from-brand-600 to-indigo-700 overflow-hidden">
            {r2PublicUrl(page.hero_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r2PublicUrl(page.hero_path)!} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-surface-900 truncate">{page.headline ?? "Event"}</h1>
            <p className="text-sm text-surface-500">
              {page.starts_at
                ? new Date(page.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                : "Date TBC"}
              {(page.venue_name || page.city) ? ` · ${[page.venue_name, page.city].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
          <Link href={`/e/${slug}`} className="ml-auto shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700">
            Event details
          </Link>
        </div>

        <TicketSeatSelector slug={slug} tiers={tiers} sections={sections} />
      </div>
    </div>
  );
}
