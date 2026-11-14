"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { getOrganizer } from "@/lib/data/context";
import { can } from "@/lib/domain/permissions";
import { rateLimit } from "@/lib/security";
import { boostStartIso } from "@/lib/ads/flight";
import type { Json } from "@/types/database";
import type { ActionResult } from "./shell";

const Buy = z.object({
  event_id: z.string().uuid(), product: z.string().regex(/^[a-z0-9_]{3,40}$/),
  // Q56: a London calendar day (YYYY-MM-DD); today or empty = start now.
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cities: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(5), categories: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(5),
});

const BUY_ERR: [RegExp, string][] = [
  [/not_public|event_not_public/, "Publish the event (public, on sale) before boosting it."],
  [/not_authorized/, "Only owners and managers can buy promotion."],
  [/event_too_soon/, "This event starts too soon (or has ended) for a boost to run. Choose an earlier start date or a later event."],
  [/workspace_suspended/, "Promotion is unavailable while this workspace is suspended."],
  [/unknown_product/, "That boost isn’t on sale any more."],
];

/** Paid placement (§117–121): creates the boost (pending payment) and returns the Stripe Checkout URL. The platform keeps 100%;
 *  the webhook (or return-path reconcile) activates it, and the boost lifecycle job schedules/ends it. Retrying reuses the open boost. */
export async function buyBoost(input: unknown): Promise<ActionResult<string>> {
  const p = Buy.safeParse(input); if (!p.success) return { ok: false, error: "Check the start date and targeting." };
  const ctx = await getOrganizer();
  if (!can("organizer", ctx.role, "promotion.manage")) return { ok: false, error: "Only owners and managers can buy promotion." };
  if (!(await rateLimit(`boost:${ctx.user.id}`, 10, 600))) return { ok: false, error: "Too many attempts — try again in a few minutes." };
  const startsAt = boostStartIso(p.data.starts_on);
  if (startsAt === undefined) return { ok: false, error: "Choose a valid start date." };
  const { data: id, error } = await ctx.supabase.rpc("create_promotion_boost" as never, { p_event: p.data.event_id, p_product: p.data.product, p_starts_at: startsAt, p_targeting: { cities: p.data.cities, categories: p.data.categories } as Json } as never);
  if (error || !id) return { ok: false, error: BUY_ERR.find(([re]) => re.test(error?.message ?? ""))?.[1] ?? "Couldn't create the boost." };
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.galadock.com";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const { startPayment } = await import("@/lib/commerce/orchestrator");
  const r = await startPayment("platform_boost", { boostId: id as unknown as string }, origin, `/organizer/events/${p.data.event_id}/promotion?tab=boosts`);
  return r.ok ? { ok: true, data: r.url, message: "Taking you to secure payment…" } : { ok: false, error: r.error };
}
