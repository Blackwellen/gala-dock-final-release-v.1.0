import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import "@/styles/checkout.css";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { CHECKOUT_COOKIE, summarise } from "@/lib/checkout";
import type { MapEl } from "@/app/provider/venues/_components/venue-map";
import { CheckoutClient } from "./client";

export const metadata: Metadata = { title: "Checkout" };
const PALETTE = ["#2f6bff", "#e08a00", "#7c4dff", "#16a46c", "#e0398b", "#0ea5c6"];

/** BUY-W01 · Ticket checkout: choose seats or quantities, reserve for 10 minutes, pay with Stripe. Accepts an event slug or id; ?tier=&qty= preselects. */
export default async function Checkout(props: PageProps<"/checkout/[event]">) {
  const { event: key } = await props.params;
  const sp = await props.searchParams;
  const sb = untyped(await createClient());
  const isId = /^[0-9a-f-]{36}$/i.test(key);
  const { data: ev } = await sb.from("events").select("id,name,slug,starts_at,ends_at,venue_name,city,location,cover_image,status,visibility,currency,settings").eq(isId ? "id" : "slug", key).maybeSingle();
  if (!ev || ev.visibility !== "public" || !["published", "on_sale", "live"].includes(ev.status)) notFound();
  const [{ data: tiers }, { data: seats }, { data: plan }, { data: fee }, { data: { user } }, { data: resale }] = await Promise.all([
    sb.from("ticket_tiers").select("id,name,description,kind,price,quantity,sold,held,order_limit,status,sale_start,sale_end,color,badge,sort").eq("event_id", ev.id).neq("status", "hidden").order("sort"),
    sb.from("event_seats").select("seat_key,tier_id,accessible,status").eq("event_id", ev.id),
    sb.rpc("public_event_plan", { p_event: ev.id }),
    sb.rpc("ticket_fee_config"),
    sb.auth.getUser(),
    sb.rpc("resale_listings", { p_event: ev.id }),
  ]);
  const seatedTiers = new Set((seats ?? []).map((s: { tier_id: string | null }) => s.tier_id).filter(Boolean));
  const now = requestTime();
  const tierList = (tiers ?? []).map((t: { id: string; name: string; description: string; kind: string; price: number; quantity: number; sold: number; held: number; order_limit: number; status: string; sale_start: string | null; sale_end: string | null; color: string | null; badge: string | null }, i: number) => ({
    id: t.id, name: t.name, description: t.description, price: Number(t.price), remaining: Math.max(0, t.quantity - t.sold - t.held), limit: t.order_limit, seated: seatedTiers.has(t.id), badge: t.badge,
    color: t.color && t.color !== "#5b5bff" ? t.color : PALETTE[i % PALETTE.length],
    onSale: t.status === "on_sale" && (!t.sale_start || new Date(t.sale_start).getTime() <= now) && (!t.sale_end || new Date(t.sale_end).getTime() > now),
    note: t.status === "sold_out" ? "Sold out" : t.sale_start && new Date(t.sale_start).getTime() > now ? `On sale ${new Date(t.sale_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : t.status !== "on_sale" ? "Not on sale" : null,
  }));
  const token = (await cookies()).get(CHECKOUT_COOKIE(ev.id))?.value;
  const existing = token ? await summarise(ev.id, token, sb) : null;
  const p = (plan ?? { overlay: [], base: [] }) as { overlay: MapEl[]; base: MapEl[] };
  const presetTier = typeof sp.tier === "string" ? sp.tier : null, presetQty = Math.min(20, Math.max(1, Number(sp.qty) || 1));
  return <CheckoutClient event={{ id: ev.id, name: ev.name, slug: ev.slug || ev.id, startsAt: ev.starts_at, endsAt: ev.ends_at, venue: ev.venue_name || ev.location, city: ev.city, cover: ev.cover_image }}
    tiers={tierList} seats={(seats ?? []).map((s: { seat_key: string; tier_id: string | null; accessible: boolean; status: string }) => ({ key: s.seat_key, tier_id: s.tier_id, accessible: s.accessible, status: s.status as "available" }))}
    overlay={Array.isArray(p.overlay) ? p.overlay : []} base={Array.isArray(p.base) ? p.base : []} fee={(fee ?? { fixed: 0, pct_bps: 0 }) as { fixed: number; pct_bps: number }}
    user={user ? { email: user.email ?? "" } : null} preset={presetTier ? { tier: presetTier, qty: presetQty } : null}
    resale={((resale ?? []) as { id: string; tier: string; tier_id: string; seat: string | null; price: number }[]).map(r => ({ ...r, price: Number(r.price) }))} startResale={sp.resale === "1"}
    existing={existing && existing.lines.length && existing.expiresAt && new Date(existing.expiresAt).getTime() > now ? existing : null} cancelled={!!sp.cancelled} />;
}
