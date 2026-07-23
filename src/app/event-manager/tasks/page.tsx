import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Task, TaskTemplate, TaskTemplateItem, TaskTemplateUsage } from "@/lib/supabase/types";
import { TasksWorkspaceClient, type TaskRow, type TemplateRow } from "./TasksWorkspaceClient";
import { isOverdue } from "./task-utils";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: taskRows } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const tasks = (taskRows ?? []) as Task[];
  const taskIds = tasks.map((t) => t.id);

  const eventIds = Array.from(new Set(tasks.map((t) => t.event_id).filter(Boolean))) as string[];
  const eventById = new Map<string, { name: string; start_at: string | null }>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name, start_at")
      .eq("workspace_id", workspaceId)
      .in("id", eventIds);
    for (const ev of events ?? []) eventById.set(ev.id, { name: ev.name, start_at: ev.start_at });
  }

  const supplierIds = Array.from(new Set(tasks.map((t) => t.supplier_id).filter(Boolean))) as string[];
  const supplierById = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", supplierIds);
    for (const s of suppliers ?? []) supplierById.set(s.id, s.name);
  }

  const assigneesByTask = new Map<string, { userId: string; name: string }[]>();
  const myTaskIds = new Set<string>();
  if (taskIds.length > 0) {
    const { data: assignees } = await supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);

    const assigneeUserIds = Array.from(new Set((assignees ?? []).map((a) => a.user_id)));
    const nameByUser = new Map<string, string>();
    if (assigneeUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", assigneeUserIds);
      for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name ?? "Unknown");
    }

    for (const a of assignees ?? []) {
      if (a.user_id === user.id) myTaskIds.add(a.task_id);
      const list = assigneesByTask.get(a.task_id) ?? [];
      list.push({ userId: a.user_id, name: nameByUser.get(a.user_id) ?? "Unknown" });
      assigneesByTask.set(a.task_id, list);
    }
  }

  // Checklist progress (done/total) per task.
  const checklistByTask = new Map<string, { done: number; total: number }>();
  if (taskIds.length > 0) {
    const { data: checklist } = await supabase
      .from("task_checklist_items")
      .select("task_id, is_done")
      .in("task_id", taskIds);
    for (const c of checklist ?? []) {
      const cur = checklistByTask.get(c.task_id) ?? { done: 0, total: 0 };
      cur.total += 1;
      if (c.is_done) cur.done += 1;
      checklistByTask.set(c.task_id, cur);
    }
  }

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueAt: t.due_at,
    originalDueAt: t.original_due_at,
    rescheduleCount: t.reschedule_count ?? 0,
    eventId: t.event_id,
    eventName: t.event_id ? eventById.get(t.event_id)?.name ?? null : null,
    supplierId: t.supplier_id,
    supplierName: t.supplier_id ? supplierById.get(t.supplier_id) ?? null : null,
    assignees: assigneesByTask.get(t.id) ?? [],
    isMine: myTaskIds.has(t.id),
    overdue: isOverdue(t),
    category: t.category,
    phase: t.phase,
    nextAction: t.next_action,
    isMilestone: t.is_milestone,
    milestoneLabel: t.milestone_label,
    checklist: checklistByTask.get(t.id) ?? { done: 0, total: 0 },
    source: t.source,
  }));

  // ── Task templates ──────────────────────────────────────────────────────
  const { data: templateRows } = await supabase
    .from("task_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  const templates = (templateRows ?? []) as TaskTemplate[];
  const templateIds = templates.map((t) => t.id);

  const itemsByTemplate = new Map<string, TaskTemplateItem[]>();
  if (templateIds.length > 0) {
    const { data: items } = await supabase
      .from("task_template_items")
      .select("*")
      .in("template_id", templateIds);
    for (const it of (items ?? []) as TaskTemplateItem[]) {
      const list = itemsByTemplate.get(it.template_id) ?? [];
      list.push(it);
      itemsByTemplate.set(it.template_id, list);
    }
  }

  const usageByTemplate = new Map<string, TaskTemplateUsage[]>();
  let allUsage: TaskTemplateUsage[] = [];
  if (templateIds.length > 0) {
    const { data: usage } = await supabase
      .from("task_template_usage")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("template_id", templateIds);
    allUsage = (usage ?? []) as TaskTemplateUsage[];
    for (const u of allUsage) {
      const list = usageByTemplate.get(u.template_id) ?? [];
      list.push(u);
      usageByTemplate.set(u.template_id, list);
    }
  }

  const ownerIds = Array.from(new Set(templates.map((t) => t.created_by).filter(Boolean))) as string[];
  const ownerNameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);
    for (const p of profiles ?? []) ownerNameById.set(p.user_id, p.display_name ?? "Unknown");
  }

  const templateRowsOut: TemplateRow[] = templates.map((t) => {
    const items = itemsByTemplate.get(t.id) ?? [];
    const usage = usageByTemplate.get(t.id) ?? [];
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      useCase: t.use_case,
      icon: t.icon,
      isActive: t.is_active,
      automationReady: t.automation_ready,
      taskCount: items.length,
      usedTimes: usage.filter((u) => u.action === "applied").length,
      ownerName: t.created_by ? ownerNameById.get(t.created_by) ?? "Workspace" : "Workspace",
      updatedAt: t.updated_at,
      items: items.map((it) => ({
        id: it.id,
        title: it.title,
        priority: it.priority,
        offsetDays: it.offset_days,
        listName: it.list_name,
      })),
    };
  });

  // Events + suppliers for "Apply template" target pickers.
  const { data: allEvents } = await supabase
    .from("events")
    .select("id, name, start_at")
    .eq("workspace_id", workspaceId)
    .order("start_at", { ascending: true })
    .limit(50);
  const { data: allSuppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .limit(100);

  // Workspace members for assignment pickers.
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const memberIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));
  const memberNameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    for (const p of profiles ?? []) memberNameById.set(p.user_id, p.display_name ?? "Unknown");
  }

  return (
    <TasksWorkspaceClient
      rows={rows}
      templates={templateRowsOut}
      templateUsage={allUsage.map((u) => ({ action: u.action, templateId: u.template_id }))}
      events={(allEvents ?? []).map((e) => ({ id: e.id, name: e.name, startAt: e.start_at }))}
      suppliers={(allSuppliers ?? []).map((s) => ({ id: s.id, name: s.name }))}
      members={memberIds.map((id) => ({ id, name: memberNameById.get(id) ?? "Unknown" }))}
      currentUserId={user.id}
    />
  );
}
