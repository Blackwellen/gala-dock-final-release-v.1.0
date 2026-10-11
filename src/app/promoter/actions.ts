"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped, isUuid } from "@/lib/workspace/db";

/** Records the promoter's preferred payout method (ownership is enforced by promoter_set_payout_method + RLS). */
export async function setPayoutMethod(promoterId: string, method: string | null) {
  if (!isUuid(promoterId) || (method !== null && !["bank_transfer", "paypal", "stripe"].includes(method))) return { ok: false, error: "Invalid request." };
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const { error } = await sb.rpc("promoter_set_payout_method", { p_promoter: promoterId, p_method: method });
  if (error) return { ok: false, error: error.message.includes("not_allowed") ? "You can only change your own payout settings." : "Couldn’t save — please try again." };
  revalidatePath("/promoter", "layout");
  return { ok: true };
}
