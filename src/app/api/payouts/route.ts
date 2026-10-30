import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { countryByName } from "@/lib/onboarding-schema";
import { payoutStatus, stripe, stripeKey, stripeMode } from "@/lib/stripe";
import { idForMode, isStaleAccountError } from "@/lib/payments/stripe-mode";
import { clearStaleAccountLink, syncConnectAccount, type StripeAccount } from "@/lib/commerce/connect";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** The owner's workspace of this kind: the one they are working in (profiles.last_workspace_id) when they own it, else the newest
 *  still-onboarding one (the onboarding wizard). Owners of several venues / companies get the payouts of the workspace on screen. */
async function ownedWorkspace(kind: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasRequiredAssurance(supabase)) || (kind !== "organizer" && kind !== "provider")) return null;
  const COLS = "id,kind,settings,stripe_account_id,stripe_account_id_live";
  const { data: profile } = await supabase.from("profiles").select("last_workspace_id").eq("id", user.id).maybeSingle();
  if (profile?.last_workspace_id) {
    const { data: current } = await supabase.from("workspaces").select(COLS).eq("id", profile.last_workspace_id).eq("owner_id", user.id).eq("kind", kind).eq("status", "active").maybeSingle();
    if (current) return { user, workspace: current };
  }
  const { data } = await supabase.from("workspaces").select(COLS).eq("owner_id", user.id).eq("kind", kind).eq("status", "active")
    .order("onboarding_complete", { ascending: true }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { user, workspace: data } : null;
}

/** Starts or resumes Stripe-hosted payout onboarding. No bank details touch Gala Dock. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const body = await request.json().catch(() => ({})) as { kind?: string; step?: number; from?: string };
  const owned = await ownedWorkspace(body.kind ?? null);
  if (!owned) return json({ error: "Save your workspace details first." }, 403);
  if (!stripeKey()) return json({ error: "Payouts are not configured for this environment yet.", unavailable: true }, 503);
  if (!(await rateLimit(`payouts:${owned.user.id}`, 10, 300))) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
  const { workspace, user } = owned;
  const settings = workspace.settings as Record<string, Record<string, unknown>>;
  const country = countryByName((settings.organisation ?? settings.business)?.country).code;
  try {
    // Go-live (lane A2): the connected account of the CURRENT mode only — a test-mode acct_ never exists in live, so live onboarding
    // creates a fresh live account and stores it in stripe_account_id_live (the test id stays untouched for rollback).
    const mode = stripeMode();
    if (mode === "unconfigured") return json({ error: "Payouts are not configured for this environment yet.", unavailable: true }, 503);
    let accountId = idForMode(mode, { test: workspace.stripe_account_id, live: workspace.stripe_account_id_live });
    // A stored id the current key can't see (old sandbox / other platform) counts as "not set up": clear it and start fresh.
    if (accountId) {
      try { await stripe(`accounts/${accountId}`); }
      catch (e) { if (!isStaleAccountError(e)) throw e; await clearStaleAccountLink(workspace.id, mode, accountId, "payouts.setup"); accountId = null; }
    }
    if (!accountId) {
      const account = await stripe<{ id: string }>("accounts", {
        // Direct-charge seller (Q07, card 125): the seller is merchant of record, pays Stripe's fees and bears its own
        // negative balances (losses collected by Stripe), uses the full Stripe Dashboard, and Stripe collects KYC.
        country, email: user.email ?? "",
        "controller[fees][payer]": "account", "controller[losses][payments]": "stripe",
        "controller[stripe_dashboard][type]": "full", "controller[requirement_collection]": "stripe",
        "capabilities[card_payments][requested]": "true", "capabilities[transfers][requested]": "true",
        "metadata[workspace_id]": workspace.id,
      });
      accountId = account.id;
      // Stores the id in the mode's column (stripe_account_id / stripe_account_id_live) and the per-mode payout shadow.
      await createAdminClient().rpc("stripe_workspace_payout_sync" as never, { p_workspace: workspace.id, p_livemode: mode === "live", p_status: "incomplete", p_account: accountId } as never);
    }
    const origin = new URL(request.url).origin;
    const back = `${origin}/api/payouts?kind=${workspace.kind}&step=${body.step === 3 ? 3 : 4}${body.from === "money" ? "&from=money" : ""}`;
    const link = await stripe<{ url: string }>("account_links", { account: accountId, refresh_url: back, return_url: back, type: "account_onboarding" });
    return json({ url: link.url });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return json({ error: code === "country_unsupported" ? "Stripe payouts aren’t available in this country yet." : "Stripe could not start payout setup. Please try again later." }, 502);
  }
}

/** Return/refresh URL from Stripe: re-reads the account and stores the real status server-side. */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const step = request.nextUrl.searchParams.get("step") === "3" ? 3 : 4;
  const owned = await ownedWorkspace(kind);
  if (!owned) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/onboarding/${kind === "provider" ? "provider" : "organizer"}?step=${step}`)}`, request.url));
  let status = "not_connected";
  const mode = stripeMode();
  const accountId = idForMode(mode, { test: owned.workspace.stripe_account_id, live: owned.workspace.stripe_account_id_live });
  if (accountId && mode !== "unconfigured") {
    try {
      const account = await stripe<StripeAccount>(`accounts/${accountId}`);
      await syncConnectAccount({ ...account, metadata: { ...account.metadata, workspace_id: owned.workspace.id } }, mode);
      status = payoutStatus(account as never);
    } catch (e) {
      if (isStaleAccountError(e)) { await clearStaleAccountLink(owned.workspace.id, mode, accountId, "payouts.return").catch(() => {}); status = "not_connected"; }
      else status = "error";
    }
  }
  // Started from Money (an existing workspace) → back to Money; started from the onboarding wizard → back to its payouts step.
  const fromMoney = request.nextUrl.searchParams.get("from") === "money";
  const destination = fromMoney ? (owned.workspace.kind === "organizer" ? "/organizer/money?tab=settlements" : "/provider/money?tab=overview")
    : owned.workspace.kind === "organizer" ? `/onboarding/organizer?step=3` : `/onboarding/provider?step=4`;
  return NextResponse.redirect(new URL(`${destination}&payouts=${status}`, request.url));
}
