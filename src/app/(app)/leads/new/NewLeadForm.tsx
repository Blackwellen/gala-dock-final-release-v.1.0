"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Megaphone } from "lucide-react";
import {
  LEAD_STAGES,
  LEAD_SOURCES,
  EVENT_TYPES,
  STAGE_LABELS,
  SOURCE_LABELS,
} from "../lib";
import { createLead } from "../actions";

export interface MemberOption {
  id: string;
  name: string;
}

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

/** True for Next.js redirect/notFound control-flow errors, which must re-throw. */
function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">
        {label}
        {required && <span className="text-danger-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
      <div className="pb-3 border-b border-surface-100">
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
        {description && (
          <p className="text-xs text-surface-500 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function NewLeadForm({ teamMembers }: { teamMembers: MemberOption[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createLead(fd);
      } catch (err) {
        if (isControlFlowError(err)) throw err;
        setError(err instanceof Error ? err.message : "Failed to create lead");
      }
    });
  }

  return (
    <div className="animate-fade-in min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center gap-3 shrink-0">
        <Link
          href="/leads"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </Link>
        <div className="h-5 w-px bg-surface-200" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
            <Megaphone className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
          </div>
          <h1 className="text-sm font-semibold text-surface-900">New Lead</h1>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-5"
      >
        {error && (
          <div className="p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">
            {error}
          </div>
        )}

        <SectionCard
          title="Enquiry Details"
          description="Who is making this enquiry?"
        >
          <Field label="Lead Title" required>
            <input
              name="title"
              type="text"
              required
              placeholder="e.g. Carter Wedding Sept 2026"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client Name" required>
              <input
                name="client_name"
                type="text"
                required
                placeholder="e.g. Sarah Carter"
                className={inputCls}
              />
            </Field>
            <Field label="Company / Organisation">
              <input
                name="company_name"
                type="text"
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
            <Field label="Client Email">
              <input
                name="client_email"
                type="email"
                placeholder="sarah@example.co.uk"
                className={inputCls}
              />
            </Field>
            <Field label="Client Phone">
              <input
                name="client_phone"
                type="tel"
                placeholder="+44 7700 900000"
                className={inputCls}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Event Details" description="What are they planning?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Event Type">
              <select name="event_type" defaultValue="" className={inputCls}>
                <option value="">Select type…</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estimated Event Date">
              <input name="event_date" type="date" className={inputCls} />
            </Field>
            <Field label="Location / Venue">
              <input
                name="event_location"
                type="text"
                placeholder="Free text at this stage"
                className={inputCls}
              />
            </Field>
            <Field label="Estimated Guest Count">
              <input
                name="guest_count_estimate"
                type="number"
                min={0}
                placeholder="e.g. 120"
                className={inputCls}
              />
            </Field>
            <Field label="Budget Estimate (£ GBP)">
              <input
                name="budget_estimate"
                type="number"
                min={0}
                step="1"
                placeholder="e.g. 8500"
                className={inputCls}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Pipeline" description="Where does this sit?">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Stage">
              <select name="stage" defaultValue="new-enquiry" className={inputCls}>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <select name="source" defaultValue="" className={inputCls}>
                <option value="">Select source…</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned To">
              <select name="assigned_to" defaultValue="" className={inputCls}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Notes">
          <Field label="Initial Notes">
            <textarea
              name="notes"
              rows={4}
              placeholder="Anything useful from the first conversation…"
              className={inputCls + " resize-none"}
            />
          </Field>
        </SectionCard>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/leads"
            className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60 shadow-brand"
          >
            {pending ? "Saving…" : "Save Lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
