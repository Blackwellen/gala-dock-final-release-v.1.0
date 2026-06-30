"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Save } from "lucide-react";
import { updateEvent } from "@/app/event-manager/events/actions";

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

const EVENT_STATUSES: { value: string; label: string }[] = [
  { value: "new-enquiry", label: "New Enquiry" },
  { value: "briefing", label: "Briefing" },
  { value: "quoting", label: "Quoting" },
  { value: "awaiting-approval", label: "Awaiting Approval" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in-delivery", label: "In Delivery" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export interface EditEventInitial {
  id: string;
  name: string;
  eventType: string;
  status: string;
  description: string;
  startDate: string;
  endDate: string;
  venueName: string;
  location: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientCompany: string;
  budget: string;
  dayGuests: string;
  eveningGuests: string;
}

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
        {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
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

export function EditEventForm({ initial }: { initial: EditEventInitial }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.eventType || EVENT_TYPES[0]);
  const [status, setStatus] = useState(initial.status);
  const [description, setDescription] = useState(initial.description);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [venueName, setVenueName] = useState(initial.venueName);
  const [location, setLocation] = useState(initial.location);
  const [clientName, setClientName] = useState(initial.clientName);
  const [clientEmail, setClientEmail] = useState(initial.clientEmail);
  const [clientPhone, setClientPhone] = useState(initial.clientPhone);
  const [clientCompany, setClientCompany] = useState(initial.clientCompany);
  const [budget, setBudget] = useState(initial.budget);
  const [dayGuests, setDayGuests] = useState(initial.dayGuests);
  const [eveningGuests, setEveningGuests] = useState(initial.eveningGuests);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("event_type", type);
    fd.set("status", status);
    fd.set("description", description);
    fd.set("start_at", startDate);
    fd.set("end_at", endDate);
    fd.set("venue_name", venueName);
    fd.set("location", location);
    fd.set("client_name", clientName);
    fd.set("client_email", clientEmail);
    fd.set("client_phone", clientPhone);
    fd.set("client_company", clientCompany);
    fd.set("budget", budget);
    fd.set("guest_count_day", dayGuests);
    fd.set("guest_count_evening", eveningGuests);
    try {
      await updateEvent(initial.id, fd);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => router.push(`/event-manager/events/${initial.id}`)}
            className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight">Edit Event</h1>
            <p className="text-sm text-surface-500 mt-0.5">{initial.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/event-manager/events/${initial.id}`)}
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

      <div className="p-6 max-w-2xl space-y-6">
        <form id="edit-event-form" onSubmit={handleSave}>
          <SectionCard title="Event Basics" description="Core event information">
            <div className="space-y-5">
              <Field label="Event Name" required>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Event Type">
                  <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                    {EVENT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls + " resize-none"} />
              </Field>
            </div>
          </SectionCard>

          <div className="mt-6">
            <SectionCard title="Date & Venue" description="When and where this event takes place">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Start Date">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="End Date">
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field label="Venue Name">
                  <input type="text" value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Venue Address / Location">
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
                </Field>
              </div>
            </SectionCard>
          </div>

          <div className="mt-6">
            <SectionCard title="Client" description="Contact details for the client or lead">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Client Name">
                    <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Company">
                    <input type="text" placeholder="Optional" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Email">
                    <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Phone">
                    <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="mt-6">
            <SectionCard title="Budget & Guests">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Total Budget (£)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-500">£</span>
                    <input type="number" min="0" step="100" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls + " pl-7"} />
                  </div>
                </Field>
                <Field label="Day Guests">
                  <input type="number" min="0" value={dayGuests} onChange={(e) => setDayGuests(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Evening Guests">
                  <input type="number" min="0" value={eveningGuests} onChange={(e) => setEveningGuests(e.target.value)} className={inputCls} />
                </Field>
              </div>
            </SectionCard>
          </div>

          <div className="flex items-center justify-end gap-3 mt-6 pb-8">
            <button
              type="button"
              onClick={() => router.push(`/event-manager/events/${initial.id}`)}
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
