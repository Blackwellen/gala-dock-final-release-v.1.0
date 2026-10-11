import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { countryByName } from "@/lib/onboarding-schema";
import { payoutStatus, stripe, stripeKey } from "@/lib/stripe";
import { syncConnectAccount, type StripeAccount } from "@/lib/commerce/connect";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function ownedWorkspace(kind: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasRequiredAssurance(supabase)) || (kind !== "organizer" && kind !== "provider")) return null;
  const { data } = await supabase.from("workspaces").select("id,kind,settings,stripe_account_id").eq("owner_id", user.id).eq("kind", kind).eq("status", "active")
    .order("onboarding_complete", { ascending: true }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { user, workspace: data } : null;
}

/** Starts or resumes Stripe-hosted payout onboarding. No bank details touch Gala Dock. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const body = await request.json().catch(() => ({})) as { kind?: string; step?: number };
  const owned = await ownedWorkspace(body.kind ?? null);
  if (!owned) return json({ error: "Save your workspace details first." }, 403);
  if (!stripeKey()) return json({ error: "Payouts are not configured for this environment yet.", unavailable: true }, 503);
  if (!(await rateLimit(`payouts:${owned.user.id}`, 10, 300))) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
  const { workspace, user } = owned;
  const settings = workspace.settings as Record<string, Record<string, unknown>>;
  const country = countryByName((settings.organisation ?? settings.business)?.country).code;
  try {
    let accountId = workspace.stripe_account_id;
    if (!accountId) {
      const account = await stripe<{ id: string }>("accounts", {
        type: "express", country, email: user.email ?? "",
        "capabilities[transfers][requested]": "true", "capabilities[card_payments][requested]": "true",
        "metadata[workspace_id]": workspace.id,
      });
      accountId = account.id;
      await createAdminClient().from("workspaces").update({ stripe_account_id: accountId, payout_status: "incomplete" }).eq("id", workspace.id);
    }
    const origin = new URL(request.url).origin;
    const back = `${origin}/api/payouts?kind=${workspace.kind}&step=${body.step === 3 ? 3 : 4}`;
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
  if (owned.workspace.stripe_account_id) {
    try {
      const account = await stripe<StripeAccount>(`accounts/${owned.workspace.stripe_account_id}`);
      await syncConnectAccount({ ...account, metadata: { ...account.metadata, workspace_id: owned.workspace.id } });
      status = payoutStatus(account as never);
    } catch { status = "error"; }
  }
  const destination = owned.workspace.kind === "organizer" ? `/onboarding/organizer?step=3` : `/onboarding/provider?step=4`;
  return NextResponse.redirect(new URL(`${destination}&payouts=${status}`, request.url));
}
