import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-redirect";

export const dynamic = "force-dynamic";

type PortalHint = "operator" | "customer" | "affiliate" | null;

/**
 * Single trusted post-auth destination resolver. Every login surface
 * (/operator/login, /customer/login, /affiliate/login, /accept-invite, legacy
 * /login) sends the user here instead of guessing a destination client-side.
 *
 * Priority order:
 *   1. An explicit, safe ?next= — e.g. a deep link the user was trying to reach.
 *   2. An incomplete onboarding session for the hinted portal — resume it.
 *   3. Existing access for the hinted portal (or, with no hint, whichever
 *      access the account actually has) — route straight to that surface.
 *   4. No access at all for the hinted portal — send to the right onboarding
 *      start (or the customer/affiliate signup entry point).
 */
export default async function AuthResolvePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; portal?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/operator/login");
  }

  const explicitNext = safeNext(params.next);
  if (explicitNext) redirect(explicitNext);

  const portal: PortalHint =
    params.portal === "operator" || params.portal === "customer" || params.portal === "affiliate"
      ? (params.portal as PortalHint)
      : null;

  // Resolve every access type in parallel — cheap, and lets us fall back
  // gracefully when no portal hint was given (e.g. a bare /auth/resolve hit).
  const [{ data: onboardingSession }, { data: membership }, { data: customer }, { data: affiliate }] =
    await Promise.all([
      supabase
        .from("onboarding_sessions")
        .select("id, portal_type, current_step")
        .eq("user_id", user.id)
        .eq("portal_type", "event_manager")
        .not("status", "in", "(completed,abandoned)")
        .maybeSingle(),
      supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("affiliate_accounts").select("id").eq("user_id", user.id).maybeSingle(),
    ]);

  if (portal === "customer") {
    if (customer) redirect("/account");
    redirect("/onboarding/customer");
  }

  if (portal === "affiliate") {
    if (affiliate) redirect("/affiliate/dashboard");
    redirect("/affiliate/apply");
  }

  if (portal === "operator" || portal === null) {
    if (onboardingSession) {
      redirect(`/onboarding/${onboardingSession.current_step ?? "account"}`);
    }
    if (membership) redirect("/event-manager/home");
    if (portal === "operator") redirect("/onboarding/account");
  }

  // No portal hint and no operator access — fall back to whichever access
  // the account does have, in priority order, before giving up.
  if (customer) redirect("/account");
  if (affiliate) redirect("/affiliate/dashboard");

  redirect("/onboarding/account");
}
