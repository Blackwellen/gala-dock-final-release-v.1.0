"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Save } from "lucide-react";
import Link from "next/link";

const EVENT_TYPES = [
  "Wedding",
  "Corporate Dinner",
  "Conference",
  "Product Launch",
  "Award Ceremony",
  "Private Party",
  "Charity Gala",
  "Birthday",
  "Other",
];

const EVENT_STATUSES = [
  "Enquiry",
  "Proposal",
  "Confirmed",
  "In Production",
  "On Site",
  "Completed",
  "Cancelled",
];

const TEAM_MEMBERS = [
  { id: "tm1", name: "Alex Johnson" },
  { id: "tm2", name: "Priya Shah" },
  { id: "tm3", name: "Marcus Williams" },
  { id: "tm4", name: "Sophie Carter" },
  { id: "tm5", name: "James Thornton" },
];

const OWNERS = [
  { id: "tm1", name: "Alex Johnson" },
  { id: "tm2", name: "Priya Shah" },
  { id: "tm3", name: "Marcus Williams" },
];

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED = {
  name: "Hartley Wedding — June 2026",
  type: "Wedding",
  status: "In Production",
  description:
    "Elegant garden wedding for 180 guests at Hartley Manor. Full-day coverage including ceremony, reception and evening entertainment.",
  startDate: "2026-06-21",
  endDate: "2026-06-21",
  venueName: "Hartley Manor",
  venueAddress: "Hartley Lane, Berkshire, RG10 4AB",
  clientName: "Emma & Oliver Hartley",
  clientEmail: "emma.hartley@email.com",
  clientPhone: "+44 7700 900322",
  clientCompany: "",
  budget: "42000",
  dayGuests: "180",
  eveningGuests: "240",
  owner: "tm1",
  teamMembers: ["tm2", "tm4"],
};

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

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
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
      <div className="pb-4 border-b border-surface-100 mb-5">
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
        {description && (
          <p className="text-xs text-surface-500 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
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

export default function EditEventPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Event Basics
  const [name, setName] = useState(SEED.name);
  const [type, setType] = useState(SEED.type);
  const [status, setStatus] = useState(SEED.status);
  const [description, setDescription] = useState(SEED.description);

  // Date & Venue
  const [startDate, setStartDate] = useState(SEED.startDate);
  const [endDate, setEndDate] = useState(SEED.endDate);
  const [venueName, setVenueName] = useState(SEED.venueName);
  const [venueAddress, setVenueAddress] = useState(SEED.venueAddress);

  // Client
  const [clientName, setClientName] = useState(SEED.clientName);
  const [clientEmail, setClientEmail] = useState(SEED.clientEmail);
  const [clientPhone, setClientPhone] = useState(SEED.clientPhone);
  const [clientCompany, setClientCompany] = useState(SEED.clientCompany);

  // Budget & Guests
  const [budget, setBudget] = useState(SEED.budget);
  const [dayGuests, setDayGuests] = useState(SEED.dayGuests);
  const [eveningGuests, setEveningGuests] = useState(SEED.eveningGuests);

  // Team
  const [owner, setOwner] = useState(SEED.owner);
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    SEED.teamMembers
  );

  function toggleMember(id: string) {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      router.back();
    }, 700);
  }

  return (
    <div className="animate-fade-in">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight">
              Edit Event
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">{SEED.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              form="edit-event-form"
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={2} />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="p-6 max-w-2xl space-y-6">
        <form id="edit-event-form" onSubmit={handleSave}>
          {/* Event Basics */}
          <SectionCard
            title="Event Basics"
            description="Core event information"
          >
            <div className="space-y-5">
              <Field label="Event Name" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  required
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Event Type" required>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className={inputCls}
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputCls}
                  >
                    {EVENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputCls + " resize-none"}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Date & Venue */}
          <div className="mt-6">
            <SectionCard
              title="Date & Venue"
              description="When and where this event takes place"
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Start Date" required>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="End Date">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Venue Name">
                  <input
                    type="text"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Venue Address">
                  <input
                    type="text"
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </SectionCard>
          </div>

          {/* Client */}
          <div className="mt-6">
            <SectionCard
              title="Client"
              description="Contact details for the client or lead"
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Client Name">
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Company">
                    <input
                      type="text"
                      placeholder="Optional"
                      value={clientCompany}
                      onChange={(e) => setClientCompany(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Email">
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Budget & Guests */}
          <div className="mt-6">
            <SectionCard title="Budget & Guests">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Total Budget (£)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-500">
                      £
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className={inputCls + " pl-7"}
                    />
                  </div>
                </Field>
                <Field label="Day Guests">
                  <input
                    type="number"
                    min="0"
                    value={dayGuests}
                    onChange={(e) => setDayGuests(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Evening Guests">
                  <input
                    type="number"
                    min="0"
                    value={eveningGuests}
                    onChange={(e) => setEveningGuests(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </SectionCard>
          </div>

          {/* Team */}
          <div className="mt-6">
            <SectionCard
              title="Team"
              description="Assign an owner and supporting team members"
            >
              <div className="space-y-5">
                <Field label="Event Owner">
                  <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className={inputCls}
                  >
                    {OWNERS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <div>
                  <p className="block text-xs font-medium text-surface-600 mb-2">
                    Team Members
                  </p>
                  <div className="space-y-2">
                    {TEAM_MEMBERS.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-3 p-3 border border-surface-200 rounded-lg cursor-pointer hover:bg-surface-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(m.id)}
                          onChange={() => toggleMember(m.id)}
                          className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-surface-800">
                          {m.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 mt-6 pb-8">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={2} />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
