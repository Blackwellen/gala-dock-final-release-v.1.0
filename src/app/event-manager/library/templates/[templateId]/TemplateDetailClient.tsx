"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Copy, Lock, Unlock, Archive, Download, FileText, History, CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import { formatBytes, formatLibDate } from "../../library-utils";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "../actions";
import { STATUS_TONE_CLASSES, templateStatus } from "../template-helpers";
import {
  updateTemplateMetadata, duplicateTemplate, archiveTemplate, toggleTemplateLock,
} from "../actions";

export interface TemplateDetail {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  category: string;
  eventType: string | null;
  variables: string[];
  status: "draft" | "in_review" | "approved";
  content: string;
  mime: string | null;
  sizeBytes: number;
  storagePath: string | null;
  fileUrl: string | null;
  coverUrl: string | null;
  format: string;
  ownerId: string | null;
  ownerName: string;
  visibility: string;
  sharedTeam: string | null;
  useCount: number;
  lastUsedAt: string | null;
  lockedAt: string | null;
  lockedByName: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  linkedEventName: string | null;
  isMine: boolean;
}

export interface VersionRow {
  id: string;
  version: number;
  note: string | null;
  authorName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface LinkedEventUsage {
  id: string;
  title: string;
  eventName: string | null;
  createdAt: string;
}

export function TemplateDetailClient({
  template, versions, usage,
}: { template: TemplateDetail; versions: VersionRow[]; usage: LinkedEventUsage[] }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description ?? "");
  const [category, setCategory] = useState<TemplateCategory>(
    (TEMPLATE_CATEGORIES as readonly string[]).includes(template.category)
      ? (template.category as TemplateCategory)
      : "Documents"
  );
  const [eventType, setEventType] = useState(template.eventType ?? "");
  const [variables, setVariables] = useState(template.variables.join(", "));
  const [status, setStatus] = useState(template.status);
  const [content, setContent] = useState(template.content);

  const statusInfo = templateStatus(template.lockedAt, { status: template.status });
  const isTextTemplate = !template.storagePath;

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("description", description);
    fd.set("category", category);
    fd.set("eventType", eventType);
    fd.set("variables", variables);
    fd.set("status", status);
    if (isTextTemplate) fd.set("content", content);
    startTransition(async () => {
      try {
        await updateTemplateMetadata(template.id, fd);
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save changes");
      }
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateTemplate(template.id);
      router.push(`/event-manager/library/templates/${res.id}`);
    });
  }
  function handleArchive() {
    if (!confirm("Archive this template?")) return;
    startTransition(async () => {
      await archiveTemplate(template.id);
      router.push("/event-manager/library/templates");
    });
  }
  function handleLockToggle() {
    startTransition(async () => { await toggleTemplateLock(template.id); });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={template.title}
        description={template.description ?? `${template.category}${template.eventType ? ` · ${template.eventType}` : ""}`}
        actions={
          <>
            <button
              onClick={() => router.push("/event-manager/library/templates")}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border", STATUS_TONE_CLASSES[statusInfo.tone])}>
              {statusInfo.tone === "locked" && <Lock className="w-3 h-3" />}
              {statusInfo.label}
            </span>
            {isEditing ? (
              <button
                onClick={save}
                disabled={pending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {pending ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
              >
                Edit details
              </button>
            )}
            <button
              onClick={handleDuplicate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={handleLockToggle}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              {template.lockedAt ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {template.lockedAt ? "Unlock" : "Lock"}
            </button>
            <button
              onClick={handleArchive}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-danger-600 text-sm font-medium hover:bg-danger-50 transition-colors"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-5xl w-full space-y-6">
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-2 text-sm text-danger-700">{error}</div>
        )}

        {/* Meta strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetaTile label="Category" value={template.category} />
          <MetaTile label="Event type" value={template.eventType ?? "—"} />
          <MetaTile label="Format" value={template.format} />
          <MetaTile label="Times used" value={String(template.useCount)} />
        </div>

        {/* Preview / content */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-900">Preview</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400">{formatBytes(template.sizeBytes)}</span>
              {template.fileUrl && (
                <a href={template.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              )}
            </div>
          </div>
          <div className="p-6">
            {isTextTemplate ? (
              isEditing ? (
                <textarea
                  rows={16}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none font-mono leading-relaxed"
                />
              ) : (
                <pre className="text-sm text-surface-700 whitespace-pre-wrap leading-relaxed font-mono">
                  {content || "No content yet — click Edit details to add merge-field content."}
                </pre>
              )
            ) : template.coverUrl ? (
              <img src={template.coverUrl} alt={template.title} className="max-h-[480px] mx-auto rounded-lg border border-surface-100" />
            ) : template.mime?.startsWith("image/") && template.fileUrl ? (
              <img src={template.fileUrl} alt={template.title} className="max-h-[480px] mx-auto rounded-lg border border-surface-100" />
            ) : template.mime === "application/pdf" && template.fileUrl ? (
              <iframe src={template.fileUrl} className="w-full h-[480px] rounded-lg border border-surface-100" title={template.title} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-surface-400">
                <FileText className="w-10 h-10 mb-2" strokeWidth={1.5} />
                <p className="text-sm">No inline preview available for this file type.</p>
                {template.fileUrl && <a href={template.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 mt-1 hover:underline">Open file</a>}
              </div>
            )}
          </div>
        </div>

        {/* Edit metadata form */}
        {isEditing && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-surface-900">Template details</h3>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Template name</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
                  {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Event type</label>
                <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g. Gala, Wedding" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Merge-field variables (comma separated)</label>
              <input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="e.g. event_name, event_date, venue" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Approval status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
                <option value="draft">Draft</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>
        )}

        {!isEditing && template.variables.length > 0 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Merge-field variables</h3>
            <div className="flex flex-wrap gap-2">
              {template.variables.map((v) => (
                <span key={v} className="px-2 py-1 rounded-md bg-surface-100 text-surface-600 text-xs font-mono">{`{{${v}}}`}</span>
              ))}
            </div>
          </div>
        )}

        {/* Version history */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4 flex items-center gap-2"><History className="w-4 h-4 text-surface-400" /> Version history</h3>
          {versions.length === 0 ? (
            <p className="text-sm text-surface-400">No prior versions recorded — this is the only version (v1).</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-100">
                  <div>
                    <p className="text-sm font-medium text-surface-900">v{v.version}.0 {v.note ? `— ${v.note}` : ""}</p>
                    <p className="text-xs text-surface-400">{v.authorName} · {formatBytes(v.sizeBytes)}</p>
                  </div>
                  <span className="text-xs text-surface-400">{formatLibDate(v.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Events using this template */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-surface-400" /> Events using this template</h3>
          {template.linkedEventName && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-brand-50 border border-brand-100 mb-2">
              <span className="text-sm font-medium text-surface-900">This copy was created for {template.linkedEventName}</span>
            </div>
          )}
          {usage.length === 0 ? (
            <p className="text-sm text-surface-400">No copies have been created from this template yet — use &ldquo;Use template&rdquo; from the Templates list to create one.</p>
          ) : (
            <div className="space-y-2">
              {usage.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-100 hover:bg-surface-100 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-surface-900">{u.title}</p>
                    <p className="text-xs text-surface-400">{u.eventName ?? "No event linked"} · {formatLibDate(u.createdAt)}</p>
                  </div>
                  <Link href={`/event-manager/library/templates/${u.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium">View</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
      <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-surface-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}
