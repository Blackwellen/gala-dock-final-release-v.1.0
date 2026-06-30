import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { AffiliateHub, type AffiliateHubData, type SubAffiliate } from "./AffiliateHub";
import { summariseEarnings } from "@/lib/affiliate/commission";

export const metadata = { title: "Affiliate Programme" };

const SITE = "https://galadock.com";

export default async function AffiliateSettingsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // The workspace's affiliate account (1:1). May not exist if not enrolled.
  const { data: account } = await supabase
    .from("affiliate_accounts")
    .select("id, override_rate_pct, recruit_code")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

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
      supabase
        .from("affiliate_conversions")
        .select("commission_amount_cents, status")
        .eq("account_id", account.id),
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

    // Per-sub-affiliate override totals.
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
      clicks: 0, // populated from affiliate_clicks aggregate when surfaced
      conversions: (conversions ?? []).length,
      directEarnedCents: directEarned,
      overrideEarnedCents: overrideEarned,
      subAffiliates,
    };
  }

  return (
    <SettingsShell
      title="Affiliate Programme"
      description="Earn recurring commission by referring customers — and an override on the affiliates you recruit."
    >
      <AffiliateHub data={data} />
    </SettingsShell>
  );
}
