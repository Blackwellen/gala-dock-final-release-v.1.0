"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function NewTemplatePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    type: "",
    description: "",
    content: "",
  });

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-surface-900">New Template</h1>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-surface-900">Template Details</h2>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Template Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Wedding Day Run Sheet"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Template Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">Select type…</option>
              <option value="run-sheet">Run Sheet</option>
              <option value="task-list">Task List</option>
              <option value="brief">Brief</option>
              <option value="email">Email</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of when to use this template"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Content</label>
            <textarea
              rows={14}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Write your template content here…"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">
            Create Template
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
