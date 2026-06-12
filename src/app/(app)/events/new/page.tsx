"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WizardStepper } from "@/components/ui/WizardStepper";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Sparkles,
  Check,
  X,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Event Basics" },
  { id: 2, label: "Client" },
  { id: 3, label: "Venue" },
  { id: 4, label: "Budget" },
  { id: 5, label: "Suppliers" },
  { id: 6, label: "Team" },
  { id: 7, label: "AI Brief" },
  { id: 8, label: "Review" },
];

const EVENT_TYPES = ["Wedding", "Corporate", "Private", "Conference"];

const SUPPLIER_OPTIONS = [
  "Catering",
  "AV / Production",
  "Photography",
  "Florist",
  "Band / Music",
  "Transport",
  "Hair & Makeup",
  "Venue Staff",
  "Security",
  "Other",
];

const TEAM_MEMBERS = [
  "Jamie Thornton",
  "Kelly Lawson",
  "Marcus Reed",
  "Sofia Patel",
  "David Osei",
];

interface FormData {
  // Step 1
  eventName: string;
  eventType: string;
  description: string;
  // Step 2
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientCompany: string;
  // Step 3
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venuePostcode: string;
  // Step 4
  budget: string;
  guestCount: string;
  eveningGuests: string;
  // Step 5
  suppliers: string[];
  // Step 6
  owner: string;
  teamMembers: string[];
  // Step 7
  brief: string;
  briefGenerated: boolean;
}

const INITIAL_FORM: FormData = {
  eventName: "",
  eventType: "",
  description: "",
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  clientCompany: "",
  venueName: "",
  venueAddress: "",
  venueCity: "",
  venuePostcode: "",
  budget: "",
  guestCount: "",
  eveningGuests: "",
  suppliers: [],
  owner: "",
  teamMembers: [],
  brief: "",
  briefGenerated: false,
};

