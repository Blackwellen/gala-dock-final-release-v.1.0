"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/customer";
import { createAdminClient } from "@/lib/supabase/admin";

/** Link past guest-checkout ticket orders that match this customer's email — one-time claim. */
export async function claimPastOrders() {
  const { customer } = await requireCustomer();
  if (!customer.email) return;

  const admin = createAdminClient();
  await admin
    .from("ticket_orders")
    .update({ customer_id: customer.id })
    .is("customer_id", null)
    .eq("buyer_email", customer.email);

  revalidatePath("/account/tickets");
}
