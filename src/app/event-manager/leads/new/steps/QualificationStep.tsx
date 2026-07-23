"use client";

import { useState } from "react";
import { Lock, Plus, TrendingUp, X } from "lucide-react";
import {
  LEAD_STAGES,
  STAGE_LABELS,
  PRIORITY_LEVELS,
  FOLLOW_UP_CADENCES,
  QUALIFICATION_ITEMS,
  NEXT_ACTION_TEMPLATES,
  SOURCE_LABELS,
  computeLeadScore,
  scoreLabel,
} from "../../lib";
import { ScoreRing, formatMoneyRange } from "@/components/sales/SalesPrimitives";
import { inputCls, type WizardState, type MemberOption, type WizardStep } from "../wizard-types";

function SectionCard({
  title,
  description,
  headerExtra,
  children,
}: {
  title: string;
  description?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
      <div className="pb-3 border-b border-surface-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">{title}</h2>
          {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const SCORE_DIMENSIONS: { key: keyof ReturnType<typeof computeLeadScore>["breakdown"]; label: string; max: number; dot: string }[] = [
  { key: "fit", label: "Fit", max: 25, dot: "bg-brand-500" },
  { key: "budget", label: "Budget", max: 25, dot: "bg-success-500" },
  { key: "need", label: "Need", max: 25, dot: "bg-info-500" },
  { key: "timing", label: "Timing", max: 15, dot: "bg-warning-500" },
  { key: "engagement", label: "Engagement", max: 10, dot: "bg-violet-500" },
];

export function QualificationStep({
  state,
  update,
  teamMembers,
  pending,
  onSaveDraft,
  onBack,
  onEditStep,
  onCreate,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  teamMembers: MemberOption[];
  pending: boolean;
  onSaveDraft: () => void;
  onBack: () => void;
  onEditStep: (step: WizardStep) => void;
  onCreate: (openAfter: boolean) => void;
}) {
  const [customAction, setCustomAction] = useState("");

  const qualifiedCount = Object.values(state.qualification).filter(Boolean).length;

  function toggleQualification(key: string) {
    update({ qualification: { ...state.qualification, [key]: !state.qualification[key] } });
  }

  function addNextAction(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    update({
      next_actions: [...state.next_actions, { id: crypto.randomUUID(), label: trimmed, done: false }],
    });
  }

  const budgetMaxCents = state.budget_max ? Math.round(Number(state.budget_max) * 100) : null;
  const budgetMinCents = state.budget_min ? Math.round(Number(state.budget_min) * 100) : null;

  const { total: score, breakdown } = computeLeadScore({
    hasCompany: !!state.company_name.trim(),
    hasBudget: !!(state.budget_min.trim() || state.budget_max.trim()),
    budgetCents: budgetMaxCents ?? budgetMinCents,
    hasEventDate: !!state.event_date.trim(),
    hasVenue: !!state.event_location.trim(),
    guestCount: state.guest_count_estimate ? Number(state.guest_count_estimate) : null,
    source: state.sources[0] ?? null,
    qualification: state.qualification,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-28">
      <div className="lg:col-span-2 space-y-5">
        <SectionCard title="Pipeline Qualification" description="Where does this lead sit today?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Stage">
              <select value={state.stage} onChange={(e) => update({ stage: e.target.value })} className={inputCls}>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <div className="flex gap-2">
                {PRIORITY_LEVELS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => update({ priority: p })}
                    aria-pressed={state.priority === p}
                    className={
                      "flex-1 px-3 py-2 text-xs font-medium rounded-lg border capitalize transition-colors " +
                      (state.priority === p
                        ? "border-brand-500 bg-brand-600 text-white shadow-brand"
                        : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50")
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Probability to Win (%)">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={state.probability_pct}
                  onChange={(e) => update({ probability_pct: e.target.value })}
                  placeholder="e.g. 60"
                  className={inputCls}
                />
                <TrendingUp
                  className={
                    "w-4 h-4 shrink-0 " +
                    (Number(state.probability_pct) >= 60
                      ? "text-success-500"
                      : Number(state.probability_pct) >= 30
                        ? "text-warning-500"
                        : "text-surface-300")
                  }
                  strokeWidth={2}
                />
              </div>
            </Field>
            <Field label="Estimated Pipeline Value">
              <p className={inputCls + " flex items-center bg-surface-50 text-surface-600"}>
                {formatMoneyRange(budgetMinCents, budgetMaxCents, state.currency)}
              </p>
            </Field>
            <Field label="Response Due Date">
              <input
                type="date"
                value={state.response_due_date}
                onChange={(e) => update({ response_due_date: e.target.value })}
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
            <Field label="Follow Up Cadence">
              <select
                value={state.follow_up_cadence}
                onChange={(e) => update({ follow_up_cadence: e.target.value })}
                className={inputCls}
              >
                <option value="">Select…</option>
                {FOLLOW_UP_CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input
              type="checkbox"
              checked={state.decision_maker}
              onChange={(e) => update({ decision_maker: e.target.checked })}
              className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            This contact is the decision maker
          </label>
        </SectionCard>

        <SectionCard
          title="Qualification Checklist"
          headerExtra={
            <span className="text-xs font-semibold text-surface-500 tabular-nums">
              {qualifiedCount}/{QUALIFICATION_ITEMS.length}
            </span>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {QUALIFICATION_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={!!state.qualification[item.key]}
                  onChange={() => toggleQualification(item.key)}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                {item.label}
              </label>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Notes & Requirements">
          <Field label="Notes & Requirements">
            <textarea
              rows={3}
              maxLength={2000}
              value={state.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Client-facing notes about this lead…"
              className={inputCls + " resize-none"}
            />
            <p className="mt-1 text-right text-[11px] text-surface-400">{state.notes.length}/2000</p>
          </Field>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-surface-600 mb-1.5">
              <Lock className="w-3 h-3" strokeWidth={2} />
              Internal Comments
            </label>
            <textarea
              rows={3}
              value={state.internal_comments}
              onChange={(e) => update({ internal_comments: e.target.value })}
              placeholder="Visible only to your team…"
              className={inputCls + " resize-none"}
            />
            <p className="mt-1 text-[11px] text-surface-400">
              Internal comments must never be shown in client-facing proposals.
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-900">Lead Review Summary</h3>
            <button
              type="button"
              onClick={() => onEditStep("contact")}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Edit
            </button>
          </div>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Contact</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.client_name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Company</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.company_name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Email</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.client_email || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Phone</dt>
              <dd className="text-surface-800 font-medium text-right truncate">
                {state.phone_local ? `${state.country_code} ${state.phone_local}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Source</dt>
              <dd className="text-surface-800 font-medium text-right truncate">
                {state.sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ") || "—"}
              </dd>
            </div>
            <div className="pt-2 mt-1 border-t border-surface-100 flex items-center justify-between">
              <span className="text-surface-400">Event details</span>
              <button
                type="button"
                onClick={() => onEditStep("event-details")}
                className="text-brand-600 hover:text-brand-700 font-medium"
              >
                Edit
              </button>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Event Type</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.event_type || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Event Date</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.event_date || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Venue / Location</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.event_location || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Guests</dt>
              <dd className="text-surface-800 font-medium text-right truncate">
                {state.guest_count_estimate || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Budget</dt>
              <dd className="text-surface-800 font-medium text-right truncate">
                {formatMoneyRange(budgetMinCents, budgetMaxCents, state.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-surface-400">Notes</dt>
              <dd className="text-surface-800 font-medium text-right truncate">{state.notes || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-surface-900">Next Actions</h3>
          <div className="flex flex-wrap gap-2">
            {NEXT_ACTION_TEMPLATES.filter((t) => !state.next_actions.some((a) => a.label === t)).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addNextAction(t)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 transition-colors"
              >
                <Plus className="w-3 h-3" strokeWidth={2.5} />
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customAction}
              onChange={(e) => setCustomAction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNextAction(customAction);
                  setCustomAction("");
                }
              }}
              placeholder="+ Add custom action"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => {
                addNextAction(customAction);
                setCustomAction("");
              }}
              className="px-3 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shrink-0"
            >
              Add
            </button>
          </div>
          {state.next_actions.length > 0 && (
            <ul className="space-y-1">
              {state.next_actions.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 text-xs text-surface-700 bg-surface-50 rounded-lg px-2 py-1.5"
                >
                  <span className="truncate">{a.label}</span>
                  <button
                    type="button"
                    onClick={() => update({ next_actions: state.next_actions.filter((x) => x.id !== a.id) })}
                    aria-label="Remove action"
                  >
                    <X className="w-3 h-3 text-surface-400" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-3">Lead Score</h3>
          <div className="flex items-center gap-5">
            <ScoreRing score={score} size={120} strokeWidth={9} label={scoreLabel(score)} />
            <div className="flex-1 space-y-2">
              {SCORE_DIMENSIONS.map((d) => (
                <div key={d.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-surface-600">
                    <span className={"w-1.5 h-1.5 rounded-full " + d.dot} />
                    {d.label}
                  </span>
                  <span className="font-medium text-surface-800 tabular-nums">
                    {breakdown[d.key]} / {d.max}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-surface-200 px-6 py-4 z-10">
        <div className="max-w-6xl mx-auto w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-60"
            >
              Save Draft
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCreate(false)}
              disabled={pending}
              className="px-4 py-2 text-sm font-semibold text-brand-700 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-60"
            >
              Create Lead
            </button>
            <button
              type="button"
              onClick={() => onCreate(true)}
              disabled={pending}
              className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 shadow-brand"
            >
              {pending ? "Creating…" : "Create & Open Lead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
