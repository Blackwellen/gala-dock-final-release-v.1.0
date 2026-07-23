import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { r2PublicUrl } from "@/lib/storage/r2";
import { CheckoutForm } from "./CheckoutForm";
import { type PriceLine } from "../pricing";

export const dynamic = "force-dynamic";

function parseLines(t?: string | string[]): { ticketTypeId: string; quantity: number }[] {
  const raw = Array.isArray(t) ? t : t ? [t] : [];
  return raw
    .map((entry) => {
      const [id, qtyStr] = entry.split(":");
      const quantity = Math.max(1, Math.min(20, Math.floor(Number(qtyStr) || 0)));
      return id ? { ticketTypeId: id, quantity } : null;
    })
    .filter((v): v is { ticketTypeId: string; quantity: number } => Boolean(v));
}

// Purchase step 3: review & pay. Prices shown here are re-derived from the real ticket_types
// rows (never trusted from the query string) so the on-screen total always matches what
// submitCheckout() will actually charge.
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const lines = parseLines(t);
  if (!lines.length) redirect(`/e/${slug}/tickets`);

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("event_public_pages")
    .select("event_id, headline, hero_path, starts_at, venue_name, city")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) notFound();

  const { data: types } = await supabase
    .from("ticket_types")
    .select("id, name, price_cents, currency, status, quantity, sold, event_id")
    .in("id", lines.map((l) => l.ticketTypeId));

  const priceLines: PriceLine[] = [];
  for (const l of lines) {
    const tt = (types ?? []).find((t2) => t2.id === l.ticketTypeId);
    if (!tt || tt.event_id !== page.event_id || tt.status !== "on_sale") continue;
    priceLines.push({ ticketTypeId: tt.id, name: tt.name, unitPriceCents: tt.price_cents, quantity: l.quantity });
  }
  if (!priceLines.length) redirect(`/e/${slug}/tickets`);

  const currency = types?.[0]?.currency ?? "GBP";

  return (
    <div className="bg-surface-50 min-h-screen">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <ol className="mb-6 flex items-center gap-2 text-sm">
          {["Your Details", "Billing", "Payment", "Review"].map((step, i) => (
            <li key={step} className="flex items-center gap-2 text-surface-400">
              {i > 0 && <span className="h-px w-6 bg-surface-200" />}
              <span className={i === 0 ? "font-semibold text-brand-700" : ""}>
                <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full border border-surface-300 text-[11px]">
                  {i + 1}
                </span>
                {step}
              </span>
            </li>
          ))}
        </ol>

        <div className="mb-6 flex items-center gap-4 rounded-xl border border-surface-200 bg-white p-4">
          <div className="h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-brand-600 to-indigo-700 overflow-hidden">
            {r2PublicUrl(page.hero_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r2PublicUrl(page.hero_path)!} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div>
            <h1 className="font-semibold text-surface-900">{page.headline ?? "Event"}</h1>
            <p className="text-sm text-surface-500">
              {page.starts_at ? new Date(page.starts_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Date TBC"}
              {(page.venue_name || page.city) ? ` · ${[page.venue_name, page.city].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
        </div>

        <CheckoutForm slug={slug} lines={priceLines} currency={currency} />
      </div>
    </div>
  );
}
