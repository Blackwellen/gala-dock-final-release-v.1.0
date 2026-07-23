"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Plus, LayoutList, LayoutGrid, FileText, ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabNav } from "@/components/ui/TabNav";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/supabase/types";
import { MyTasksView } from "./_views/MyTasksView";
import { AllTasksView } from "./_views/AllTasksView";
import { EventTasksView } from "./_views/EventTasksView";
import { SupplierTasksView } from "./_views/SupplierTasksView";
import { OverdueView } from "./_views/OverdueView";
import { TemplatesView } from "./_views/TemplatesView";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  originalDueAt: string | null;
  rescheduleCount: number;
  eventId: string | null;
  eventName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  assignees: { userId: string; name: string }[];
  isMine: boolean;
  overdue: boolean;
  category: string | null;
  phase: string | null;
  nextAction: string | null;
  isMilestone: boolean;
  milestoneLabel: string | null;
  checklist: { done: number; total: number };
  source: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  useCase: string | null;
  icon: string;
  isActive: boolean;
  automationReady: boolean;
  taskCount: number;
  usedTimes: number;
  ownerName: string;
  updatedAt: string;
  items: { id: string; title: string; priority: TaskPriority; offsetDays: number; listName: string }[];
}

export type TaskTab = "my" | "all" | "event" | "supplier" | "overdue" | "templates";

const TAB_TO_QUERY: Record<TaskTab, string> = {
  my: "my-tasks",
  all: "all-tasks",
  event: "event-tasks",
  supplier: "supplier-tasks",
  overdue: "overdue",
  templates: "templates",
};
const QUERY_TO_TAB: Record<string, TaskTab> = Object.fromEntries(
  Object.entries(TAB_TO_QUERY).map(([k, v]) => [v, k])
) as Record<string, TaskTab>;

export function TasksWorkspaceClient({
  rows, templates, templateUsage, events, suppliers,
}: {
  rows: TaskRow[];
  templates: TemplateRow[];
  templateUsage: { action: string; templateId: string }[];
  events: { id: string; name: string; startAt: string | null }[];
  suppliers: { id: string; name: string }[];
  members: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [newTaskMenuOpen, setNewTaskMenuOpen] = useState(false);

  const tab = QUERY_TO_TAB[searchParams.get("tab") ?? ""] ?? "my";
  const view = (searchParams.get("view") as "list" | "kanban" | "grid" | null) ?? undefined;

  function setParams(next: { tab?: TaskTab; view?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tab) params.set("tab", TAB_TO_QUERY[next.tab]);
    if (next.view) params.set("view", next.view);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const counts = useMemo(() => ({
    my: rows.filter((r) => r.isMine).length,
    all: rows.length,
    event: rows.filter((r) => r.eventId).length,
    supplier: rows.filter((r) => r.supplierId).length,
    overdue: rows.filter((r) => r.overdue).length,
    templates: templates.length,
  }), [rows, templates]);

  const TABS = [
    { id: "my", label: "My Tasks", count: counts.my },
    { id: "all", label: "All Tasks", count: counts.all },
    { id: "event", label: "Event Tasks", count: counts.event },
    { id: "supplier", label: "Supplier Tasks", count: counts.supplier },
    { id: "overdue", label: "Overdue", count: counts.overdue, badge: "danger" as const },
    { id: "templates", label: "Templates", count: counts.templates },
  ];

  const isTemplates = tab === "templates";
  const showViewSwitch = tab !== "overdue"; // overdue is Kanban-only per reference
  const currentView = isTemplates ? (view ?? "grid") : (view ?? (tab === "all" || tab === "overdue" ? "kanban" : "list"));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Tasks"
        description="Track and manage all event tasks, supplier actions, and team assignments."
        actions={
          <>
            {!isTemplates && (
              <button
                onClick={() => setParams({ tab: "templates" })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Task Templates
              </button>
            )}
            {isTemplates && (
              <button
                onClick={() => setParams({ tab: "my" })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
              >
                <LayoutList className="w-4 h-4" />
                All Tasks
              </button>
            )}

            {(showViewSwitch || isTemplates) && (
              <div className="flex rounded-lg border border-surface-200 bg-white overflow-hidden">
                <button
                  onClick={() => setParams({ view: isTemplates ? "grid" : "list" })}
                  className={cn(
                    "px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors",
                    currentView === (isTemplates ? "grid" : "list") ? "bg-brand-50 text-brand-600" : "text-surface-500 hover:text-surface-800"
                  )}
                >
                  {isTemplates ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
                  {isTemplates ? "Grid" : "List"}
                </button>
                <button
                  onClick={() => setParams({ view: isTemplates ? "list" : "kanban" })}
                  className={cn(
                    "px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors border-l border-surface-200",
                    currentView === (isTemplates ? "list" : "kanban") ? "bg-brand-50 text-brand-600" : "text-surface-500 hover:text-surface-800"
                  )}
                >
                  {isTemplates ? <LayoutList className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  {isTemplates ? "List" : "Kanban"}
                </button>
              </div>
            )}

            <div className="relative">
              <div className="flex rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors overflow-hidden">
                <Link
                  href={isTemplates ? "#" : "/event-manager/tasks/new"}
                  onClick={isTemplates ? (e) => { e.preventDefault(); setNewTaskMenuOpen((v) => !v); } : undefined}
                  className="inline-flex items-center gap-1.5 pl-4 pr-3 py-2 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  {isTemplates ? "New Template" : "New Task"}
                </Link>
                <button
                  onClick={() => setNewTaskMenuOpen((v) => !v)}
                  className="px-2 border-l border-white/20"
                  aria-label="More create options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              {newTaskMenuOpen && (
                <div className="absolute right-0 top-11 z-20 w-56 bg-white rounded-xl border border-surface-200 shadow-lg py-1">
                  {isTemplates ? (
                    <>
                      <MenuLink href="/event-manager/tasks/templates/new">Blank Template</MenuLink>
                      <MenuLink href="/event-manager/tasks/templates/new?kind=event">Event Template</MenuLink>
                      <MenuLink href="/event-manager/tasks/templates/new?kind=supplier">Supplier Follow-up Template</MenuLink>
                    </>
                  ) : (
                    <>
                      <MenuLink href="/event-manager/tasks/new">New Task</MenuLink>
                      <MenuLink href="/event-manager/tasks/new?kind=event">New Event Task</MenuLink>
                      <MenuLink href="/event-manager/tasks/new?kind=supplier">New Supplier Task</MenuLink>
                      <MenuLink href="/event-manager/tasks/new?fromTemplate=1">Create from Template</MenuLink>
                      <MenuLink href="/event-manager/tasks/new?recurring=1">Create Recurring Task</MenuLink>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        }
        tabs={
          <TabNav
            tabs={TABS}
            active={tab}
            onChange={(id) => setParams({ tab: id as TaskTab })}
          />
        }
      />

      <div className="flex-1 p-6">
        {tab === "my" && <MyTasksView rows={rows} />}
        {tab === "all" && <AllTasksView rows={rows} view={currentView === "list" ? "list" : "kanban"} />}
        {tab === "event" && <EventTasksView rows={rows} />}
        {tab === "supplier" && <SupplierTasksView rows={rows} suppliers={suppliers} />}
        {tab === "overdue" && <OverdueView rows={rows} />}
        {tab === "templates" && (
          <TemplatesView
            templates={templates}
            usage={templateUsage}
            events={events}
            suppliers={suppliers}
            view={currentView === "list" ? "list" : "grid"}
          />
        )}
      </div>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
      {children}
    </Link>
  );
}
