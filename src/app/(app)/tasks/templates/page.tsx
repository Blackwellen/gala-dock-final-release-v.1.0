import Link from "next/link";
import { FileText, LayoutList, ListChecks } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PRIORITY_META } from "../task-utils";
import type { TaskPriority } from "@/lib/supabase/types";

export const metadata = { title: "Task Templates" };

export default async function TaskTemplatesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("task_templates")
    .select("id, name, created_at")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  const templateIds = (templates ?? []).map((t) => t.id);
  const itemsByTemplate = new Map<
    string,
    { id: string; title: string; list_name: string; priority: TaskPriority; offset_days: number }[]
  >();

  if (templateIds.length > 0) {
    const { data: items } = await supabase
      .from("task_template_items")
      .select("id, template_id, title, list_name, priority, offset_days")
      .in("template_id", templateIds)
      .order("offset_days", { ascending: true });

    for (const it of items ?? []) {
      const list = itemsByTemplate.get(it.template_id) ?? [];
      list.push({
        id: it.id,
        title: it.title,
        list_name: it.list_name,
        priority: it.priority,
        offset_days: it.offset_days,
      });
      itemsByTemplate.set(it.template_id, list);
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Task Templates"
        description="Reusable checklists you can apply to events and supplier follow-ups."
        actions={
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <LayoutList className="w-4 h-4" />
            All Tasks
          </Link>
        }
      />

      <div className="flex-1 p-6">
        {(templates ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={FileText}
              title="No task templates yet"
              description="Templates let you spin up a standard set of tasks for recurring event types."
              compact
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(templates ?? []).map((tpl) => {
              const items = itemsByTemplate.get(tpl.id) ?? [];
              return (
                <div key={tpl.id} className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <ListChecks className="w-4.5 h-4.5 text-brand-600" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-surface-900 truncate">{tpl.name}</h3>
                        <p className="text-xs text-surface-400">
                          {items.length} task{items.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-surface-400 italic">No items in this template.</p>
                  ) : (
                    <ul className="divide-y divide-surface-100">
                      {items.map((it) => {
                        const meta = PRIORITY_META[it.priority];
                        return (
                          <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-surface-800 truncate">{it.title}</p>
                              <p className="text-xs text-surface-400 mt-0.5">
                                {it.list_name} · Due {it.offset_days >= 0 ? "+" : ""}{it.offset_days}d
                              </p>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${meta.classes}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotColor}`} />
                              {meta.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
