"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Building2 } from "lucide-react";
import { updateVenue } from "../../actions";

export interface EditVenueData {
  id: string;
  name: string;
  status: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  capacity: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

const STATUSES = [
  { value: "preferred", label: "Preferred" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

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
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">
        {label}
        {required && <span className="text-danger-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
      <div className="pb-3 border-b border-surface-100">
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function EditVenueForm({ venue }: { venue: EditVenueData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(venue.name);
  const [status, setStatus] = useState(venue.status);
  const [website, setWebsite] = useState(venue.website);
  const [addr1, setAddr1] = useState(venue.addressLine1);
  const [addr2, setAddr2] = useState(venue.addressLine2);
  const [city, setCity] = useState(venue.city);
  const [region, setRegion] = useState(venue.region);
  const [postal, setPostal] = useState(venue.postalCode);
  const [capacity, setCapacity] = useState(venue.capacity);
  const [contactEmail, setContactEmail] = useState(venue.contactEmail);
  const [contactPhone, setContactPhone] = useState(venue.contactPhone);
  const [notes, setNotes] = useState(venue.notes);

  function handleSave() {
    setError(null);
    if (name.trim() === "") {
      setError("Venue name is required");
      return;
    }
    const fd = new FormData();
    fd.set("name", name);
    fd.set("status", status);
    fd.set("website", website);
    fd.set("address_line1", addr1);
    fd.set("address_line2", addr2);
    fd.set("city", city);
    fd.set("region", region);
    fd.set("postal_code", postal);
    fd.set("capacity", capacity);
    fd.set("contact_email", contactEmail);
    fd.set("contact_phone", contactPhone);
    fd.set("notes", notes);
    startTransition(async () => {
      try {
        await updateVenue(venue.id, fd);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Failed to update venue");
      }
    });
  }

  return (
    <div className="animate-fade-in min-h-screen flex flex-col">
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/event-manager/venues/${venue.id}`}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </Link>
          <div className="h-5 w-px bg-surface-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-sm font-semibold text-surface-900">Edit Venue</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/event-manager/venues/${venue.id}`}
            className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60 shadow-brand"
          >
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {error && (
          <div className="mb-4 p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Venue Details">
            <Field label="Venue Name" required>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Website">
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          <SectionCard title="Location">
            <Field label="Address Line 1">
              <input type="text" value={addr1} onChange={(e) => setAddr1(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Address Line 2">
              <input type="text" value={addr2} onChange={(e) => setAddr2(e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City">
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
              </Field>
              <Field label="County / Region">
                <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Postcode">
              <input type="text" value={postal} onChange={(e) => setPostal(e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          <SectionCard title="Capacity">
            <Field label="Capacity">
              <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          <SectionCard title="Contact">
            <Field label="Contact Email">
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Contact Phone">
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          <div className="lg:col-span-2">
            <SectionCard title="Notes">
              <Field label="Internal Notes">
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + " resize-none"} />
              </Field>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
