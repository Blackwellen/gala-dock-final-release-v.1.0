"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCustomer } from "@/lib/data/context";
import type { ActionResult } from "./shell";

const Stars = z.number().int().min(1).max(5);
const Input = z.object({ item: z.string().uuid(), ratings: z.object({ overall: Stars, quality: Stars, communication: Stars, value: Stars, reliability: Stars }), body: z.string().trim().min(20).max(1000), photos: z.array(z.string().max(200)).max(5), confirm: z.literal(true) });

export async function submitReview(input: unknown): Promise<ActionResult> {
  const p = Input.safeParse(input);
  if (!p.success) { const f = p.error.issues[0]?.path[0]; return { ok: false, error: f === "body" ? "Write at least 20 characters about your experience." : f === "confirm" ? "Please confirm the review is based on your genuine experience." : f === "ratings" ? "Rate every category." : "Check your review." }; }
  const ctx = await getCustomer(); const { overall, ...rest } = p.data.ratings;
  const { error } = await ctx.supabase.rpc("submit_review", { p_item: p.data.item, p_rating: overall, p_ratings: rest, p_body: p.data.body, p_photos: p.data.photos });
  if (error) return { ok: false, error: error.message.includes("event_not_ended") ? "You can review once the event has taken place." : error.message.includes("not_completed") ? "Only completed bookings can be reviewed." : error.message.includes("edit_window_closed") ? "Reviews can only be edited for 30 days." : error.message.includes("invalid_photos") ? "One of the photos couldn't be attached." : error.message.includes("not_authorized") ? "You can only review your own bookings." : "Could not submit your review." };
  revalidatePath("/account/reviews"); return { ok: true, message: "Thanks — your review is live and helps others plan.", redirect: "/account/reviews?tab=submitted" };
}
export async function deleteReview(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Review not found." };
  const ctx = await getCustomer();
  const { error } = await ctx.supabase.rpc("delete_my_review", { p_review: id });
  if (error) return { ok: false, error: "Could not delete the review." };
  revalidatePath("/account/reviews"); return { ok: true, message: "Review deleted." };
}
