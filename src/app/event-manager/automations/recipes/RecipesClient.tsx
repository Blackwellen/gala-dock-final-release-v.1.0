"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CalendarClock,
  BellRing,
  MessageSquareHeart,
  CalendarX,
  ShieldCheck,
  Camera,
  FileSearch,
  AlarmClockOff,
  ClipboardCheck,
  ReceiptText,
  BadgePoundSterling,
  AlertTriangle,
  UserPlus,
  FileCheck2,
  TicketX,
  Ticket,
  FileClock,
  Sparkles,
  ShieldAlert,
  Newspaper,
  Search,
  Star,
  LayoutGrid,
  List as ListIcon,
  X,
  Lock,
  Zap,
  Clock3,
  Info,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecipeTemplate } from "@/lib/automations/recipes";
import { TRIGGER_LABEL } from "@/lib/automations/smart-rules";
import { meetsPlan, PLAN_LABELS, upgradeMessage, type Plan } from "@/lib/billing/entitlements";
import { EmptyState } from "@/components/ui/EmptyState";
import { DonutChart, DonutLegend } from "@/components/ui/FinanceCharts";
import { applyRecipe, toggleFavouriteRecipe } from "../actions";

// ─── Icon + colour lookups ──────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  CalendarCheck,
  CalendarClock,
  BellRing,
  MessageSquareHeart,
  CalendarX,
  ShieldCheck,
  Camera,
  FileSearch,
  AlarmClockOff,
  ClipboardCheck,
  ReceiptText,
  BadgePoundSterling,
  AlertTriangle,
  UserPlus,
  FileCheck2,
  TicketX,
  Ticket,
  FileClock,
  Sparkles,
  ShieldAlert,
  Newspaper,
};

const COMPLEXITY_STYLES: Record<RecipeTemplate["complexity"], string> = {
  easy: "bg-success-50 text-success-700 border-success-200",
  medium: "bg-warning-50 text-warning-600 border-warning-200",
  advanced: "bg-danger-50 text-danger-600 border-danger-200",
};

const RISK_STYLES: Record<RecipeTemplate["risk"], string> = {
  low: "bg-success-50 text-success-700 border-success-200",
  medium: "bg-warning-50 text-warning-600 border-warning-200",
  high: "bg-danger-50 text-danger-600 border-danger-200",
};

const MODULE_COLORS: Record<string, string> = {
  events: "#7c3aed",
  suppliers: "#0ea5e9",
  tasks: "#f59e0b",
  finance: "#22c55e",
  pipeline: "#ec4899",
  tickets: "#8b5cf6",
  documents: "#64748b",
  notifications: "#ef4444",
  operations: "#94a3b8",
};

function moduleColor(module: string): string {
  return MODULE_COLORS[module.toLowerCase()] ?? "#94a3b8";
}

function ComplexityBadge({ complexity }: { complexity: RecipeTemplate["complexity"] }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize", COMPLEXITY_STYLES[complexity])}>
      {complexity}
    </span>
  );
}

