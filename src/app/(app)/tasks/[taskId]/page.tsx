"use client";

import { useState, useRef } from "react";
import {
  ArrowLeft, Edit2, CheckCircle2, Archive, MessageSquare,
  Calendar, Link2, Plus, Send, Clock, FileText,
  Upload, Download, Trash2, User, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { cn } from "@/lib/utils";

// ── Seed data ─────────────────────────────────────────────────────────────────

const TASK = {
  id: "t1",
  title: "Confirm catering arrangements",
  description:
    "Contact Noble Kitchen Co. to confirm the final catering brief including menu selection, dietary requirements, cover count, and delivery timing. Ensure quantities match the revised guest list and brief the venue coordinator.",
  event: "The Carter Wedding",
  eventId: "ev1",
  supplier: "Noble Kitchen Co.",
  supplierId: "s1",
  assignee: "Sophie Clarke",
  assigneeInitials: "SC",
  dueDate: "8 Jun 2026",
  priority: "high" as const,
  status: "overdue" as const,
  type: "Supplier",
  createdDate: "2 Jun 2026",
  createdBy: "Marcus Webb",
};

const COMMENTS_INIT = [
  {
    id: "c1",
    author: "Marcus Webb",
    initials: "MW",
    text: "Sophie, please chase Noble Kitchen today — they need 48 hours notice for any changes to the menu. Confirm the vegetarian cover count especially.",
    time: "2 Jun 2026, 09:14",
  },
  {
    id: "c2",
    author: "Sophie Clarke",
    initials: "SC",
    text: "I've emailed Sarah Noble and left a voicemail. Will follow up this afternoon if no response. Also checking the updated guest dietary list with the client.",
    time: "2 Jun 2026, 11:32",
  },
];

interface AttachmentItem {
  id: string;
  name: string;
  size: string;
  date: string;
  type: "pdf" | "xlsx" | "doc" | "other";
}

const ATTACHMENTS_INIT: AttachmentItem[] = [
  { id: "f1", name: "catering_brief.pdf",  size: "24 KB", date: "2 Jun 2026", type: "pdf"  },
  { id: "f2", name: "menu_v2.xlsx",         size: "18 KB", date: "3 Jun 2026", type: "xlsx" },
];

const ACTIVITY = [
  { id: "a1", icon: Plus,           color: "text-brand-600 bg-brand-50",     text: "Task created by Marcus Webb",                time: "2 Jun 2026, 09:00" },
  { id: "a2", icon: User,           color: "text-violet-600 bg-violet-50",   text: "Assigned to Sophie Clarke",                  time: "2 Jun 2026, 09:02" },
  { id: "a3", icon: MessageSquare,  color: "text-surface-500 bg-surface-100",text: "Comment added by Marcus Webb",               time: "2 Jun 2026, 09:14" },
  { id: "a4", icon: Clock,          color: "text-danger-600 bg-danger-50",   text: "Task became overdue (due date passed)",      time: "8 Jun 2026, 00:00" },
];

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: "details",     label: "Details"     },
  { id: "comments",    label: "Comments",   count: COMMENTS_INIT.length },
  { id: "attachments", label: "Attachments", count: ATTACHMENTS_INIT.length },
  { id: "activity",    label: "Activity"    },
];

