import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";
import { RECIPES } from "@/lib/automations/recipes";
import {
  getRecipeFavourites,
  getRecipeUsageCounts,
  getOverviewMetrics,
  getAutomationCoverage,
} from "@/lib/automations/data";
import { RecipesClient } from "./RecipesClient";

export const metadata = { title: "Automations — Recipes" };
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { flags } = await getPersonaContext();

  if (!flags.automationsBuilder) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} />
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-surface-200 bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Recipes</h2>
          <p className="text-sm text-surface-500 mb-5">{upgradeMessage("business")}</p>
          <Link
            href="/event-manager/settings/billing"
            className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const { workspaceId, user, workspace } = await requireWorkspace();
  const supabase = await createClient();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [favourites, usageCountsMap, overviewMetrics, coverage, recentUsageRes, monthUsageRes] = await Promise.all([
    getRecipeFavourites(workspaceId, user.id),
    getRecipeUsageCounts(workspaceId),
    getOverviewMetrics(workspaceId),
    getAutomationCoverage(workspaceId),
    supabase
      .from("automation_recipe_usage")
      .select("recipe_id, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("automation_recipe_usage")
      .select("recipe_id")
      .eq("workspace_id", workspaceId)
      .gte("created_at", monthStart),
  ]);

  // Runs this month — from the same usage-events stream the Usage & Limits page reads.
  const { data: runEvents } = await supabase
    .from("automation_usage_events")
    .select("quantity")
    .eq("workspace_id", workspaceId)
    .eq("kind", "run")
    .gte("created_at", monthStart);
  const runsThisMonth = (runEvents ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);

  // Recently used — first (most recent) occurrence of each distinct recipe, from the last 50 uses.
  const recentlyUsed: string[] = [];
  for (const row of recentUsageRes.data ?? []) {
    if (!recentlyUsed.includes(row.recipe_id)) recentlyUsed.push(row.recipe_id);
    if (recentlyUsed.length >= 4) break;
  }

  // Popular this month — counted from this-month usage rows.
  const monthCounts = new Map<string, number>();
  for (const row of monthUsageRes.data ?? []) {
    monthCounts.set(row.recipe_id, (monthCounts.get(row.recipe_id) ?? 0) + 1);
  }
  const popularThisMonth = Array.from(monthCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);

  // Recommended — recipes this workspace hasn't used yet, low-risk first. Plainly a
  // not-yet-tried heuristic, not a personalised ML recommendation.
  const recommended = RECIPES.filter((r) => !usageCountsMap.has(r.id))
    .sort((a, b) => {
      const order = { low: 0, medium: 1, high: 2 } as const;
      return order[a.risk] - order[b.risk];
    })
    .slice(0, 4)
    .map((r) => r.id);

  const mostUsed = Array.from(usageCountsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([recipeId, count]) => ({ recipeId, count }));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} />
      <RecipesClient
        recipes={RECIPES}
        favouritesInit={Array.from(favourites)}
        usageCounts={Object.fromEntries(usageCountsMap)}
        planCode={workspace.plan}
        overview={{
          totalRecipes: RECIPES.length,
          activeAutomations: overviewMetrics.active,
          successRate: overviewMetrics.successRate,
          runsThisMonth,
        }}
        mostUsed={mostUsed}
        coverage={coverage}
        recentlyUsed={recentlyUsed}
        recommended={recommended}
        popularThisMonth={popularThisMonth}
      />
    </div>
  );
}
