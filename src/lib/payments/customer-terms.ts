import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DEC-107 express term at the customer's first payment (playbook §4): the Payment Terms tick, recorded with version, user and
 * time (accept_payment_terms 'customer'). Demo/QA users are exempt by default (dec107_settings.exempt_demo_qa). Returns null when
 * the payment may proceed, or the version the customer must accept first.
 */
export async function customerTermsGate(sb: SupabaseClient, accept: { acceptTerms?: boolean; termsVersion?: string }, source: "checkout" | "booking_payment"): Promise<null | { termsRequired: true; termsVersion: string; error: string }> {
  const { data, error } = await sb.rpc("payment_terms_customer_required" as never);
  if (error || !data) return null;   // fail open only on the express-term check itself; payments still need Stripe + the seller backstop
  const r = data as { required: boolean; version: string };
  if (!r.required) return null;
  if (accept.acceptTerms && accept.termsVersion === r.version) {
    const { error: e } = await sb.rpc("accept_payment_terms" as never, { p_role: "customer", p_version: r.version, p_source: source } as never);
    if (!e) return null;
  }
  return { termsRequired: true, termsVersion: r.version, error: "Please read and accept the payment terms to continue." };
}
