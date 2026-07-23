import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Proposal } from "@/lib/supabase/types";
import { ProposalsClient, type ProposalsKpis } from "./ProposalsClient";

export const metadata = { title: "Proposals" };
export const dynamic = "force-dynamic";

/** Module-level helper (not a component) so the impure `Date.now()` read is not flagged as a render-purity violation. */
function weekAgoTimestamp(): number {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

export default async function ProposalsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const proposals = (data ?? []) as Proposal[];

  // Resolve owner display names from the workspace member profiles (same
  // pattern used by leads/page.tsx).
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const nameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    for (const p of profiles ?? []) {
      if (p.display_name) nameById.set(p.user_id, p.display_name);
    }
  }

  const owners = Array.from(nameById.entries()).map(([id, name]) => ({ id, name }));

  const total = proposals.length;
  const nonDraft = proposals.filter((p) => p.status !== "draft");
  const awaiting = proposals.filter((p) => p.status === "sent" || p.status === "viewed").length;
  const totalValue = nonDraft.reduce((sum, p) => sum + (p.total_cents ?? 0), 0);
  const sentCount = proposals.filter((p) =>
    ["sent", "viewed", "signed", "declined", "converted", "expired"].includes(p.status)
  ).length;
  const signedCount = proposals.filter((p) => p.status === "signed" || p.status === "converted").length;
  const conversionRate = sentCount > 0 ? Math.round((signedCount / sentCount) * 100) : 0;

  // Sent This Week — approximation: no sent-at timestamp is tracked yet, so we
  // use created_at for proposals that have moved past draft, within the last 7 days.
  const weekAgo = weekAgoTimestamp();
  const sentThisWeek = nonDraft.filter((p) => new Date(p.created_at).getTime() >= weekAgo).length;

  const marginValues = proposals
    .map((p) => p.margin_pct)
    .filter((v): v is number => v !== null && v !== undefined);
  const avgMarginPct =
    marginValues.length > 0
      ? Math.round((marginValues.reduce((s, v) => s + v, 0) / marginValues.length) * 10) / 10
      : null;

  const kpis: ProposalsKpis = {
    total,
    sentThisWeek,
    awaiting,
    conversionRate,
    totalValue,
    avgMarginPct,
  };

  return <ProposalsClient proposals={proposals} kpis={kpis} owners={owners} />;
}
