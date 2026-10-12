"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { getOrganizer } from "@/lib/data/context";
import { can } from "@/lib/domain/permissions";
import { rateLimit } from "@/lib/security";
import type { Json } from "@/types/database";
import type { ActionResult } from "./shell";

const Buy = z.object({
  event_id: z.string().uuid(), product: z.string().regex(/^[a-z0-9_]{3,40}$/),
  starts_at: z.string().refine(v => !Number.isNaN(Date.parse(v))).nullable(),
  cities: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(5), categories: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(5),
});

/** Paid placement (§117–121): creates the boost (pending payment) and returns the Stripe Checkout URL. The platform keeps 100%;
 *  the webhook (or return-path reconcile) activates it, and the boost lifecycle job schedules/ends it. */
export async function buyBoost(input: unknown): Promise<ActionResult<string>> {
  const p = Buy.safeParse(input); if (!p.success) return { ok: false, error: "Check the start date and targeting." };
  const ctx = await getOrganizer();
  if (!can("organizer", ctx.role, "promotion.manage")) return { ok: false, error: "Only owners and managers can buy promotion." };
  if (!(await rateLimit(`boost:${ctx.user.id}`, 10, 600))) return { ok: false, error: "Too many attempts — try again in a few minutes." };
  if (p.data.starts_at && Date.parse(p.data.starts_at) < Date.now() - 6e4) return { ok: false, error: "Choose a start date from today onwards." };
  const { data: id, error } = await ctx.supabase.rpc("create_promotion_boost" as never, { p_event: p.data.event_id, p_product: p.data.product, p_starts_at: p.data.starts_at, p_targeting: { cities: p.data.cities, categories: p.data.categories } as Json } as never);
  if (error || !id) {
    const m = error?.message ?? "";
    return { ok: false, error: m.includes("not_public") || m.includes("status") ? "Publish the event (public, on sale) before boosting it." : m.includes("not_authorized") ? "Only owners and managers can buy promotion." : "Couldn't create the boost." };
  }
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.galadock.com";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const { startPayment } = await import("@/lib/commerce/orchestrator");
  const r = await startPayment("platform_boost", { boostId: id as unknown as string }, origin, `/organizer/events/${p.data.event_id}/promotion?tab=boosts`);
  return r.ok ? { ok: true, data: r.url, message: "Taking you to secure payment…" } : { ok: false, error: r.error };
}
