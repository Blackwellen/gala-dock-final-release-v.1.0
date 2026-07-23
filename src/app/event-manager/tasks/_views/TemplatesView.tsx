"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ListChecks, Heart, Users, MapPin, Mic, Briefcase, MoreHorizontal, Copy, Pencil,
  Search, Plus, Sparkles, Archive,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";
import { formatDate } from "../task-utils";
import { InsightCard, Donut, BarList } from "../_shared";
import { applyTaskTemplate, duplicateTaskTemplate, archiveTaskTemplate } from "../actions";
import type { TemplateRow } from "../TasksWorkspaceClient";

const ICONS: Record<string, typeof ListChecks> = {
  ListChecks, Heart, Users, MapPin, Mic, Briefcase,
};

export function TemplatesView({
  templates, usage, events, suppliers, view,
}: {
  templates: TemplateRow[];
  usage: { action: string; templateId: string }[];
  events: { id: string; name: string; startAt: string | null }[];
  suppliers: { id: string; name: string }[];
  view: "grid" | "list";
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [applyTarget, setApplyTarget] = useState<TemplateRow | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const active = templates.filter((t) => t.isActive);
  const categoryOptions = useMemo(() => Array.from(new Set(active.map((t) => t.category).filter(Boolean))) as string[], [active]);

  const filtered = useMemo(() => {
    let list = active;
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
    return list;
  }, [active, categoryFilter, search]);

  const usedThisMonthCount = usage.length;
  const metrics = {
    active: active.length,
    usedThisMonth: usedThisMonthCount,
    eventTemplates: active.filter((t) => t.useCase && t.useCase !== "Onboarding").length,
    supplierTemplates: active.filter((t) => t.category === "Supplier Mgmt").length,
  };

  const usageByAction = {
    applied: usage.filter((u) => u.action === "applied").length,
    duplicated: usage.filter((u) => u.action === "duplicated").length,
    edited: usage.filter((u) => u.action === "edited").length,
  };

  const popularCategories = Array.from(
    active.reduce((m, t) => {
      const key = t.category ?? "Uncategorised";
      m.set(key, (m.get(key) ?? 0) + t.usedTimes);
      return m;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const recentlyUpdated = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const automationReadyCount = active.filter((t) => t.automationReady).length;
  const automationPct = active.length > 0 ? Math.round((automationReadyCount / active.length) * 100) : 0;

  function handleDuplicate(id: string) {
    startTransition(async () => { await duplicateTaskTemplate(id); });
    setMenuOpenId(null);
  }
  function handleArchive(id: string) {
    startTransition(async () => { await archiveTaskTemplate(id); });
    setMenuOpenId(null);
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <KPIGrid>
          <MetricCard label="Active Templates" value={metrics.active} icon={ListChecks} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Most Used This Month" value={metrics.usedThisMonth} icon={Sparkles} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Event Templates" value={metrics.eventTemplates} icon={Briefcase} iconBg="bg-info-50" iconColor="text-info-600" />
          <MetricCard label="Supplier Follow-up Templates" value={metrics.supplierTemplates} icon={Users} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full" />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700">
            <option value="all">Category: All</option>
            {categoryOptions.map((c) => <option key={c} value={c!}>{c}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={ListChecks}
              title="No task templates yet"
              description="Templates let you spin up a standard set of tasks for recurring event types."
              action={<Link href="/event-manager/tasks/templates/new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"><Plus className="w-4 h-4" />New Template</Link>}
              compact
            />
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((tpl) => {
              const Icon = ICONS[tpl.icon] ?? ListChecks;
              return (
                <div key={tpl.id} className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                    </div>
                    <div className="relative">
                      <button onClick={() => setMenuOpenId(menuOpenId === tpl.id ? null : tpl.id)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuOpenId === tpl.id && (
                        <div className="absolute right-0 top-9 z-10 w-40 bg-white rounded-xl border border-surface-200 shadow-lg py-1">
                          <button onClick={() => handleDuplicate(tpl.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 text-left"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
                          <Link href={`/event-manager/tasks/templates/${tpl.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-50"><Pencil className="w-3.5 h-3.5" /> Edit</Link>
                          <button onClick={() => handleArchive(tpl.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 text-left"><Archive className="w-3.5 h-3.5" /> Archive</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-surface-900">{tpl.name}</h3>
                  <p className="text-xs text-surface-500 mt-1 mb-4 line-clamp-2">{tpl.description}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                    <div><p className="text-surface-400">Category</p><p className="font-medium text-surface-800 truncate">{tpl.category ?? "General"}</p></div>
                    <div><p className="text-surface-400">Tasks</p><p className="font-medium text-surface-800">{tpl.taskCount}</p></div>
                    <div><p className="text-surface-400">Used</p><p className="font-medium text-surface-800">{tpl.usedTimes} times</p></div>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-surface-500">Owner {tpl.ownerName}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700 bg-success-50 px-2 py-0.5 rounded-full">Active</span>
                  </div>
                  <div className="mt-auto flex gap-2">
                    <button onClick={() => setApplyTarget(tpl)} className="flex-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">Apply</button>
                    <button onClick={() => handleDuplicate(tpl.id)} className="flex-1 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50 text-xs font-semibold">Duplicate</button>
                    <Link href={`/event-manager/tasks/templates/${tpl.id}/edit`} className="flex-1 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50 text-xs font-semibold text-center">Edit</Link>
                  </div>
                </div>
              );
            })}
            <Link href="/event-manager/tasks/templates/new" className="border-2 border-dashed border-surface-300 rounded-xl flex flex-col items-center justify-center p-8 text-center hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center mb-3"><Plus className="w-5 h-5 text-brand-600" /></div>
              <p className="text-sm font-semibold text-surface-800">Create New Template</p>
              <p className="text-xs text-surface-500 mt-1">Build a reusable checklist from scratch and save time on every event.</p>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            {filtered.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-3 px-5 py-3 border-b border-surface-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-900 truncate">{tpl.name}</p>
                  <p className="text-xs text-surface-400 truncate">{tpl.taskCount} tasks · Used {tpl.usedTimes} times</p>
                </div>
                <button onClick={() => setApplyTarget(tpl)} className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">Apply</button>
                <button onClick={() => handleDuplicate(tpl.id)} className="px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50 text-xs font-semibold">Duplicate</button>
                <Link href={`/event-manager/tasks/templates/${tpl.id}/edit`} className="px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 hover:bg-surface-50 text-xs font-semibold">Edit</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 space-y-4 hidden xl:block">
        <InsightCard title="Template Usage">
          <Donut
            centerLabel="Uses this month"
            centerValue={usedThisMonthCount}
            segments={[
              { label: "Applied", value: usageByAction.applied, color: "#4f46e5" },
              { label: "Duplicated", value: usageByAction.duplicated, color: "#0ea5e9" },
              { label: "Edited", value: usageByAction.edited, color: "#22c55e" },
            ]}
          />
        </InsightCard>
        <InsightCard title="Most Popular Categories"><BarList items={popularCategories} /></InsightCard>
        <InsightCard title="Recently Updated">
          <ul className="space-y-2">
            {recentlyUpdated.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-surface-700 truncate">{t.name}</span>
                <span className="text-xs text-surface-400 shrink-0">{formatDate(t.updatedAt)}</span>
              </li>
            ))}
          </ul>
          <Link href="#" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">View all templates →</Link>
        </InsightCard>
        <InsightCard title="Automation Readiness">
          <p className="text-3xl font-bold text-surface-900">{automationPct}%</p>
          <p className="text-xs text-success-600 font-medium mt-1">High potential for automation</p>
          <p className="text-xs text-surface-500 mt-1">{automationReadyCount} templates can be automated with rules</p>
        </InsightCard>
      </div>

      {applyTarget && (
        <ApplyTemplateModal template={applyTarget} events={events} suppliers={suppliers} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  );
}

function ApplyTemplateModal({
  template, events, suppliers, onClose,
}: { template: TemplateRow; events: { id: string; name: string }[]; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const [eventId, setEventId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function submit() {
    startTransition(async () => {
      await applyTaskTemplate(template.id, { eventId: eventId || null, supplierId: supplierId || null });
      setDone(true);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-success-700">{template.taskCount} tasks created from &ldquo;{template.name}&rdquo;</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">Done</button>
          </div>
        ) : (
          <>
            <h3 className="text-base font-semibold text-surface-900 mb-1">Apply &ldquo;{template.name}&rdquo;</h3>
            <p className="text-sm text-surface-500 mb-4">This creates {template.taskCount} real tasks, due-dated relative to the target event.</p>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Target Event (optional)</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3">
              <option value="">No event</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Target Supplier (optional)</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-5">
              <option value="">No supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
              <button onClick={submit} disabled={pending} className={cn("px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50")}>
                {pending ? "Applying…" : "Apply Template"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
