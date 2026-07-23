import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-side consumer-account resolution helpers — the counterpart to src/lib/workspace.ts for
 * end customers (ticket buyers, event-builder users). Deliberately NOT workspace_role-based: a
 * customer is a lightweight auth.users + customers row, never a workspace member. See
 * supabase/migrations/20260716_consumer_marketplace_foundation.sql.
 */

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

export interface CustomerContext {
  user: User;
  customerId: string;
  customer: Customer;
}

/** Resolve the current user's customer row, creating one on first call (no separate signup step). */
export async function getOrCreateCustomer(): Promise<CustomerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return { user, customerId: existing.id, customer: existing };

  const { data: created, error } = await supabase
    .from("customers")
    .insert({ user_id: user.id, email: user.email ?? null })
    .select("*")
    .single();

  if (error || !created) return null;
  return { user, customerId: created.id, customer: created };
}

/** Require a logged-in customer. Redirects to /customer/login (with a return path) when unauthenticated. */
export async function requireCustomer(returnTo = "/account"): Promise<CustomerContext> {
  const ctx = await getOrCreateCustomer();
  if (!ctx) redirect(`/customer/login?next=${encodeURIComponent(returnTo)}`);
  return ctx;
}
