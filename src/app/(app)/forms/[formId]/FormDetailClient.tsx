"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Pencil,
  Copy,
  Check,
  Send,
  Archive,
  Trash2,
  Download,
  Inbox,
  CalendarClock,
  Code2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabNav } from "@/components/ui/TabNav";
import type { FieldType, FormType, FormStatus } from "@/lib/supabase/types";
import { FORM_TYPE_LABELS, formatDateTime, formatDateShort } from "../lib";
import { publishForm, setFormStatus, deleteForm } from "../actions";

export interface DetailField {
  id: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
}

export interface DetailSubmission {
  id: string;
  createdAt: string;
  submitterName: string | null;
  submitterEmail: string | null;
  data: Record<string, unknown>;
  createdLeadId: string | null;
}

interface FormSummary {
  id: string;
  title: string;
  description: string | null;
  formType: FormType;
  status: FormStatus;
  shareToken: string | null;
  submissionCount: number;
}

function publicUrl(token: string): string {
  if (typeof window === "undefined") return `/f/${token}`;
  return `${window.location.origin}/f/${token}`;
}

function valueToText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  const s = String(v);
  return s.trim() === "" ? "—" : s;
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export function FormDetailClient({
  form,
  fields,
  submissions,
}: {
  form: FormSummary;
  fields: DetailField[];
  submissions: DetailSubmission[];
}) {
  const [tab, setTab] = useState<"overview" | "submissions">("overview");
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [open, setOpen] = useState<DetailSubmission | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputFields = useMemo(
    () => fields.filter((f) => f.fieldType !== "section-header"),
    [fields]
  );
  const previewFields = inputFields.slice(0, 3);
  const lastSubmission = submissions[0]?.createdAt ?? null;
  const link = form.shareToken ? publicUrl(form.shareToken) : null;
  const embed = link ? `<iframe src="${link}" width="100%" height="700" frameborder="0"></iframe>` : null;

  async function copy(text: string, which: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch {
      /* ignore */
    }
  }

  function exportCsv() {
    const headers = ["Submitted", "Name", "Email", ...inputFields.map((f) => f.label)];
    const lines = [headers.map(csvEscape).join(",")];
    for (const s of submissions) {
      const row = [
        new Date(s.createdAt).toISOString(),
        s.submitterName ?? "",
        s.submitterEmail ?? "",
        ...inputFields.map((f) => valueToText(s.data[f.id]).replace(/^—$/, "")),
      ];
      lines.push(row.map((c) => csvEscape(String(c))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={form.title}
        description={FORM_TYPE_LABELS[form.formType] + " form"}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={form.status} />
            <Link
              href={`/forms/${form.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
            >
              <Pencil className="w-4 h-4" /> Edit
            </Link>
            {form.status !== "published" && (
              <button
                disabled={isPending}
                onClick={() => startTransition(() => void publishForm(form.id))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Publish
              </button>
            )}
          </div>
        }
        tabs={
          <TabNav
            active={tab}
            onChange={(id) => setTab(id as "overview" | "submissions")}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "submissions", label: "Submissions", count: submissions.length },
            ]}
          />
        }
      />

      <div className="p-6 space-y-6">
        {tab === "overview" ? (
          <>
            <KPIGrid>
              <MetricCard label="Total Submissions" value={form.submissionCount} icon={Inbox} />
              <MetricCard
                label="Fields"
                value={inputFields.length}
                icon={Code2}
                iconColor="text-info-600"
                iconBg="bg-info-50"
              />
              <MetricCard
                label="Last Response"
                value={formatDateShort(lastSubmission)}
                icon={CalendarClock}
                iconColor="text-violet-600"
                iconBg="bg-violet-50"
              />
            </KPIGrid>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-surface-900">Public link</h2>
                {link ? (
                  <div className="mt-2 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="flex-1 min-w-0 truncate rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-sm text-surface-700">
                        {link}
                      </code>
                      <button
                        onClick={() => copy(link, "link")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
                      >
                        {copied === "link" ? (
                          <>
                            <Check className="w-4 h-4 text-success-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" /> Copy Link
                          </>
                        )}
                      </button>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
                      >
                        Open
                      </a>
                    </div>
                    {embed && (
                      <div>
                        <p className="text-xs font-medium text-surface-500 mb-1">Embed code</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 min-w-0 truncate rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-xs text-surface-600">
                            {embed}
                          </code>
                          <button
                            onClick={() => copy(embed, "embed")}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
                          >
                            {copied === "embed" ? (
                              <Check className="w-4 h-4 text-success-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-surface-500">
                    Publish this form to generate a shareable public link.
                  </p>
                )}
              </div>

              {form.description && (
                <div className="pt-4 border-t border-surface-100">
                  <h3 className="text-sm font-semibold text-surface-900">Description</h3>
                  <p className="mt-1 text-sm text-surface-600">{form.description}</p>
                </div>
              )}

              <div className="pt-4 border-t border-surface-100 flex items-center gap-2 flex-wrap">
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() =>
                      void setFormStatus(
                        form.id,
                        form.status === "archived" ? "draft" : "archived"
                      )
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
                >
                  <Archive className="w-4 h-4" />
                  {form.status === "archived" ? "Restore" : "Archive"}
                </button>
                <button
                  disabled={isPending}
                  onClick={() => {
                    if (confirm("Delete this form? This cannot be undone.")) {
                      startTransition(() => void deleteForm(form.id));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-danger-200 bg-white text-sm font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-900">
                {submissions.length} submission{submissions.length === 1 ? "" : "s"}
              </h2>
              {submissions.length > 0 && (
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              )}
            </div>

            {submissions.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No submissions yet"
                description="Responses to this form will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-surface-400 border-b border-surface-100">
                      <th className="px-5 py-3 font-medium">Submitted</th>
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Email</th>
                      {previewFields.map((f) => (
                        <th key={f.id} className="px-5 py-3 font-medium">
                          {f.label}
                        </th>
                      ))}
                      <th className="px-5 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-surface-50 hover:bg-surface-50/60 cursor-pointer"
                        onClick={() => setOpen(s)}
                      >
                        <td className="px-5 py-3 text-surface-600 whitespace-nowrap">
                          {formatDateTime(s.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-surface-900">
                          {s.submitterName ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-surface-600">
                          {s.submitterEmail ?? "—"}
                        </td>
                        {previewFields.map((f) => (
                          <td key={f.id} className="px-5 py-3 text-surface-600 max-w-[180px] truncate">
                            {valueToText(s.data[f.id])}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-right">
                          <span className="text-brand-600 font-medium">View</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-surface-900/40 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
              <div>
                <h3 className="text-sm font-semibold text-surface-900">Submission</h3>
                <p className="text-xs text-surface-400">{formatDateTime(open.createdAt)}</p>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="p-1.5 rounded-md hover:bg-surface-100 text-surface-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="px-5 py-4 space-y-3">
              {inputFields.map((f) => (
                <div key={f.id}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-surface-400">
                    {f.label}
                  </dt>
                  <dd className="text-sm text-surface-800 whitespace-pre-wrap">
                    {valueToText(open.data[f.id])}
                  </dd>
                </div>
              ))}
              {open.createdLeadId && (
                <div className="pt-2">
                  <Link
                    href={`/leads/${open.createdLeadId}`}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    View linked lead →
                  </Link>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
