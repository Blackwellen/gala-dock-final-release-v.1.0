"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, ListChecks, Trash2, Plus } from "lucide-react";
import type { TaskTemplate, TaskTemplateItem, TaskPriority } from "@/lib/supabase/types";
import { PRIORITY_META } from "../../../task-utils";
import { updateTaskTemplate, addTemplateItem, removeTemplateItem } from "../../../actions";

export function TemplateEditClient({ template, items }: { template: TaskTemplate; items: TaskTemplateItem[] }) {
  const [, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [newOffset, setNewOffset] = useState("0");
  const [newPriority, setNewPriority] = useState<TaskPriority>("p3");

  function saveMeta(formData: FormData) {
    startTransition(async () => { await updateTaskTemplate(template.id, formData); });
  }

  function addItem() {
    if (!newTitle.trim()) return;
    const fd = new FormData();
    fd.set("title", newTitle.trim());
    fd.set("offset_days", newOffset);
    fd.set("priority", newPriority);
    fd.set("list_name", template.category ?? "General");
    startTransition(async () => {
      await addTemplateItem(template.id, fd);
      setNewTitle("");
      setNewOffset("0");
    });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/event-manager/tasks?tab=templates" className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors" aria-label="Close">
            <X className="w-5 h-5" strokeWidth={2} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <ListChecks className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-lg font-bold text-surface-900 leading-none">Edit Template</h1>
          </div>
        </div>
        <Link href="/event-manager/tasks?tab=templates" className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors">Done</Link>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-5">
        <form action={saveMeta} className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">Template Name</label>
            <input name="name" defaultValue={template.name} required className="w-full px-4 py-3 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">Description</label>
            <textarea name="description" defaultValue={template.description ?? ""} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Category</label>
              <input name="category" defaultValue={template.category ?? ""} className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Use Case</label>
              <input name="use_case" defaultValue={template.use_case ?? ""} className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">Save Changes</button>
        </form>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-800">Template Tasks <span className="text-surface-400 font-normal">{items.length}</span></h3>
          </div>
          {items.length === 0 ? (
            <p className="px-5 py-6 text-sm text-surface-400 italic">No tasks yet — add one below.</p>
          ) : (
            <ul className="divide-y divide-surface-100">
              {items.map((it) => {
                const meta = PRIORITY_META[it.priority];
                return (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800 truncate">{it.title}</p>
                      <p className="text-xs text-surface-400 mt-0.5">{it.list_name} · Due {it.offset_days >= 0 ? "+" : ""}{it.offset_days}d</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${meta.classes}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotColor}`} />
                      {meta.label}
                    </span>
                    <button
                      onClick={() => startTransition(async () => { await removeTemplateItem(template.id, it.id); })}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-5 py-4 border-t border-surface-200 bg-surface-50/50 flex flex-wrap items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New task title…" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-surface-300 text-sm" />
            <input value={newOffset} onChange={(e) => setNewOffset(e.target.value)} type="number" placeholder="Offset days" className="w-28 px-3 py-2 rounded-lg border border-surface-300 text-sm" />
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as TaskPriority)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">
              {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>
            <button onClick={addItem} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
