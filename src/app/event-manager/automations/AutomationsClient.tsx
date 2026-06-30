"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Zap, Boxes, ListChecks, Lock, ShieldAlert } from "lucide-react";
import type { RecipeTemplate } from "@/lib/automations/recipes";
import type { AutomationNode } from "@/lib/automations/nodes";
import { TRIGGER_LABEL, ACTION_LABEL } from "@/lib/automations/smart-rules";

type Tab = "recipes" | "nodes" | "mine";

export interface MyRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  action: string;
}

const RISK_BADGE: Record<string, string> = {
  low: "bg-success-50 text-success-700",
  medium: "bg-warning-50 text-warning-700",
  high: "bg-danger-50 text-danger-700",
  critical: "bg-danger-100 text-danger-800",
};

export function AutomationsClient({
  recipes,
  nodes,
  myRules,
}: {
  recipes: RecipeTemplate[];
  nodes: AutomationNode[];
  myRules: MyRule[];
}) {
  const [tab, setTab] = useState<Tab>("recipes");

  const activeCount = myRules.filter((r) => r.enabled).length;
  const recipeGroups = group(recipes, (r) => r.group);
  const nodeGroups = group(nodes, (n) => n.category);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi icon={Zap} label="Recipes" value={recipes.length} tone="brand" />
        <Kpi icon={Boxes} label="Building blocks" value={nodes.length} tone="surface" />
        <Kpi icon={ListChecks} label="Active automations" value={activeCount} tone="success" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-100 w-fit">
        {([
          { id: "recipes" as Tab, label: "Recipe library" },
          { id: "nodes" as Tab, label: "Building blocks" },
          { id: "mine" as Tab, label: "My automations" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === t.id ? "bg-white text-surface-900 shadow-sm" : "text-surface-500 hover:text-surface-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recipes" && (
        <div className="space-y-6">
          {Object.entries(recipeGroups).map(([g, list]) => (
            <section key={g}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">{g}</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((r) => (
                  <div key={r.id} className="rounded-xl border border-surface-200 bg-white p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-surface-900">{r.name}</h4>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium capitalize shrink-0", RISK_BADGE[r.risk])}>{r.risk}</span>
                    </div>
                    <p className="text-xs text-surface-500 mt-1 flex-1">{r.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      {r.planGate && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-surface-400">
                          <Lock className="w-3 h-3" /> {r.planGate === "business" ? "Scale" : r.planGate}
                        </span>
                      )}
                      <Link
                        href="/event-manager/settings/smart-rules"
                        className="ml-auto px-3 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100"
                      >
                        Use recipe
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "nodes" && (
        <div className="space-y-6">
          {Object.entries(nodeGroups).map(([g, list]) => (
            <section key={g}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">{g}</h3>
              <div className="flex flex-wrap gap-2">
                {list.map((n) => (
                  <div key={n.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
                    <span>{n.label}</span>
                    {n.autoRunBlocked && (
                      <span title="Blocked from auto-run" className="inline-flex items-center gap-0.5 text-[10px] text-danger-600">
                        <ShieldAlert className="w-3 h-3" /> manual
                      </span>
                    )}
                    {n.approvalRequired && <span className="text-[10px] text-warning-600">approval</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "mine" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link
              href="/event-manager/settings/smart-rules"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
            >
              Manage rules
            </Link>
          </div>
          {myRules.length === 0 ? (
            <div className="rounded-xl border border-surface-200 bg-white p-10 text-center">
              <p className="text-sm text-surface-600">
                No automations yet. Start from a recipe in the library — they install as review-first drafts.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Rule</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">When → Then</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {myRules.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-surface-900">{r.name}</td>
                      <td className="px-5 py-3 text-surface-600">
                        {(TRIGGER_LABEL[r.trigger] ?? r.trigger)} → {(ACTION_LABEL[r.action] ?? r.action)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", r.enabled ? "bg-success-50 text-success-700" : "bg-surface-100 text-surface-500")}>
                          {r.enabled ? "Active" : "Draft"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Zap; label: string; value: number; tone: "brand" | "surface" | "success" }) {
  const toneCls = tone === "brand" ? "text-brand-600 bg-brand-50" : tone === "success" ? "text-success-600 bg-success-50" : "text-surface-600 bg-surface-100";
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", toneCls)}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-xl font-semibold text-surface-900">{value}</p>
        <p className="text-xs text-surface-500">{label}</p>
      </div>
    </div>
  );
}

function group<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const it of items) (out[key(it)] ??= []).push(it);
  return out;
}