const PRIORITY_MAP = {
  high:   { label: "High",   cls: "bg-danger-50 text-danger-600 border border-danger-200" },
  medium: { label: "Medium", cls: "bg-warning-50 text-warning-600 border border-warning-200" },
  low:    { label: "Low",    cls: "bg-surface-100 text-surface-500 border border-surface-200" },
  urgent: { label: "Urgent", cls: "bg-danger-100 text-danger-700 border border-danger-300" },
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TaskDetailPage() {
  const [activeTab, setActiveTab] = useState("details");
  const [title, setTitle] = useState(TASK.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  function commitTitle() {
    const t = titleDraft.trim();
    if (t) setTitle(t);
    else setTitleDraft(title);
    setEditingTitle(false);
  }

  const priority = TASK.priority;
  const pMap = PRIORITY_MAP[priority] ?? PRIORITY_MAP.medium;

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-surface-200">
        <div className="px-6 py-4">
          {/* Back + actions row */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All Tasks
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                Edit
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-500 hover:bg-surface-50 transition-colors">
                <Archive className="w-3.5 h-3.5" strokeWidth={1.8} />
                Archive
              </button>
              <button className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-success-600 hover:bg-success-700 text-white text-sm font-medium shadow-sm transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                Mark Complete
              </button>
            </div>
          </div>

          {/* Title row — inline editable */}
          <div className="flex items-start gap-3 min-w-0 mb-3">
            {/* Assignee avatar */}
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
              {TASK.assigneeInitials}
            </div>
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTitle();
                    if (e.key === "Escape") { setTitleDraft(title); setEditingTitle(false); }
                  }}
                  className="w-full text-xl font-bold text-surface-900 bg-transparent border-b-2 border-brand-500 focus:outline-none pb-0.5 leading-tight"
                />
              ) : (
                <h1
                  onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
                  className="text-xl font-bold text-surface-900 leading-tight cursor-text hover:text-brand-700 transition-colors"
                  title="Click to edit"
                >
                  {title}
                </h1>
              )}
              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium", pMap.cls)}>
                  {pMap.label} Priority
                </span>
                <StatusBadge status={TASK.status} />
                <span className="text-xs text-surface-400">Due {TASK.dueDate}</span>
                <span className="text-xs text-surface-400 hidden sm:inline">· Created {TASK.createdDate} by {TASK.createdBy}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <div className="px-6">
          <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 max-w-4xl mx-auto w-full" key={activeTab}>
        {activeTab === "details"     && <DetailsTab />}
        {activeTab === "comments"    && <CommentsTab />}
        {activeTab === "attachments" && <AttachmentsTab />}
        {activeTab === "activity"    && <ActivityTab />}
      </div>
    </div>
  );
}

// ── Tab: Details ──────────────────────────────────────────────────────────────

function DetailsTab() {
  const [description, setDescription] = useState(TASK.description);
  const [editingDesc, setEditingDesc] = useState(false);

  return (
    <div className="space-y-5">
      {/* Description */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-800">Description</h3>
          {!editingDesc && (
            <button
              onClick={() => setEditingDesc(true)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              Edit
            </button>
          )}
        </div>
        <div className="px-5 py-4">
          {editingDesc ? (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="w-full px-3 py-2.5 text-sm text-surface-800 border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none transition-colors"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingDesc(false)}
                  className="px-3 py-1.5 text-xs font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setEditingDesc(false)}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-surface-700 leading-relaxed">
              {description || <span className="text-surface-400 italic">No description added.</span>}
            </p>
          )}
        </div>
      </div>

      {/* Metadata grid */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200">
          <h3 className="text-sm font-semibold text-surface-800">Task Information</h3>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <MetaRow label="Due Date">
            <div className="flex items-center gap-1.5 text-sm text-danger-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />
              {TASK.dueDate} — Overdue
            </div>
          </MetaRow>

          <MetaRow label="Assignee">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center">
                {TASK.assigneeInitials}
              </div>
              <span className="text-sm text-surface-800">{TASK.assignee}</span>
            </div>
          </MetaRow>

          <MetaRow label="Linked Event">
            <Link
              href={`/events/${TASK.eventId}`}
              className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline font-medium"
            >
              <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
              {TASK.event}
            </Link>
          </MetaRow>

          <MetaRow label="Linked Supplier">
            <Link
              href={`/suppliers/${TASK.supplierId}`}
              className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline font-medium"
            >
              <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
              {TASK.supplier}
            </Link>
          </MetaRow>

          <MetaRow label="Priority">
            <span className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
              PRIORITY_MAP[TASK.priority]?.cls ?? ""
            )}>
              {PRIORITY_MAP[TASK.priority]?.label}
            </span>
          </MetaRow>

          <MetaRow label="Task Type">
            <span className="text-sm text-surface-800">{TASK.type}</span>
          </MetaRow>

          <MetaRow label="Created By">
            <span className="text-sm text-surface-800">{TASK.createdBy}</span>
          </MetaRow>

          <MetaRow label="Created At">
            <div className="flex items-center gap-1.5 text-sm text-surface-800">
              <Calendar className="w-3.5 h-3.5 text-surface-400" strokeWidth={1.8} />
              {TASK.createdDate}
            </div>
          </MetaRow>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  );
}

