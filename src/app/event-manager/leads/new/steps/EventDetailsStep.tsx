"use client";

import { useState } from "react";
import { Info, Lock, UploadCloud, X, Calendar, MapPin, Users, Wallet, Ticket, Layers } from "lucide-react";
import { EVENT_TYPES, EventTypeChip, formatMoneyRange } from "@/components/sales/SalesPrimitives";
import {
  EVENT_FORMATS,
  EVENT_FORMAT_LABELS,
  DATE_FLEXIBILITY_OPTIONS,
  TICKETING_TYPES,
  VENUE_TYPE_OPTIONS,
} from "../../lib";
import { inputCls, TIMEZONES, type WizardState } from "../wizard-types";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">{label}</label>
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
        {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SnapshotRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="w-3.5 h-3.5 text-surface-400 mt-0.5 shrink-0" strokeWidth={2} />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wide">{label}</p>
        <p className="text-xs font-medium text-surface-800 truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export function EventDetailsStep({
  state,
  update,
  pending,
  onSaveDraft,
  onBack,
  onContinue,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  pending: boolean;
  onSaveDraft: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [showUploadNote, setShowUploadNote] = useState(false);

  function toggleVenueType(v: string) {
    update({
      venue_types: state.venue_types.includes(v)
        ? state.venue_types.filter((x) => x !== v)
        : [...state.venue_types, v],
    });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || state.tags.includes(t)) return;
    update({ tags: [...state.tags, t] });
    setTagInput("");
  }

  function addLink() {
    const url = linkInput.trim();
    if (!url) return;
    update({ reference_links: [...state.reference_links, { url, label: url }] });
    setLinkInput("");
  }

  const budgetMinCents = state.budget_min ? Math.round(Number(state.budget_min) * 100) : null;
  const budgetMaxCents = state.budget_max ? Math.round(Number(state.budget_max) * 100) : null;

  return (
    <div className="space-y-5 pb-28">
      <div className="flex items-start gap-3 p-4 bg-info-50 border border-info-200 rounded-xl">
        <Info className="w-4 h-4 text-info-600 mt-0.5 shrink-0" strokeWidth={2} />
        <p className="text-sm text-info-800">
          Great! Now let&apos;s capture the key details about their event so we can craft the perfect
          proposal. Not sure yet? That&apos;s okay — you can save this lead and come back anytime.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Event Overview">
            <Field label="Event Type">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {EVENT_TYPES.map((t) => (
                  <EventTypeChip
                    key={t}
                    type={t}
                    selected={state.event_type === t}
                    onClick={() => update({ event_type: t })}
                  />
                ))}
              </div>
            </Field>
            <Field label="Event Format">
              <div className="flex gap-2">
                {EVENT_FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => update({ event_format: f })}
                    aria-pressed={state.event_format === f}
                    className={
                      "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors " +
                      (state.event_format === f
                        ? "border-brand-500 bg-brand-600 text-white shadow-brand"
                        : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50")
                    }
                  >
                    {EVENT_FORMAT_LABELS[f] ?? f}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Estimated Event Date">
                <input
                  type="date"
                  value={state.event_date}
                  onChange={(e) => update({ event_date: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Date Flexibility">
                <select
                  value={state.date_flexibility}
                  onChange={(e) => update({ date_flexibility: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {DATE_FLEXIBILITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location / Venue">
                <input
                  type="text"
                  value={state.event_location}
                  onChange={(e) => update({ event_location: e.target.value })}
                  placeholder="Free text at this stage"
                  className={inputCls}
                />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={state.city}
                  onChange={(e) => update({ city: e.target.value })}
                  placeholder="e.g. London"
                  className={inputCls}
                />
              </Field>
              {(state.event_format === "remote" || state.event_format === "hybrid") && (
                <Field label="Timezone" className="sm:col-span-2">
                  <select
                    value={state.contact_timezone}
                    onChange={(e) => update({ contact_timezone: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Event Planning Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Estimated Guest Count">
                <input
                  type="number"
                  min={0}
                  value={state.guest_count_estimate}
                  onChange={(e) => update({ guest_count_estimate: e.target.value })}
                  placeholder="e.g. 250"
                  className={inputCls}
                />
              </Field>
              <Field label="Currency">
                <select
                  value={state.currency}
                  onChange={(e) => update({ currency: e.target.value })}
                  className={inputCls}
                >
                  {["GBP", "USD", "EUR"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Budget Range (min)">
                <input
                  type="number"
                  min={0}
                  value={state.budget_min}
                  onChange={(e) => update({ budget_min: e.target.value })}
                  placeholder="e.g. 75000"
                  className={inputCls}
                />
              </Field>
              <Field label="Budget Range (max)">
                <input
                  type="number"
                  min={0}
                  value={state.budget_max}
                  onChange={(e) => update({ budget_max: e.target.value })}
                  placeholder="e.g. 125000"
                  className={inputCls}
                />
              </Field>
              <Field label="Event Purpose">
                <input
                  type="text"
                  value={state.event_purpose}
                  onChange={(e) => update({ event_purpose: e.target.value })}
                  placeholder="e.g. Product Launch"
                  className={inputCls}
                />
              </Field>
              <Field label="Ticketed or Private">
                <select
                  value={state.ticketing_type}
                  onChange={(e) => update({ ticketing_type: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {TICKETING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Preferred Venue Type">
              <div className="flex flex-wrap gap-2 mb-2">
                {state.venue_types.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 text-xs font-medium"
                  >
                    {v}
                    <button type="button" onClick={() => toggleVenueType(v)} aria-label={`Remove ${v}`}>
                      <X className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {VENUE_TYPE_OPTIONS.filter((v) => !state.venue_types.includes(v)).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVenueType(v)}
                    className="px-2.5 py-1 text-xs font-medium rounded-full border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 transition-colors"
                  >
                    + {v}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Additional Requirements">
              <textarea
                rows={3}
                maxLength={500}
                value={state.additional_requirements}
                onChange={(e) => update({ additional_requirements: e.target.value })}
                placeholder="Anything else the proposal team should know…"
                className={inputCls + " resize-none"}
              />
              <p className="mt-1 text-right text-[11px] text-surface-400">
                {state.additional_requirements.length}/500
              </p>
            </Field>

            <Field label="Tags">
              <div className="flex flex-wrap gap-2 mb-2">
                {state.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-100 text-surface-700 border border-surface-200 px-2.5 py-1 text-xs font-medium"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => update({ tags: state.tags.filter((x) => x !== t) })}
                      aria-label={`Remove ${t}`}
                    >
                      <X className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Type a tag and press Enter"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={state.accessibility_needed}
                  onChange={(e) => update({ accessibility_needed: e.target.checked })}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Accessibility considerations needed
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={state.is_international}
                  onChange={(e) => update({ is_international: e.target.checked })}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                International / multi-country requirement
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={state.multi_room}
                  onChange={(e) => update({ multi_room: e.target.checked })}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Multiple rooms or zones
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={state.alcohol_bar}
                  onChange={(e) => update({ alcohol_bar: e.target.checked })}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Alcohol / bar requirement
              </label>
              <label className="flex items-center gap-2 text-sm text-surface-700">
                <input
                  type="checkbox"
                  checked={state.minors_present}
                  onChange={(e) => update({ minors_present: e.target.checked })}
                  className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                Children / minors present
              </label>
            </div>

            {state.accessibility_needed && (
              <Field label="Accessibility Notes">
                <textarea
                  rows={2}
                  value={state.accessibility_notes}
                  onChange={(e) => update({ accessibility_notes: e.target.value })}
                  className={inputCls + " resize-none"}
                />
              </Field>
            )}

            <Field label="Licensing or Security Requirements">
              <textarea
                rows={2}
                value={state.licensing_notes}
                onChange={(e) => update({ licensing_notes: e.target.value })}
                placeholder="Optional"
                className={inputCls + " resize-none"}
              />
            </Field>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-sm font-semibold text-surface-900 mb-2">Event Snapshot</h3>
            <div className="divide-y divide-surface-100">
              <SnapshotRow icon={Layers} label="Event Type" value={state.event_type} />
              <SnapshotRow icon={Calendar} label="Provisional Date" value={state.event_date} />
              <SnapshotRow icon={Calendar} label="Date Flexibility" value={state.date_flexibility} />
              <SnapshotRow
                icon={Wallet}
                label="Budget Range"
                value={formatMoneyRange(budgetMinCents, budgetMaxCents, state.currency)}
              />
              <SnapshotRow icon={Users} label="Estimated Guests" value={state.guest_count_estimate} />
              <SnapshotRow
                icon={MapPin}
                label="Location"
                value={[state.event_location, state.city].filter(Boolean).join(", ")}
              />
              <SnapshotRow icon={Layers} label="Format" value={EVENT_FORMAT_LABELS[state.event_format] ?? state.event_format} />
              <SnapshotRow icon={Ticket} label="Ticketing / Access" value={state.ticketing_type} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-900">Inspiration & References</h3>
            <div className="border-2 border-dashed border-surface-200 rounded-xl p-5 text-center">
              <UploadCloud className="w-6 h-6 text-surface-300 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-xs text-surface-500">Drag and drop files here</p>
              <p className="text-xs text-surface-400 my-1">or</p>
              <button
                type="button"
                onClick={() => setShowUploadNote(true)}
                className="px-3 py-1.5 text-xs font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
              >
                Browse Files
              </button>
              <p className="text-[11px] text-surface-400 mt-2">Images, PDFs, PPTX up to 25MB</p>
              {showUploadNote && (
                <p className="text-[11px] text-warning-700 bg-warning-50 border border-warning-200 rounded-lg mt-2 px-2 py-1">
                  File uploads are being finalised — add a link below instead.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="Or add a link"
                className={inputCls}
              />
              <button
                type="button"
                onClick={addLink}
                className="px-3 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
            {state.reference_links.length > 0 && (
              <ul className="space-y-1">
                {state.reference_links.map((l, i) => (
                  <li
                    key={`${l.url}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs text-surface-600 bg-surface-50 rounded-lg px-2 py-1.5"
                  >
                    <span className="truncate">{l.url}</span>
                    <button
                      type="button"
                      onClick={() =>
                        update({ reference_links: state.reference_links.filter((_, idx) => idx !== i) })
                      }
                      aria-label="Remove link"
                    >
                      <X className="w-3 h-3 text-surface-400" strokeWidth={2.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="flex items-center gap-1.5 text-[11px] text-surface-400">
              <Lock className="w-3 h-3" strokeWidth={2} />
              These materials are only visible to your team.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-surface-200 px-6 py-4 z-10">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3">
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-surface-400 hidden sm:inline">Step 2 of 3</span>
            <button
              type="button"
              onClick={onContinue}
              disabled={pending}
              className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 shadow-brand"
            >
              {pending ? "Saving…" : "Continue to Qualification"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
