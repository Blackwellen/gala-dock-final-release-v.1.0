"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import {
  LEAD_SOURCES,
  SOURCE_LABELS,
  CONTACT_METHODS,
  CONTACT_METHOD_LABELS,
  computeLeadScore,
  scoreLabel,
} from "../../lib";
import { ScoreRing, OwnerAvatar } from "@/components/sales/SalesPrimitives";
import { COUNTRY_CODES, inputCls, type WizardState, type MemberOption } from "../wizard-types";

function Field({
  label,
  required,
  children,
  className,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">
        {label}
        {required && <span className="text-danger-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-surface-400">{hint}</p>}
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
        {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ToggleGroup({
  options,
  labels,
  value,
  onChange,
}: {
  options: readonly string[];
  labels: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={
            "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors " +
            (value === opt
              ? "border-brand-500 bg-brand-600 text-white shadow-brand"
              : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50")
          }
        >
          {labels[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

export function ContactSourceStep({
  state,
  update,
  teamMembers,
  pending,
  onSaveDraft,
  onContinue,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  teamMembers: MemberOption[];
  pending: boolean;
  onSaveDraft: () => void;
  onContinue: () => void;
}) {
  const canContinue = !!(state.client_name.trim() && state.client_email.trim() && state.phone_local.trim());

  function toggleSource(source: string) {
    update({
      sources: state.sources.includes(source)
        ? state.sources.filter((s) => s !== source)
        : [...state.sources, source],
    });
  }

  const { total: predictedScore } = computeLeadScore({
    hasCompany: !!state.company_name.trim(),
    hasBudget: false,
    budgetCents: null,
    hasEventDate: false,
    hasVenue: false,
    guestCount: null,
    source: state.sources[0] ?? null,
    qualification: {},
  });

  const slaScore =
    state.preferred_contact_method === "phone"
      ? 95
      : state.preferred_contact_method === "whatsapp"
        ? 85
        : state.preferred_contact_method === "email" || state.preferred_contact_method === "either"
          ? 90
          : 80;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-28">
      <div className="lg:col-span-2 space-y-5">
        <SectionCard title="Contact Information" description="Who is making this enquiry?">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Lead Title">
              <select
                value={state.lead_title}
                onChange={(e) => update({ lead_title: e.target.value })}
                className={inputCls}
              >
                <option value="">—</option>
                {["Mr", "Mrs", "Ms", "Dr", "Other"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Full Name" required className="sm:col-span-2">
              <input
                type="text"
                value={state.client_name}
                onChange={(e) => update({ client_name: e.target.value })}
                placeholder="e.g. Sarah Carter"
                className={inputCls}
              />
            </Field>
            <Field
              label="Company / Organisation"
              className="sm:col-span-2"
              hint="Start typing to search or add a new company"
            >
              <input
                type="text"
                value={state.company_name}
                onChange={(e) => update({ company_name: e.target.value })}
                placeholder="e.g. Carter Events Ltd"
                className={inputCls}
              />
            </Field>
            <Field label="Job Title">
              <input
                type="text"
                value={state.job_title}
                onChange={(e) => update({ job_title: e.target.value })}
                placeholder="e.g. Head of Events"
                className={inputCls}
              />
            </Field>
            <Field label="Email Address" required>
              <input
                type="email"
                value={state.client_email}
                onChange={(e) => update({ client_email: e.target.value })}
                placeholder="sarah@example.co.uk"
                className={inputCls}
              />
            </Field>
            <Field label="Phone Number" required>
              <div className="flex gap-1.5">
                <select
                  value={state.country_code}
                  onChange={(e) => update({ country_code: e.target.value })}
                  className={inputCls + " w-24 shrink-0"}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={state.phone_local}
                  onChange={(e) => update({ phone_local: e.target.value })}
                  placeholder="7700 900000"
                  className={inputCls}
                />
              </div>
            </Field>
            <Field label="Alt Email">
              <input
                type="email"
                value={state.alt_email}
                onChange={(e) => update({ alt_email: e.target.value })}
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
            <Field label="Alt Phone">
              <input
                type="tel"
                value={state.alt_phone}
                onChange={(e) => update({ alt_phone: e.target.value })}
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Source & Engagement" description="How did this lead find us?">
          <Field label="Lead Source">
            <div className="flex flex-wrap gap-2">
              {LEAD_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  aria-pressed={state.sources.includes(s)}
                  className={
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors " +
                    (state.sources.includes(s)
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50")
                  }
                >
                  {SOURCE_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Preferred Contact Method">
            <ToggleGroup
              options={CONTACT_METHODS}
              labels={CONTACT_METHOD_LABELS}
              value={state.preferred_contact_method}
              onChange={(v) => update({ preferred_contact_method: v })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Enquiry Channel">
              <input
                type="text"
                value={state.enquiry_channel}
                onChange={(e) => update({ enquiry_channel: e.target.value })}
                placeholder="e.g. Instagram DM"
                className={inputCls}
              />
            </Field>
            <Field label="Assigned Owner">
              <select
                value={state.assigned_to}
                onChange={(e) => update({ assigned_to: e.target.value })}
                className={inputCls}
              >
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
      </div>

      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-surface-900">Lead Preview</h3>
          <div className="flex items-center gap-3">
            <OwnerAvatar name={state.client_name || "New Lead"} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-surface-900 truncate">
                {state.client_name || "New Lead"}
              </p>
              <p className="text-xs text-surface-500 truncate">
                {state.company_name || "No company"}
                {state.job_title ? ` · ${state.job_title}` : ""}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-surface-100">
            <div className="text-center">
              <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1">
                Lead Score (Predicted)
              </p>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-lg font-bold text-surface-900 tabular-nums">{predictedScore}</span>
                <span className="text-[10px] text-surface-500">{scoreLabel(predictedScore)}</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1">
                Response SLA
              </p>
              <div className="flex flex-col items-center">
                <ScoreRing score={slaScore} size={48} strokeWidth={4} />
                <span className="text-[10px] text-surface-500 mt-1">Within 24h</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-brand-50/60 rounded-xl border border-brand-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-brand-600" strokeWidth={2} />
            <h3 className="text-sm font-semibold text-surface-900">Quick Tips</h3>
          </div>
          <ul className="space-y-2 text-xs text-surface-600">
            <li>
              <span className="font-semibold text-surface-800">Be specific.</span> A clear job title and
              company help you tailor the proposal later.
            </li>
            <li>
              <span className="font-semibold text-surface-800">Multiple sources.</span> Select every
              channel that influenced this enquiry — it sharpens attribution reporting.
            </li>
            <li>
              <span className="font-semibold text-surface-800">Right owner.</span> Assign the team
              member best placed to respond quickly.
            </li>
          </ul>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-surface-200 px-6 py-4 z-10">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/event-manager/leads"
              className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-60"
            >
              Save Draft
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-surface-400 hidden sm:inline">Step 1 of 3</span>
            <button
              type="button"
              onClick={onContinue}
              disabled={pending || !canContinue}
              className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 shadow-brand"
            >
              {pending ? "Saving…" : "Continue to Event Details"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
