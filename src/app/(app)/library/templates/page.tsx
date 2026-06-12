"use client";

import { useRouter } from "next/navigation";
import { Plus, Edit2, Copy, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

type TemplateType = "run-sheet" | "task-list" | "brief" | "email";

const TYPE_LABELS: Record<TemplateType, string> = {
  "run-sheet": "Run Sheet",
  "task-list": "Task List",
  "brief":     "Brief",
  "email":     "Email",
};

const TYPE_COLORS: Record<TemplateType, string> = {
  "run-sheet": "bg-brand-50 text-brand-700 border-brand-100",
  "task-list": "bg-success-50 text-success-700 border-success-100",
  "brief":     "bg-warning-50 text-warning-700 border-warning-100",
  "email":     "bg-violet-50 text-violet-700 border-violet-100",
};

const TEMPLATES = [
  { id: "1", name: "Standard Wedding Run Sheet", type: "run-sheet" as TemplateType, eventsUsed: 8,  created: "15 Jan 2026" },
  { id: "2", name: "Corporate Event Brief",      type: "brief"     as TemplateType, eventsUsed: 5,  created: "3 Feb 2026"  },
  { id: "3", name: "Event Day Task Checklist",   type: "task-list" as TemplateType, eventsUsed: 12, created: "20 Feb 2026" },
  { id: "4", name: "Supplier Confirmation Email",type: "email"     as TemplateType, eventsUsed: 18, created: "1 Mar 2026"  },
];

export default function TemplatesPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Templates"
        description="Reusable documents and blueprints for your events"
        actions={
          <button
            onClick={() => router.push("/library/templates/new")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        }
      />

      <div className="flex-1 p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-surface-100">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Template Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Events Used</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {TEMPLATES.map((tpl) => (
                  <tr
                    key={tpl.id}
                    className="group hover:bg-surface-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/library/templates/${tpl.id}`)}
                  >
                    <td className="px-6 py-3 font-medium text-surface-900">{tpl.name}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[tpl.type]}`}>
                        {TYPE_LABELS[tpl.type]}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-surface-600">{tpl.eventsUsed}</td>
                    <td className="px-6 py-3 text-surface-500">{tpl.created}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors" title="Duplicate">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-danger-50 text-surface-400 hover:text-danger-600 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
