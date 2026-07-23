import Link from "next/link";
import { Lock, Plus, Sparkles, Boxes, CheckCircle2, FileEdit, PauseCircle, Activity } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { requireWorkspace } from "@/lib/workspace";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";
import { listAutomations } from "@/lib/automations/data";
import { MyAutomationsClient, type AutomationTableRow } from "./MyAutomationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations — My Automations" };

const PAGE_SIZE = 20;

function firstParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

// Impure Date.now() read lives in a plain helper, not inline in the page
// component body, so the react-hooks/purity rule doesn't flag it.
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export default async function MyAutomationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { flags } = await getPersonaContext();

  if (!flags.automationsBuilder) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Automations" description="Build, manage and monitor automated workflows across events, suppliers, finance and operations." />
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-surface-200 bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Automations</h2>
          <p className="text-sm text-surface-500 mb-5">{upgradeMessage("business")}</p>
          <Link href="/event-manager/settings/billing" className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const { workspaceId, user } = await requireWorkspace();
  const sp = await searchParams;

  const status = firstParam(sp.status) || "all";
  const moduleFilter = firstParam(sp.module) || "all";
  const search = firstParam(sp.search);
  const requestedPage = Math.max(1, Number(firstParam(sp.page)) || 1);

  const isFiltered = status !== "all" || moduleFilter !== "all" || Boolean(search);

  const [filtered, allUnfiltered] = await Promise.all([
    isFiltered
      ? listAutomations(workspaceId, {
          status: status !== "all" ? status : undefined,
          module: moduleFilter !== "all" ? moduleFilter : undefined,
          search: search || undefined,
        })
      : listAutomations(workspaceId),
    isFiltered ? listAutomations(workspaceId) : Promise.resolve<Awaited<ReturnType<typeof listAutomations>>>([]),
  ]);
  const everything = isFiltered ? allUnfiltered : filtered;

  if (everything.length === 0) {
    return (
      <div className="flex flex-col min-h-full bg-surface-50">
        <PageHeader
          title="Automations"
          description="Build, manage and monitor automated workflows across events, suppliers, finance and operations."
          tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />}
          actions={
            <>
              <Link href="/event-manager/automations/ai-builder" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
                <Sparkles className="w-4 h-4" /> AI Builder
              </Link>
              <Link href="/event-manager/automations/builder/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                <Plus className="w-4 h-4" /> New automation
              </Link>
            </>
          }
        />
        <div className="flex-1 p-6 max-w-[1600px]">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Boxes}
              title="No automations yet"
              description="Start from a proven recipe — it installs as a review-first draft you can test and activate when ready."
              action={
                <Link href="/event-manager/automations/recipes" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                  Create from recipe
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const supabase = await createClient();

  const since7d = daysAgoIso(7);
  const [{ data: runsAll }, { count: runs7dCount }] = await Promise.all([
    supabase
      .from("smart_rule_runs")
      .select("rule_id, status, ts")
      .eq("workspace_id", workspaceId)
      .order("ts", { ascending: false })
      .limit(3000),
    supabase
      .from("smart_rule_runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("ts", since7d),
  ]);

  const runsByRule = new Map<string, { status: string; ts: string }[]>();
  for (const r of runsAll ?? []) {
    const list = runsByRule.get(r.rule_id) ?? [];
    list.push({ status: r.status, ts: r.ts });
    runsByRule.set(r.rule_id, list);
  }
  const overallRunCount = runsAll?.length ?? 0;
  const overallSuccessCount = (runsAll ?? []).filter((r) => r.status === "success").length;
  const overallSuccessRate = overallRunCount > 0 ? Math.round((overallSuccessCount / overallRunCount) * 1000) / 10 : 100;

  function statsFor(id: string) {
    const list = runsByRule.get(id) ?? [];
    const successCount = list.filter((r) => r.status === "success").length;
    const successRate = list.length > 0 ? Math.round((successCount / list.length) * 1000) / 10 : null;
    const lastRunAt = list.length > 0 ? list.reduce((latest, r) => (r.ts > latest ? r.ts : latest), list[0].ts) : null;
    return { successRate, lastRunAt, runCount: list.length };
  }

  const ownerIds = Array.from(new Set(everything.map((a) => a.ownerUserId).filter((v): v is string => Boolean(v))));
  const { data: profiles } = ownerIds.length > 0
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
    : { data: [] as { user_id: string; display_name: string | null }[] };
  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Workspace member"]));

  function ownerName(ownerUserId: string | null): string {
    if (!ownerUserId) return "—";
    if (ownerUserId === user.id) return "You";
    return nameByUser.get(ownerUserId) ?? "Workspace member";
  }

  const rows: AutomationTableRow[] = pageRows.map((a) => ({
    ...a,
    ...statsFor(a.id),
    ownerName: ownerName(a.ownerUserId),
  }));

  const modules = Array.from(new Set(everything.map((a) => a.module))).sort();

  const recentlyEdited = everything.slice(0, 5);
  const draftsNeedingReview = everything.filter((a) => a.status === "draft" || a.status === "review_requested").slice(0, 5);
  const topPerforming = everything
    .map((a) => ({ ...a, ...statsFor(a.id) }))
    .filter((a) => a.runCount > 0)
    .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0))
    .slice(0, 5);

  const activeCount = everything.filter((a) => a.status === "active").length;
  const draftCount = everything.filter((a) => a.status === "draft").length;
  const pausedCount = everything.filter((a) => a.status === "paused").length;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Automations"
        description="Build, manage and monitor automated workflows across events, suppliers, finance and operations."
        tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />}
        actions={
          <>
            <Link href="/event-manager/automations/ai-builder" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Sparkles className="w-4 h-4" /> AI Builder
            </Link>
            <Link href="/event-manager/automations/builder/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              <Plus className="w-4 h-4" /> New automation
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-[1600px] space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total" value={everything.length} icon={Boxes} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Active" value={activeCount} icon={CheckCircle2} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Drafts" value={draftCount} icon={FileEdit} iconColor="text-surface-500" iconBg="bg-surface-100" />
          <MetricCard label="Paused" value={pausedCount} icon={PauseCircle} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Success rate" value={`${overallSuccessRate}%`} icon={Activity} iconColor="text-violet-600" iconBg="bg-violet-50" />
          <MetricCard label="Runs (last 7 days)" value={runs7dCount ?? 0} icon={Activity} iconColor="text-info-600" iconBg="bg-info-50" />
        </KPIGrid>

        <MyAutomationsClient
          rows={rows}
          modules={modules}
          status={status}
          moduleFilter={moduleFilter}
          search={search}
          page={page}
          totalPages={totalPages}
          total={total}
          recentlyEdited={recentlyEdited}
          draftsNeedingReview={draftsNeedingReview}
          topPerforming={topPerforming}
        />
      </div>
    </div>
  );
}
