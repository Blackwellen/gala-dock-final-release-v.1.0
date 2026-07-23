"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, FileText, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPLATE_CATEGORIES, createTemplateFromScratch, uploadTemplateFile, type TemplateCategory } from "../actions";

type Mode = "scratch" | "upload";

export default function NewTemplatePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("scratch");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("Documents");
  const [eventType, setEventType] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [variables, setVariables] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!title.trim()) { setError("Template name is required"); return; }
    if (mode === "upload" && !file) { setError("Please choose a file to upload"); return; }
    setError(null);

    const fd = new FormData();
    fd.set("title", title);
    fd.set("category", category);
    fd.set("eventType", eventType);
    fd.set("description", description);

    startTransition(async () => {
      try {
        if (mode === "scratch") {
          fd.set("content", content);
          fd.set("variables", variables);
          const res = await createTemplateFromScratch(fd);
          router.push(`/event-manager/library/templates/${res.id}`);
        } else {
          fd.set("file", file as File);
          const res = await uploadTemplateFile(fd);
          router.push(`/event-manager/library/templates/${res.id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create template");
      }
    });
  }

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
        {/* Mode switch */}
        <div className="inline-flex items-center rounded-lg border border-surface-200 bg-white p-1">
          <button
            onClick={() => setMode("scratch")}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
              mode === "scratch" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:text-surface-700")}
          >
            <FileText className="w-4 h-4" /> Write from scratch
          </button>
          <button
            onClick={() => setMode("upload")}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
              mode === "upload" ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:text-surface-700")}
          >
            <Upload className="w-4 h-4" /> Upload a design file
          </button>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-surface-900">Template Details</h2>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Template Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gala Flyer Template"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Event type (optional)</label>
              <input
                type="text"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder="e.g. Gala, Wedding, Corporate"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {mode === "scratch" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Merge-field variables (comma separated)</label>
                <input
                  type="text"
                  value={variables}
                  onChange={(e) => setVariables(e.target.value)}
                  placeholder="e.g. event_name, event_date, venue"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Content</label>
                <textarea
                  rows={14}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your template content here…"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none font-mono"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Design file</label>
              <div
                onClick={() => inputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
                onDragOver={(e) => e.preventDefault()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-8 gap-2"
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
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-2 text-sm text-danger-700">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? "Creating…" : "Create Template"}
          </button>
          <button
            onClick={() => router.back()}
            disabled={pending}
            className="px-6 py-2.5 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
