"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  CheckCircle2,
  Inbox,
  CalendarPlus,
  Copy,
  Check,
  Archive,
  Pencil,
  Eye,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, SALES_TABS } from "@/components/ui/SectionTabs";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FormType, FormStatus } from "@/lib/supabase/types";
import { FORM_TYPE_LABELS, formatDateShort } from "./lib";
import { setFormStatus } from "./actions";

export interface FormCard {
  id: string;
  title: string;
  formType: FormType;
  status: FormStatus;
  submissionCount: number;
  shareToken: string | null;
  lastSubmissionAt: string | null;
}

export interface FormsKpis {
  total: number;
  published: number;
  totalSubmissions: number;
  newThisMonth: number;
}

const STATUS_FILTERS: { id: "all" | FormStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
];

function publicUrl(token: string): string {
  if (typeof window === "undefined") return `/f/${token}`;
  return `${window.location.origin}/f/${token}`;
}

export function FormsClient({ forms, kpis }: { forms: FormCard[]; kpis: FormsKpis }) {
  const [filter, setFilter] = useState<"all" | FormStatus>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = useMemo(
    () => (filter === "all" ? forms : forms.filter((f) => f.status === filter)),
    [forms, filter]
  );

  async function copyLink(card: FormCard) {
    if (!card.shareToken) return;
    try {
      await navigator.clipboard.writeText(publicUrl(card.shareToken));
      setCopiedId(card.id);
      setTimeout(() => setCopiedId((c) => (c === card.id ? null : c)), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function archive(card: FormCard) {
    startTransition(() => {
      void setFormStatus(card.id, card.status === "archived" ? "draft" : "archived");
    });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Forms"
        description="Build enquiry, RSVP and feedback forms to share with clients and guests."
        tabs={<SectionTabs tabs={SALES_TABS} />}
        actions={
          <Link
            href="/event-manager/forms/new"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            New Form
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        <KPIGrid>
          <MetricCard label="Total Forms" value={kpis.total} icon={FileText} />
          <MetricCard
            label="Published"
            value={kpis.published}
            icon={CheckCircle2}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Total Submissions"
            value={kpis.totalSubmissions}
            icon={Inbox}
            iconColor="text-info-600"
            iconBg="bg-info-50"
          />
          <MetricCard
            label="New This Month"
            value={kpis.newThisMonth}
            icon={CalendarPlus}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
        </KPIGrid>

        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors " +
                (filter === f.id
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-surface-600 border-surface-200 hover:border-surface-300")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200">
            <EmptyState
              icon={FileText}
              title={forms.length === 0 ? "No forms yet" : "No forms match this filter"}
              description={
                forms.length === 0
                  ? "Create your first form to collect enquiries, RSVPs or feedback."
                  : "Try a different status filter."
              }
              action={
                forms.length === 0 ? (
                  <Link
                    href="/event-manager/forms/new"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Form
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((card) => (
              <div
                key={card.id}
                className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/event-manager/forms/${card.id}`}
                    className="font-semibold text-surface-900 hover:text-brand-600 transition-colors line-clamp-2"
                  >
                    {card.title}
                  </Link>
                  <StatusBadge status={card.status} />
                </div>

                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 font-medium">
                    {FORM_TYPE_LABELS[card.formType]}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-surface-400 uppercase tracking-wide">Submissions</dt>
                    <dd className="font-semibold text-surface-900 tabular-nums">
                      {card.submissionCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-surface-400 uppercase tracking-wide">Last response</dt>
                    <dd className="font-medium text-surface-700">
                      {formatDateShort(card.lastSubmissionAt)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 pt-4 border-t border-surface-100 flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/event-manager/forms/${card.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> View
                  </Link>
                  <Link
                    href={`/event-manager/forms/${card.id}/edit`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Link>
                  {card.status === "published" && card.shareToken && (
                    <button
                      onClick={() => copyLink(card)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100 transition-colors"
                    >
                      {copiedId === card.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-success-600" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Link
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => archive(card)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100 transition-colors ml-auto"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {card.status === "archived" ? "Restore" : "Archive"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