function inputClass(extra?: string) {
  return cn(
    "w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900",
    "placeholder:text-surface-400 bg-white",
    "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent",
    "transition-colors",
    extra
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-surface-700 mb-1.5">
      {children}
    </label>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

// ── Step components ────────────────────────────────────────────────────────────

function Step1({ data, onChange }: { data: FormData; onChange: (p: Partial<FormData>) => void }) {
  return (
    <FieldGroup>
      <div>
        <Label htmlFor="eventName">Event Name *</Label>
        <input
          id="eventName"
          className={inputClass()}
          placeholder="e.g. The Carter Wedding"
          value={data.eventName}
          onChange={(e) => onChange({ eventName: e.target.value })}
        />
      </div>
      <div>
        <Label>Event Type *</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ eventType: t })}
              className={cn(
                "px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                data.eventType === t
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-surface-200 text-surface-600 hover:border-brand-300 hover:text-brand-600"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={4}
          className={inputClass()}
          placeholder="Brief overview of the event, themes, special requirements…"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
    </FieldGroup>
  );
}

function Step2({ data, onChange }: { data: FormData; onChange: (p: Partial<FormData>) => void }) {
  return (
    <FieldGroup>
      <Row>
        <div>
          <Label htmlFor="clientName">Client Name *</Label>
          <input
            id="clientName"
            className={inputClass()}
            placeholder="Full name"
            value={data.clientName}
            onChange={(e) => onChange({ clientName: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="clientCompany">Company / Organisation</Label>
          <input
            id="clientCompany"
            className={inputClass()}
            placeholder="Company name"
            value={data.clientCompany}
            onChange={(e) => onChange({ clientCompany: e.target.value })}
          />
        </div>
      </Row>
      <Row>
        <div>
          <Label htmlFor="clientEmail">Email Address *</Label>
          <input
            id="clientEmail"
            type="email"
            className={inputClass()}
            placeholder="client@example.com"
            value={data.clientEmail}
            onChange={(e) => onChange({ clientEmail: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="clientPhone">Phone Number</Label>
          <input
            id="clientPhone"
            type="tel"
            className={inputClass()}
            placeholder="+44 7700 000000"
            value={data.clientPhone}
            onChange={(e) => onChange({ clientPhone: e.target.value })}
          />
        </div>
      </Row>
    </FieldGroup>
  );
}

function Step3({ data, onChange }: { data: FormData; onChange: (p: Partial<FormData>) => void }) {
  return (
    <FieldGroup>
      <div>
        <Label htmlFor="venueName">Venue Name *</Label>
        <input
          id="venueName"
          className={inputClass()}
          placeholder="e.g. The Grand Pavilion"
          value={data.venueName}
          onChange={(e) => onChange({ venueName: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="venueAddress">Street Address</Label>
        <input
          id="venueAddress"
          className={inputClass()}
          placeholder="123 High Street"
          value={data.venueAddress}
          onChange={(e) => onChange({ venueAddress: e.target.value })}
        />
      </div>
      <Row>
        <div>
          <Label htmlFor="venueCity">City *</Label>
          <input
            id="venueCity"
            className={inputClass()}
            placeholder="London"
            value={data.venueCity}
            onChange={(e) => onChange({ venueCity: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="venuePostcode">Postcode</Label>
          <input
            id="venuePostcode"
            className={inputClass()}
            placeholder="EC1A 1BB"
            value={data.venuePostcode}
            onChange={(e) => onChange({ venuePostcode: e.target.value })}
          />
        </div>
      </Row>
    </FieldGroup>
  );
}

function Step4({ data, onChange }: { data: FormData; onChange: (p: Partial<FormData>) => void }) {
  return (
    <FieldGroup>
      <div>
        <Label htmlFor="budget">Total Budget (£) *</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm font-medium">
            £
          </span>
          <input
            id="budget"
            type="number"
            min="0"
            className={inputClass("pl-7")}
            placeholder="25000"
            value={data.budget}
            onChange={(e) => onChange({ budget: e.target.value })}
          />
        </div>
      </div>
      <Row>
        <div>
          <Label htmlFor="guestCount">Guest Count (Day) *</Label>
          <input
            id="guestCount"
            type="number"
            min="0"
            className={inputClass()}
            placeholder="120"
            value={data.guestCount}
            onChange={(e) => onChange({ guestCount: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="eveningGuests">Evening Guests</Label>
          <input
            id="eveningGuests"
            type="number"
            min="0"
            className={inputClass()}
            placeholder="80"
            value={data.eveningGuests}
            onChange={(e) => onChange({ eveningGuests: e.target.value })}
          />
        </div>
      </Row>
      {data.budget && data.guestCount && Number(data.guestCount) > 0 && (
        <div className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-3">
          <p className="text-xs text-brand-600 font-medium">
            Estimated per head:{" "}
            <span className="text-brand-700 font-semibold">
              £{(Number(data.budget) / Number(data.guestCount)).toFixed(0)}
            </span>
          </p>
        </div>
      )}
    </FieldGroup>
  );
}

function Step5({ data, onChange }: { data: FormData; onChange: (p: Partial<FormData>) => void }) {
  const toggle = (s: string) => {
    const next = data.suppliers.includes(s)
      ? data.suppliers.filter((x) => x !== s)
      : [...data.suppliers, s];
    onChange({ suppliers: next });
  };

  return (
    <FieldGroup>
      <div>
        <p className="text-sm text-surface-500 mb-4">
          Select the supplier categories required for this event. You can assign specific
          suppliers later.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SUPPLIER_OPTIONS.map((s) => {
            const selected = data.suppliers.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left",
                  selected
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-surface-200 text-surface-600 hover:border-brand-300 hover:text-surface-900"
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    selected ? "bg-brand-600 border-brand-600" : "border-surface-300 bg-white"
                  )}
                >
                  {selected && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                </span>
                {s}
              </button>
            );
          })}
        </div>
      </div>
      {data.suppliers.length > 0 && (
        <p className="text-xs text-surface-500">
          {data.suppliers.length} categor{data.suppliers.length === 1 ? "y" : "ies"} selected
        </p>
      )}
    </FieldGroup>
  );
}

function Step6({ data, onChange }: { data: FormData; onChange: (p: Partial<FormData>) => void }) {
  const toggleMember = (m: string) => {
    const next = data.teamMembers.includes(m)
      ? data.teamMembers.filter((x) => x !== m)
      : [...data.teamMembers, m];
    onChange({ teamMembers: next });
  };

  return (
    <FieldGroup>
      <div>
        <Label htmlFor="owner">Event Owner *</Label>
        <div className="relative">
          <select
            id="owner"
            className={inputClass("appearance-none pr-8")}
            value={data.owner}
            onChange={(e) => onChange({ owner: e.target.value })}
          >
            <option value="">Select owner…</option>
            {TEAM_MEMBERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
        </div>
      </div>
      <div>
        <Label>Assign Team Members</Label>
        <p className="text-xs text-surface-500 mb-3">
          Select all team members who will be working on this event.
        </p>
        <div className="space-y-2">
          {TEAM_MEMBERS.map((m) => {
            const selected = data.teamMembers.includes(m);
            const isOwner = data.owner === m;
            return (
              <button
                key={m}
                type="button"
                disabled={isOwner}
                onClick={() => !isOwner && toggleMember(m)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all",
                  selected || isOwner
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-surface-200 text-surface-600 hover:border-brand-300",
                  isOwner && "opacity-70 cursor-default"
                )}
              >
                <span className="font-medium">{m}</span>
                {isOwner ? (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                    Owner
                  </span>
                ) : selected ? (
                  <Check className="w-4 h-4" strokeWidth={2} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </FieldGroup>
  );
}

function Step7({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (p: Partial<FormData>) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    // Simulate AI generation
    await new Promise((r) => setTimeout(r, 2200));
    const generated = `# Event Brief — ${data.eventName || "Untitled Event"}

**Event Type:** ${data.eventType || "TBC"}
**Client:** ${data.clientName || "TBC"}${data.clientCompany ? ` (${data.clientCompany})` : ""}
**Venue:** ${data.venueName || "TBC"}${data.venueCity ? `, ${data.venueCity}` : ""}
**Guest Count:** ${data.guestCount || "TBC"} day guests${data.eveningGuests ? `, ${data.eveningGuests} evening guests` : ""}
**Budget:** ${data.budget ? `£${Number(data.budget).toLocaleString("en-GB")}` : "TBC"}

## Overview
${data.description || `This is a ${(data.eventType || "").toLowerCase()} event requiring meticulous coordination across all departments. Our team will deliver a seamless, premium experience tailored to the client's vision.`}

## Supplier Requirements
${data.suppliers.length > 0 ? data.suppliers.map((s) => `- ${s}`).join("\n") : "- To be confirmed"}

## Internal Notes
- Owner: ${data.owner || "Unassigned"}
${data.teamMembers.length > 0 ? `- Team: ${data.teamMembers.join(", ")}` : ""}
- All supplier contracts must be reviewed and signed before event confirmation
- Client sign-off required on this brief before advancing to production

## Next Steps
1. Share this brief with the client for approval
2. Begin supplier outreach and quote collection
3. Schedule internal kick-off call with the full team
4. Set up event timeline and task assignments in the platform`;

    onChange({ brief: generated, briefGenerated: true });
    setLoading(false);
  };

  return (
    <FieldGroup>
      <div className="bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="font-semibold text-surface-900 text-sm">AI Brief Generator</h3>
            <p className="text-xs text-surface-500 mt-0.5">
              Gala Dock AI will generate a professional event brief from the details you have
              provided. You can edit it after generation.
            </p>
          </div>
        </div>

        {!data.briefGenerated && !loading && (
          <button
            type="button"
            onClick={handleGenerate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            Generate Brief with AI
          </button>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
            <span className="text-sm text-brand-700 font-medium">
              Generating your event brief…
            </span>
          </div>
        )}

        {data.briefGenerated && !loading && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-success-700">
              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              Brief generated
            </span>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-xs text-brand-600 hover:underline"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>

      {data.brief && (
        <div>
          <Label htmlFor="brief">Event Brief</Label>
          <textarea
            id="brief"
            rows={14}
            className={inputClass("font-mono text-xs leading-relaxed resize-y")}
            value={data.brief}
            onChange={(e) => onChange({ brief: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-surface-400">
            You can edit the brief above. It will be saved with the event and shared with your
            team.
          </p>
        </div>
      )}
    </FieldGroup>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-surface-100 last:border-0">
      <span className="text-sm text-surface-500">{label}</span>
      <span className="text-sm font-medium text-surface-900 text-right max-w-[60%]">
        {value || <span className="text-surface-400 font-normal italic">Not provided</span>}
      </span>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="bg-surface-50 rounded-xl border border-surface-200 px-4">
        {children}
      </div>
    </div>
  );
}

function Step8({ data }: { data: FormData }) {
  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-surface-500">
          Review the event details below before creating. You can go back to any step to make
          changes.
        </p>
      </div>

      <ReviewSection title="Event Details">
        <ReviewRow label="Event Name" value={data.eventName} />
        <ReviewRow label="Event Type" value={data.eventType} />
        <ReviewRow label="Description" value={data.description} />
      </ReviewSection>

      <ReviewSection title="Client">
        <ReviewRow label="Name" value={data.clientName} />
        <ReviewRow label="Email" value={data.clientEmail} />
        <ReviewRow label="Phone" value={data.clientPhone} />
        <ReviewRow label="Company" value={data.clientCompany} />
      </ReviewSection>

      <ReviewSection title="Venue">
        <ReviewRow label="Venue" value={data.venueName} />
        <ReviewRow label="Address" value={data.venueAddress} />
        <ReviewRow label="City" value={data.venueCity} />
        <ReviewRow label="Postcode" value={data.venuePostcode} />
      </ReviewSection>

      <ReviewSection title="Budget & Guests">
        <ReviewRow
          label="Total Budget"
          value={data.budget ? `£${Number(data.budget).toLocaleString("en-GB")}` : undefined}
        />
        <ReviewRow
          label="Day Guests"
          value={data.guestCount ? `${data.guestCount} guests` : undefined}
        />
        <ReviewRow
          label="Evening Guests"
          value={data.eveningGuests ? `${data.eveningGuests} guests` : undefined}
        />
      </ReviewSection>

      <ReviewSection title="Supplier Categories">
        <ReviewRow
          label="Selected"
          value={
            data.suppliers.length > 0 ? data.suppliers.join(", ") : undefined
          }
        />
      </ReviewSection>

      <ReviewSection title="Team">
        <ReviewRow label="Owner" value={data.owner} />
        <ReviewRow
          label="Team"
          value={data.teamMembers.length > 0 ? data.teamMembers.join(", ") : undefined}
        />
      </ReviewSection>

      {data.briefGenerated && (
        <div className="flex items-center gap-2 p-3 bg-success-50 border border-success-200 rounded-lg">
          <Check className="w-4 h-4 text-success-600" strokeWidth={2} />
          <span className="text-sm text-success-700 font-medium">AI brief generated and ready</span>
        </div>
      )}
    </div>
  );
}

// ── Main Wizard ────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const update = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }));

  const handleNext = () => {
    if (step < 8) setStep((s) => s + 1);
  };
  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    // In production: POST to API
  };

  const handleCreate = async () => {
    setCreating(true);
    await new Promise((r) => setTimeout(r, 1200));
    router.push("/app/events");
  };

  const STEP_TITLES: Record<number, string> = {
    1: "Event Basics",
    2: "Client Details",
    3: "Venue & Location",
    4: "Budget & Guest Count",
    5: "Supplier Needs",
    6: "Internal Owner & Team",
    7: "AI Brief Generation",
    8: "Review & Create",
  };

  const STEP_SUBTITLES: Record<number, string> = {
    1: "Start with the fundamental details about this event.",
    2: "Who is the primary client or contact for this event?",
    3: "Where will the event take place?",
    4: "Set the financial and capacity parameters.",
    5: "Which supplier categories will you need to source?",
    6: "Assign internal ownership and team responsibility.",
    7: "Let AI draft a professional brief from your inputs.",
    8: "Confirm everything looks right before creating the event.",
  };

  return (
    <div className="animate-fade-in min-h-screen bg-surface-50">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/app/events")}
            className="p-2 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div>
            <h1 className="text-base font-semibold text-surface-900">New Event</h1>
            <p className="text-xs text-surface-400">Step {step} of 8</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" strokeWidth={1.8} />
          )}
          {saving ? "Saving…" : "Save Draft"}
        </button>
      </div>

      {/* Stepper */}
      <div className="bg-white border-b border-surface-100 px-6 py-4 overflow-x-auto">
        <div className="flex justify-center">
          <WizardStepper steps={STEPS} current={step} />
        </div>
      </div>

      {/* Content */}
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Step Card */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-6 py-5 border-b border-surface-100">
              <h2 className="text-lg font-semibold text-surface-900">{STEP_TITLES[step]}</h2>
              <p className="text-sm text-surface-500 mt-0.5">{STEP_SUBTITLES[step]}</p>
            </div>
            <div className="px-6 py-6">
              {step === 1 && <Step1 data={form} onChange={update} />}
              {step === 2 && <Step2 data={form} onChange={update} />}
              {step === 3 && <Step3 data={form} onChange={update} />}
              {step === 4 && <Step4 data={form} onChange={update} />}
              {step === 5 && <Step5 data={form} onChange={update} />}
              {step === 6 && <Step6 data={form} onChange={update} />}
              {step === 7 && <Step7 data={form} onChange={update} />}
              {step === 8 && <Step8 data={form} />}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                step === 1
                  ? "border-surface-100 text-surface-300 cursor-not-allowed"
                  : "border-surface-200 text-surface-600 hover:bg-surface-50"
              )}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
              Back
            </button>

            <div className="flex items-center gap-2">
              {step < 8 && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white transition-colors shadow-sm"
                >
                  Next
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </button>
              )}

              {step === 8 && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white transition-colors shadow-sm disabled:opacity-70"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                      Create Event
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={cn(
                  "rounded-full transition-all",
                  s.id === step
                    ? "w-5 h-2 bg-brand-600"
                    : s.id < step
                    ? "w-2 h-2 bg-brand-300"
                    : "w-2 h-2 bg-surface-200"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
