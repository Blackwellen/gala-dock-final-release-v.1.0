import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { untyped, one } from "@/lib/workspace/db";
import { refreshPartnerAccount, startPartnerOnboarding, type PartnerPayoutRow } from "@/lib/partners/payouts";

const COLS = "id,user_id,status,payout_country,stripe_account_id,stripe_account_id_live,payout_status,details";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** The signed-in user's own partner record (RLS: partners_read returns only the caller's row to non-admins). */
async function mine() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const partner = await one<PartnerPayoutRow>(untyped(supabase).from("partners").select(COLS).eq("user_id", user.id).neq("status", "terminated").limit(1).maybeSingle());
  return partner ? { supabase, user, partner } : null;
}

/** "Set up payouts": starts or resumes Stripe-hosted onboarding of the partner's no-dashboard connected account. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const m = await mine();
  if (!m) return json({ error: "Only Gala Dock partners can set up partner payouts." }, 403);
  if (!(await hasRequiredAssurance(m.supabase))) return json({ error: "Complete two-step verification first." }, 403);
  if (!(await rateLimit(`partner-payouts:${m.user.id}`, 10, 300))) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
  try {
    const r = await startPartnerOnboarding(m.partner, m.user.email ?? "", new URL(request.url).origin);
    return r.ok ? json({ url: r.url }) : json({ error: r.error }, r.status);
  } catch {
    return json({ error: "Stripe couldn’t start payout setup. Please try again later." }, 502);
  }
}

/** Return / refresh URL from Stripe: re-reads the account, stores the real status, back to the portal. */
export async function GET(request: NextRequest) {
  const m = await mine();
  if (!m) return NextResponse.redirect(new URL("/login?next=%2Fpartner%3Fview%3Dearnings", request.url));
  let status = "error";
  try { status = await refreshPartnerAccount(m.partner); } catch { /* shown as "couldn't confirm" */ }
  return NextResponse.redirect(new URL(`/partner?view=earnings&payouts=${status}#payouts`, request.url));
}
