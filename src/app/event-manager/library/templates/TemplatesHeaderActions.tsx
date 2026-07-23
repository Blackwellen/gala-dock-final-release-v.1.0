"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Upload, X, Loader2 } from "lucide-react";
import { TEMPLATE_CATEGORIES, uploadTemplateFile, type TemplateCategory } from "./actions";

export function TemplatesHeaderActions() {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setImportOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
      >
        <Upload className="w-4 h-4" />
        Import template
      </button>
      <Link
        href="/event-manager/library/templates/new"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create template
      </Link>
      {importOpen && <ImportTemplateModal onClose={() => setImportOpen(false)} />}
    </>
  );
}

function ImportTemplateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("Documents");
  const [eventType, setEventType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!file) { setError("Please choose a file to import"); return; }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("title", title || file.name.replace(/\.[^.]+$/, ""));
    fd.set("category", category);
    fd.set("eventType", eventType);
    startTransition(async () => {
      try {
        const res = await uploadTemplateFile(fd);
        onClose();
        router.push(`/event-manager/library/templates/${res.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-surface-900">Import template</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400"><X className="w-4 h-4" /></button>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-8 gap-2 mb-4"
        >
          <Upload className="h-6 w-6 text-surface-400" />
          <p className="text-sm text-surface-600 font-medium">{file ? file.name : "Drop a file or browse"}</p>
          <p className="text-xs text-surface-400">PDF, Word, PowerPoint, images, ZIP · Max 50 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.gif,.webp,.svg"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <label className="block text-xs font-medium text-surface-700 mb-1.5">Template name</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gala Flyer Template" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3" />

        <label className="block text-xs font-medium text-surface-700 mb-1.5">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-3">
          {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="block text-xs font-medium text-surface-700 mb-1.5">Event type (optional)</label>
        <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Gala, Wedding, Corporate" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm mb-4" />

        {error && <p className="text-xs text-danger-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
          <button onClick={submit} disabled={pending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? "Importing…" : "Import template"}
          </button>
        </div>
      </div>
    </div>
  );
}