function RiskBadge({ risk }: { risk: RecipeTemplate["risk"] }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize", RISK_STYLES[risk])}>
      {risk} risk
    </span>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecipesClientProps {
  recipes: RecipeTemplate[];
  favouritesInit: string[];
  usageCounts: Record<string, number>;
  planCode: string;
  overview: { totalRecipes: number; activeAutomations: number; successRate: number; runsThisMonth: number };
  mostUsed: { recipeId: string; count: number }[];
  coverage: { module: string; count: number }[];
  recentlyUsed: string[];
  recommended: string[];
  popularThisMonth: string[];
}

type SortMode = "popularity" | "name";
type ViewMode = "card" | "list";

export function RecipesClient({
  recipes,
  favouritesInit,
  usageCounts,
  planCode,
  overview,
  mostUsed,
  coverage,
  recentlyUsed,
  recommended,
  popularThisMonth,
}: RecipesClientProps) {
  const router = useRouter();
  const recipesById = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r])), [recipes]);
  const groups = useMemo(() => Array.from(new Set(recipes.map((r) => r.group))), [recipes]);
  const distinctTriggers = useMemo(() => Array.from(new Set(recipes.map((r) => r.liveTrigger))), [recipes]);

  const [favourites, setFavourites] = useState<Set<string>>(new Set(favouritesInit));
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [complexityFilter, setComplexityFilter] = useState<string>("all");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("popularity");
  const [view, setView] = useState<ViewMode>("card");
  const [previewRecipe, setPreviewRecipe] = useState<RecipeTemplate | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [useError, setUseError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const gated = (recipe: RecipeTemplate) => Boolean(recipe.planGate) && !meetsPlan(planCode as Plan, recipe.planGate!);

  const filtered = useMemo(() => {
    let list = recipes;
    if (category === "Staffing") list = [];
    else if (category !== "All") list = list.filter((r) => r.group === category);
    if (moduleFilter !== "all") list = list.filter((r) => r.group === moduleFilter);
    if (triggerFilter !== "all") list = list.filter((r) => r.liveTrigger === triggerFilter);
    if (complexityFilter !== "all") list = list.filter((r) => r.complexity === complexityFilter);
    if (favouritesOnly) list = list.filter((r) => favourites.has(r.id));
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(s) || r.description.toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => {
      if (sortBy === "popularity") return (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0);
      return a.name.localeCompare(b.name);
    });
  }, [recipes, category, moduleFilter, triggerFilter, complexityFilter, favouritesOnly, favourites, search, sortBy, usageCounts]);

  const featured = useMemo(
    () => [...recipes].sort((a, b) => (a.risk === "low" ? -1 : 1) - (b.risk === "low" ? -1 : 1)).slice(0, 4),
    [recipes]
  );

  function toggleFavourite(recipeId: string) {
    const next = new Set(favourites);
    const willFavourite = !next.has(recipeId);
    if (willFavourite) next.add(recipeId);
    else next.delete(recipeId);
    setFavourites(next);
    startTransition(async () => {
      const res = await toggleFavouriteRecipe(recipeId, willFavourite);
      if (!res.ok) {
        // Roll back on failure.
        setFavourites((prev) => {
          const rollback = new Set(prev);
          if (willFavourite) rollback.delete(recipeId);
          else rollback.add(recipeId);
          return rollback;
        });
      }
    });
  }

  function handleUseRecipe(recipe: RecipeTemplate) {
    if (gated(recipe) || usingId) return;
    setUsingId(recipe.id);
    setUseError(null);
    startTransition(async () => {
      const res = await applyRecipe(recipe.id);
      if (res.ok && res.automationId) {
        router.push(`/event-manager/automations/builder/${res.automationId}`);
      } else {
        setUsingId(null);
        setUseError(res.error ?? "Couldn't install this recipe. Try again.");
      }
    });
  }

  function scrollToResults() {
    setSortBy("popularity");
    document.getElementById("all-recipes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const clearFilters = () => {
    setCategory("All");
    setSearch("");
    setTriggerFilter("all");
    setModuleFilter("all");
    setComplexityFilter("all");
    setFavouritesOnly(false);
  };

  const hasActiveFilters =
    category !== "All" || search.trim() !== "" || triggerFilter !== "all" || moduleFilter !== "all" || complexityFilter !== "all" || favouritesOnly;

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* ── Main column ────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Search + filter bar */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" strokeWidth={1.8} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipes by name or description…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                />
              </div>
              <select
                value={triggerFilter}
                onChange={(e) => setTriggerFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700"
              >
                <option value="all">All triggers</option>
                {distinctTriggers.map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700"
              >
                <option value="all">All modules</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                value={complexityFilter}
                onChange={(e) => setComplexityFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700"
              >
                <option value="all">All complexity</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="advanced">Advanced</option>
              </select>
              <button
                type="button"
                onClick={() => setFavouritesOnly((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                  favouritesOnly
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-surface-700 border-surface-200 hover:bg-surface-50"
                )}
              >
                <Star className="w-3.5 h-3.5" strokeWidth={1.8} fill={favouritesOnly ? "currentColor" : "none"} />
                Favourites
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                className="px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white text-surface-700"
              >
                <option value="popularity">Sort: Popularity</option>
                <option value="name">Sort: Name</option>
              </select>
              <div className="flex items-center rounded-lg border border-surface-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setView("card")}
                  aria-label="Card view"
                  className={cn("p-2", view === "card" ? "bg-brand-600 text-white" : "bg-white text-surface-500 hover:bg-surface-50")}
                >
                  <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-label="List view"
                  className={cn("p-2", view === "list" ? "bg-brand-600 text-white" : "bg-white text-surface-500 hover:bg-surface-50")}
                >
                  <ListIcon className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {/* Category pills */}
            <div className="flex flex-wrap gap-1.5">
              {["All", ...groups, "Staffing"].map((g) => {
                const count = g === "All" ? recipes.length : g === "Staffing" ? 0 : recipes.filter((r) => r.group === g).length;
                const disabled = g === "Staffing";
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={disabled}
                    onClick={() => setCategory(g)}
                    title={disabled ? "No recipes in this module yet" : undefined}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                      disabled
                        ? "bg-surface-50 text-surface-300 border-surface-200 cursor-not-allowed"
                        : category === g
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"
                    )}
                  >
                    {g} <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-surface-200 bg-white text-surface-500 hover:bg-surface-50 inline-flex items-center gap-1"
                >
                  <X className="w-3 h-3" strokeWidth={2} /> Clear filters
                </button>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-info-50 border border-info-200 px-3 py-2 text-xs text-info-700">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.8} />
              <span>Every recipe installs as a disabled draft, review-first — nothing goes live until you enable it in the Canvas Builder.</span>
            </div>

            {useError && (
              <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-xs text-danger-700">{useError}</div>
            )}
          </div>

          {/* Featured Recipes */}
          <RecipeSection title="Featured Recipes" subtitle="Handpicked recipes to get every event-ops workspace started">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {featured.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  favourited={favourites.has(r.id)}
                  gated={gated(r)}
                  busy={usingId === r.id}
                  onFavourite={() => toggleFavourite(r.id)}
                  onUse={() => handleUseRecipe(r)}
                  onPreview={() => setPreviewRecipe(r)}
                />
              ))}
            </div>
          </RecipeSection>

          {/* Recently Used */}
          {recentlyUsed.length > 0 && (
            <RecipeSection title="Recently Used" subtitle="Recipes your workspace has installed most recently">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recentlyUsed.map((id) => {
                  const r = recipesById[id];
                  if (!r) return null;
                  return <CompactRecipeCard key={id} recipe={r} onClick={() => setPreviewRecipe(r)} />;
                })}
              </div>
            </RecipeSection>
          )}

          {/* Recommended for You */}
          {recommended.length > 0 && (
            <RecipeSection title="Recommended for You" subtitle="Low-risk recipes this workspace hasn't tried yet">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {recommended.map((id) => {
                  const r = recipesById[id];
                  if (!r) return null;
                  return (
                    <RecipeCard
                      key={id}
                      recipe={r}
                      favourited={favourites.has(id)}
                      gated={gated(r)}
                      busy={usingId === id}
                      onFavourite={() => toggleFavourite(id)}
                      onUse={() => handleUseRecipe(r)}
                      onPreview={() => setPreviewRecipe(r)}
                    />
                  );
                })}
              </div>
            </RecipeSection>
          )}

          {/* Popular This Month */}
          {popularThisMonth.length > 0 && (
            <RecipeSection title="Popular This Month" subtitle="Most-installed recipes across this workspace this calendar month">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {popularThisMonth.map((id) => {
                  const r = recipesById[id];
                  if (!r) return null;
                  return <CompactRecipeCard key={id} recipe={r} onClick={() => setPreviewRecipe(r)} />;
                })}
              </div>
            </RecipeSection>
          )}

          {/* All Recipes / results */}
          <div id="all-recipes">
            <RecipeSection title="All Recipes" subtitle={`${filtered.length} recipe${filtered.length === 1 ? "" : "s"} match your filters`}>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No recipes match these filters"
                  description="Try a different search term, module or complexity — or clear filters to see the full catalogue."
                  action={
                    <button onClick={clearFilters} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                      Clear filters
                    </button>
                  }
                />
              ) : view === "card" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map((r) => (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      favourited={favourites.has(r.id)}
                      gated={gated(r)}
                      busy={usingId === r.id}
                      onFavourite={() => toggleFavourite(r.id)}
                      onUse={() => handleUseRecipe(r)}
                      onPreview={() => setPreviewRecipe(r)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-surface-200 bg-white shadow-card divide-y divide-surface-100">
                  {filtered.map((r) => (
                    <RecipeListRow
                      key={r.id}
                      recipe={r}
                      favourited={favourites.has(r.id)}
                      gated={gated(r)}
                      busy={usingId === r.id}
                      onFavourite={() => toggleFavourite(r.id)}
                      onUse={() => handleUseRecipe(r)}
                      onPreview={() => setPreviewRecipe(r)}
                    />
                  ))}
                </div>
              )}
            </RecipeSection>
          </div>
        </div>

        {/* ── Right rail ─────────────────────────────────────────────── */}
        <aside className="w-full xl:w-[320px] shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Automation Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatMini label="Total recipes" value={overview.totalRecipes} />
              <StatMini label="Active automations" value={overview.activeAutomations} />
              <StatMini label="Success rate" value={`${overview.successRate}%`} />
              <StatMini label="Runs this month" value={overview.runsThisMonth} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900">Most Used Recipes</h3>
              {mostUsed.length > 0 && (
                <button onClick={scrollToResults} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5">
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
            {mostUsed.length === 0 ? (
              <p className="text-xs text-surface-400">No recipes used yet this workspace.</p>
            ) : (
              <ul className="space-y-2.5">
                {mostUsed.map(({ recipeId, count }) => {
                  const r = recipesById[recipeId];
                  if (!r) return null;
                  const Icon = ICON_MAP[r.icon] ?? Zap;
                  return (
                    <li key={recipeId} className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
                      </span>
                      <span className="flex-1 min-w-0 text-xs text-surface-700 truncate">{r.name}</span>
                      <span className="text-xs font-semibold text-surface-900 tabular-nums shrink-0">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Automation Coverage</h3>
            {coverage.length === 0 ? (
              <p className="text-xs text-surface-400">No automations installed yet — coverage will appear here once you use a recipe.</p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <DonutChart
                  data={coverage.map((c) => ({ label: c.module, value: c.count, color: moduleColor(c.module) }))}
                  size={140}
                  thickness={20}
                  centerValue={String(coverage.reduce((s, c) => s + c.count, 0))}
                  centerLabel="automations"
                />
                <div className="w-full">
                  <DonutLegend data={coverage.map((c) => ({ label: c.module, value: c.count, color: moduleColor(c.module) }))} />
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {previewRecipe && (
        <RecipePreviewModal
          recipe={previewRecipe}
          gated={gated(previewRecipe)}
          favourited={favourites.has(previewRecipe.id)}
          busy={usingId === previewRecipe.id}
          onClose={() => setPreviewRecipe(null)}
          onFavourite={() => toggleFavourite(previewRecipe.id)}
          onUse={() => handleUseRecipe(previewRecipe)}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function RecipeSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-surface-900">{title}</h2>
        {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-50 px-3 py-2.5">
      <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wide truncate">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-surface-900 tabular-nums">{value}</p>
    </div>
  );
}

interface CardActionsProps {
  recipe: RecipeTemplate;
  favourited: boolean;
  gated: boolean;
  busy: boolean;
  onFavourite: () => void;
  onUse: () => void;
  onPreview: () => void;
}

function RecipeCard({ recipe, favourited, gated, busy, onFavourite, onUse, onPreview }: CardActionsProps) {
  const Icon = ICON_MAP[recipe.icon] ?? Zap;
  return (
    <div className="rounded-xl border border-surface-200 bg-white shadow-card p-4 flex flex-col hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <span className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
        </span>
        <button
          type="button"
          onClick={onFavourite}
          aria-label={favourited ? "Remove from favourites" : "Add to favourites"}
          className="p-1.5 rounded-md hover:bg-surface-50 text-surface-400 hover:text-warning-500"
        >
          <Star className="w-4 h-4" strokeWidth={1.8} fill={favourited ? "currentColor" : "none"} color={favourited ? "#f59e0b" : undefined} />
        </button>
      </div>
      <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-surface-50 text-surface-500 border-surface-200 mb-2">
        {recipe.group}
      </span>
      <h3 className="text-sm font-semibold text-surface-900 leading-snug">{recipe.name}</h3>
      <p className="mt-1 text-xs text-surface-500 leading-relaxed flex-1">{recipe.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ComplexityBadge complexity={recipe.complexity} />
        <RiskBadge risk={recipe.risk} />
        {gated && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-brand-50 text-brand-700 border-brand-200">
            <Lock className="w-2.5 h-2.5" /> {PLAN_LABELS[recipe.planGate!]}
          </span>
        )}
      </div>
      <div className="mt-2 text-[11px] text-surface-400">
        {TRIGGER_LABEL[recipe.liveTrigger] ?? recipe.liveTrigger} → {recipe.actions.length} action{recipe.actions.length === 1 ? "" : "s"}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onUse}
          disabled={gated || busy}
          title={gated ? upgradeMessage(recipe.planGate!) : undefined}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
            gated
              ? "bg-surface-100 text-surface-400 cursor-not-allowed"
              : "bg-brand-600 text-white hover:bg-brand-700"
          )}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : gated ? <Lock className="w-3.5 h-3.5" /> : null}
          {gated ? "Upgrade to use" : busy ? "Installing…" : "Use recipe"}
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50"
        >
          Preview
        </button>
      </div>
    </div>
  );
}

function RecipeListRow({ recipe, favourited, gated, busy, onFavourite, onUse, onPreview }: CardActionsProps) {
  const Icon = ICON_MAP[recipe.icon] ?? Zap;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 text-brand-600" strokeWidth={1.8} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-surface-900 truncate">{recipe.name}</h3>
          <span className="text-[10px] font-medium text-surface-400">{recipe.group}</span>
        </div>
        <p className="text-xs text-surface-500 truncate">{recipe.description}</p>
      </div>
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        <ComplexityBadge complexity={recipe.complexity} />
        <RiskBadge risk={recipe.risk} />
      </div>
      <button type="button" onClick={onFavourite} aria-label="Toggle favourite" className="p-1.5 rounded-md hover:bg-surface-50 text-surface-400 shrink-0">
        <Star className="w-4 h-4" strokeWidth={1.8} fill={favourited ? "currentColor" : "none"} color={favourited ? "#f59e0b" : undefined} />
      </button>
      <button
        type="button"
        onClick={onPreview}
        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50 shrink-0"
      >
        Preview
      </button>
      <button
        type="button"
        onClick={onUse}
        disabled={gated || busy}
        className={cn(
          "px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0",
          gated ? "bg-surface-100 text-surface-400 cursor-not-allowed" : "bg-brand-600 text-white hover:bg-brand-700"
        )}
      >
        {gated ? "Upgrade" : busy ? "Installing…" : "Use"}
      </button>
    </div>
  );
}

function CompactRecipeCard({ recipe, onClick }: { recipe: RecipeTemplate; onClick: () => void }) {
  const Icon = ICON_MAP[recipe.icon] ?? Zap;
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 w-56 text-left rounded-xl border border-surface-200 bg-white shadow-card p-3.5 hover:shadow-md transition-shadow"
    >
      <span className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center mb-2">
        <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
      </span>
      <h3 className="text-xs font-semibold text-surface-900 leading-snug line-clamp-2">{recipe.name}</h3>
      <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-surface-400">
        <Clock3 className="w-3 h-3" /> {recipe.group}
      </span>
    </button>
  );
}

function RecipePreviewModal({
  recipe,
  gated,
  favourited,
  busy,
  onClose,
  onFavourite,
  onUse,
}: {
  recipe: RecipeTemplate;
  gated: boolean;
  favourited: boolean;
  busy: boolean;
  onClose: () => void;
  onFavourite: () => void;
  onUse: () => void;
}) {
  const Icon = ICON_MAP[recipe.icon] ?? Zap;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label={recipe.name}>
      <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-surface-200 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-surface-100">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-surface-900">{recipe.name}</h2>
              <p className="text-xs text-surface-500 mt-0.5">{recipe.group} recipe</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface-50 text-surface-400" aria-label="Close preview">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-surface-600 leading-relaxed">{recipe.description}</p>
          <div className="flex flex-wrap gap-1.5">
            <ComplexityBadge complexity={recipe.complexity} />
            <RiskBadge risk={recipe.risk} />
            {gated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-brand-50 text-brand-700 border-brand-200">
                <Lock className="w-2.5 h-2.5" /> Requires {PLAN_LABELS[recipe.planGate!]}
              </span>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-surface-700 uppercase tracking-wide mb-1.5">Trigger</h3>
            <p className="text-sm text-surface-800 rounded-lg bg-surface-50 px-3 py-2">{TRIGGER_LABEL[recipe.liveTrigger] ?? recipe.liveTrigger}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-surface-700 uppercase tracking-wide mb-1.5">Actions ({recipe.actions.length})</h3>
            <ul className="space-y-1.5">
              {recipe.actions.map((a, i) => (
                <li key={i} className="text-sm text-surface-800 rounded-lg bg-surface-50 px-3 py-2">
                  {humanizeActionId(a)}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-info-50 border border-info-200 px-3 py-2 text-xs text-info-700 flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Installs as a disabled draft in your Canvas Builder — review the trigger, conditions and actions before turning it on.</span>
          </div>
        </div>
        <div className="p-5 border-t border-surface-100 flex items-center gap-2">
          <button
            type="button"
            onClick={onFavourite}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-surface-200 bg-white text-surface-700 hover:bg-surface-50"
          >
            <Star className="w-4 h-4" fill={favourited ? "currentColor" : "none"} color={favourited ? "#f59e0b" : undefined} />
            {favourited ? "Favourited" : "Favourite"}
          </button>
          <button
            type="button"
            onClick={onUse}
            disabled={gated || busy}
            title={gated ? upgradeMessage(recipe.planGate!) : undefined}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg",
              gated ? "bg-surface-100 text-surface-400 cursor-not-allowed" : "bg-brand-600 text-white hover:bg-brand-700"
            )}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : gated ? <Lock className="w-4 h-4" /> : null}
            {gated ? "Upgrade to use this recipe" : busy ? "Installing…" : "Use recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}

function humanizeActionId(id: string): string {
  const label = id.split(".").pop() ?? id;
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
