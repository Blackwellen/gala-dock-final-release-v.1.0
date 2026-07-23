import Link from "next/link";
import { X, ListChecks } from "lucide-react";
import { createTaskTemplate } from "../../actions";

export const metadata = { title: "New Task Template" };

export default function NewTaskTemplatePage() {
  return (
    <form action={createTaskTemplate} className="flex flex-col min-h-full bg-surface-50">
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/event-manager/tasks?tab=templates" className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors" aria-label="Close">
            <X className="w-5 h-5" strokeWidth={2} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <ListChecks className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-lg font-bold text-surface-900 leading-none">New Task Template</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/event-manager/tasks?tab=templates" className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-600 hover:bg-surface-50 transition-colors">Cancel</Link>
          <button type="submit" className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm transition-colors">Create Template</button>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-5">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">Template Name <span className="text-danger-500">*</span></label>
            <input name="name" required placeholder="e.g. Corporate Conference Launch" className="w-full px-4 py-3 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-surface-700 mb-1.5">Description</label>
            <textarea name="description" rows={3} placeholder="What this template is for…" className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Category</label>
              <input name="category" placeholder="e.g. Corporate Events" className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-1.5">Use Case</label>
              <input name="use_case" placeholder="e.g. Conference" className="w-full px-3 py-2.5 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>
        <p className="text-xs text-surface-400">You&apos;ll add individual template tasks on the next screen.</p>
      </div>
    </form>
  );
}
