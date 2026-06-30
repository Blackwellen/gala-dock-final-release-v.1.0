"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Building2, Upload, CheckCircle2 } from "lucide-react";
import { createVenue } from "../actions";

const STATUSES = [
  { value: "preferred", label: "Preferred" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

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
        {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function NewVenueForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Cover image is captured client-side only (upload-only file input). The
  // venues table stores covers via cover_attachment_id, which is not wired to
  // a public attachment-upload flow here — so the image stays local for now.
  const [cover, setCover] = useState<File | null>(null);

  const [name, setName] = useState("");
  const [status, setStatus] = useState("active");
  const [website, setWebsite] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [capacity, setCapacity] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");

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
        await createVenue(fd);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Failed to create venue");
      }
    });
  }

  return (
    <div className="animate-fade-in min-h-screen flex flex-col">
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/event-manager/venues"
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
            <h1 className="text-sm font-semibold text-surface-900">New Venue</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/event-manager/venues"
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
            {pending ? "Saving…" : "Save Venue"}
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
          <SectionCard title="Venue Details" description="Core details about this venue">
            <Field label="Venue Name" required>
              <input type="text" placeholder="e.g. Thornbury Castle" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Website">
              <input type="url" placeholder="https://example.com" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Cover Image">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCover(f);
                  }}
                />
                <div className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors ${cover ? "border-success-400 bg-success-50" : "border-surface-200 bg-surface-50 hover:border-brand-400"}`}>
                  {cover ? <CheckCircle2 className="w-6 h-6 text-success-600" strokeWidth={2} /> : <Upload className="w-5 h-5 text-surface-400" strokeWidth={1.8} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-700">{cover ? cover.name : "Upload cover image"}</p>
                  <p className="text-xs text-surface-400 mt-0.5">PNG or JPG · upload only</p>
                </div>
              </label>
            </Field>
          </SectionCard>

          <SectionCard title="Location" description="Where the venue is based">
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

          <SectionCard title="Capacity" description="Maximum guest capacity">
            <Field label="Capacity">
              <input type="number" min={0} placeholder="e.g. 200" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          <SectionCard title="Contact" description="Venue point of contact">
            <Field label="Contact Email">
              <input type="email" placeholder="events@venue.co.uk" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Contact Phone">
              <input type="tel" placeholder="+44 7700 900000" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
            </Field>
          </SectionCard>

          <div className="lg:col-span-2">
            <SectionCard title="Notes" description="Internal notes about this venue">
              <Field label="Internal Notes">
                <textarea rows={4} placeholder="Accessibility, parking, logistics, anything useful…" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + " resize-none"} />
              </Field>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
