import { redirect } from "next/navigation";
import { getSessionUser, getActiveWorkspaceId } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { summariseEarnings } from "@/lib/affiliate/commission";
import { AffiliateHub, type AffiliateHubData, type SubAffiliate } from "@/app/event-manager/settings/affiliate/AffiliateHub";
import { AffiliateDashboardShell } from "./AffiliateDashboardShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliate Dashboard" };

const SITE = "https://galadock.com";

// Standalone affiliate dashboard — deliberately outside the event-manager shell (no workspace
// sidebar/settings nav), and the affiliate identity itself is standalone (affiliate_accounts.user_id),
// independent of any operator workspace — an affiliate never appears in the workspace switcher.
// Legacy accounts created before the standalone-identity migration (workspace_id only, no user_id)
// still resolve via the active workspace as a fallback so nothing existing breaks.
export default async function AffiliateDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/affiliate/login");

  const supabase = await createClient();

  let { data: account } = await supabase
    .from("affiliate_accounts")
    .select("id, override_rate_pct, recruit_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    const workspaceId = await getActiveWorkspaceId();
    if (workspaceId) {
      const legacy = await supabase
        .from("affiliate_accounts")
        .select("id, override_rate_pct, recruit_code")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      account = legacy.data;
    }
  }

  let data: AffiliateHubData;

  if (!account) {
    data = {
      enrolled: false,
      referralLink: "",
      recruitLink: "",
      overrideRatePct: 5,
      clicks: 0,
      conversions: 0,
      directEarnedCents: 0,
      overrideEarnedCents: 0,
      subAffiliates: [],
    };
  } else {
    const [{ data: link }, { data: conversions }, { data: overrides }, { data: subs }] = await Promise.all([
      supabase
        .from("affiliate_links")
        .select("code")
        .eq("account_id", account.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase.from("affiliate_conversions").select("commission_amount_cents, status").eq("account_id", account.id),
      supabase
        .from("affiliate_overrides")
        .select("amount_cents, status, child_account_id")
        .eq("parent_account_id", account.id),
      supabase
        .from("affiliate_accounts")
        .select("id, override_rate_pct, workspace:workspaces(name)")
        .eq("parent_account_id", account.id),
    ]);

    const directEarned = summariseEarnings(
      (conversions ?? []).map((c) => ({ amountCents: c.commission_amount_cents, status: c.status }))
    ).totalCents;
    const overrideEarned = summariseEarnings(
      (overrides ?? []).map((o) => ({ amountCents: o.amount_cents, status: o.status }))
    ).totalCents;

    const earnedByChild = new Map<string, number>();
    for (const o of overrides ?? []) {
      if (o.status === "void") continue;
      earnedByChild.set(o.child_account_id, (earnedByChild.get(o.child_account_id) ?? 0) + o.amount_cents);
    }

    const subAffiliates: SubAffiliate[] = (subs ?? []).map((s) => {
      const ws = s.workspace as unknown as { name: string } | null;
      return {
        id: s.id,
        name: ws?.name ?? "Affiliate",
        overrideRatePct: Number(s.override_rate_pct ?? 0),
        earnedCents: earnedByChild.get(s.id) ?? 0,
      };
    });

    data = {
      enrolled: true,
      referralLink: link?.code ? `${SITE}/r/${link.code}` : `${SITE}/r/${account.recruit_code}`,
      recruitLink: `${SITE}/affiliate?recruit=${account.recruit_code}`,
      overrideRatePct: Number(account.override_rate_pct ?? 5),
      clicks: 0,
      conversions: (conversions ?? []).length,
      directEarnedCents: directEarned,
      overrideEarnedCents: overrideEarned,
      subAffiliates,
    };
  }

  return (
    <AffiliateDashboardShell email={user.email ?? ""}>
      <AffiliateHub data={data} />
    </AffiliateDashboardShell>
  );
}
