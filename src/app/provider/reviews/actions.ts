"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import type { ActionResult } from "@/lib/workspace/rpc";
import { reviewReplyError, reviewReplyProblem } from "@/lib/profiles/rules";

/** Q62 / Q49: post or edit the workspace's single public reply to a review (respond_to_review: owner/manager, published reviews only). */
export async function replyToReview(reviewId: string, fd: FormData): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return { ok: false, error: reviewReplyError("not_found") };
  const body = String(fd.get("body") ?? "");
  const problem = reviewReplyProblem(body); if (problem) return { ok: false, error: problem };
  const { db, can } = await getProvider();
  if (!can.manage) return { ok: false, error: reviewReplyError("not_authorized") };
  const { error } = await db.rpc("respond_to_review", { p_review: reviewId, p_body: body.trim() });
  if (error) return { ok: false, error: reviewReplyError(error.message) };
  revalidatePath("/provider/reviews");
  return { ok: true, message: "Reply saved — it shows under the review on your public page." };
}