// ── Tab: Comments ─────────────────────────────────────────────────────────────

function CommentsTab() {
  const [comments, setComments] = useState(COMMENTS_INIT);
  const [draft, setDraft] = useState("");

  function postComment() {
    const text = draft.trim();
    if (!text) return;
    setComments((prev) => [
      ...prev,
      {
        id: `c${Date.now()}`,
        author: "You",
        initials: "YO",
        text,
        time: "Just now",
      },
    ]);
    setDraft("");
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      {/* Thread */}
      <div className="divide-y divide-surface-100">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
              {c.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-sm font-semibold text-surface-900">{c.author}</span>
                <span className="text-xs text-surface-400">{c.time}</span>
              </div>
              <p className="text-sm text-surface-700 leading-relaxed">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="px-5 py-4 border-t border-surface-200 bg-surface-50/50">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
            YO
          </div>
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) postComment();
              }}
              rows={3}
              placeholder="Write a comment…"
              className="w-full px-3 py-2.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-surface-400 resize-none transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-surface-400">⌘ + Enter to submit</span>
              <button
                onClick={postComment}
                disabled={!draft.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={2} />
                Post Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Attachments ──────────────────────────────────────────────────────────

function AttachmentsTab() {
  const [files, setFiles] = useState<AttachmentItem[]>(ATTACHMENTS_INIT);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files;
    if (!raw) return;
    const newFiles: AttachmentItem[] = Array.from(raw).map((f) => ({
      id: `f${Date.now()}-${f.name}`,
      name: f.name,
      size: f.size < 1024 ? `${f.size} B` : `${Math.round(f.size / 1024)} KB`,
      date: "Just now",
      type: f.name.endsWith(".pdf") ? "pdf"
           : f.name.endsWith(".xlsx") || f.name.endsWith(".xls") ? "xlsx"
           : f.name.endsWith(".doc") || f.name.endsWith(".docx") ? "doc"
           : "other",
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  }

  function deleteFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const iconColor: Record<AttachmentItem["type"], string> = {
    pdf:   "text-danger-500",
    xlsx:  "text-success-600",
    doc:   "text-brand-500",
    other: "text-surface-400",
  };

  return (
    <div className="space-y-5">
      {/* Upload area */}
      <label className="block cursor-pointer">
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          multiple
          onChange={handleUpload}
          accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png"
        />
        <div className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-surface-300 rounded-xl bg-white hover:bg-surface-50 hover:border-brand-400 transition-all">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
            <Upload className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-surface-800">Drop files or click to upload</p>
            <p className="text-xs text-surface-400 mt-0.5">PDF, Word, Excel, images — max 25 MB each</p>
          </div>
          <span className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors">
            Browse Files
          </span>
        </div>
      </label>

      {/* File list */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="divide-y divide-surface-100">
            {files.map((f) => (
              <div key={f.id} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 transition-colors">
                <FileText className={cn("w-5 h-5 shrink-0", iconColor[f.type])} strokeWidth={1.6} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">{f.name}</p>
                  <p className="text-xs text-surface-400 mt-0.5">{f.size} · Uploaded {f.date}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => deleteFile(f.id)}
                    className="p-1.5 rounded-lg text-surface-400 hover:bg-danger-50 hover:text-danger-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Activity ─────────────────────────────────────────────────────────────

function ActivityTab() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card px-5 py-5">
      <h3 className="text-sm font-semibold text-surface-800 mb-5">Activity Log</h3>
      <ol className="relative space-y-5">
        {ACTIVITY.map((item, i) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", item.color)}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                </div>
                {i < ACTIVITY.length - 1 && (
                  <div className="w-px flex-1 bg-surface-200 mt-1.5 min-h-[20px]" />
                )}
              </div>
              <div className="pt-1.5">
                <p className="text-sm text-surface-800">{item.text}</p>
                <p className="text-xs text-surface-400 mt-0.5">{item.time}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
