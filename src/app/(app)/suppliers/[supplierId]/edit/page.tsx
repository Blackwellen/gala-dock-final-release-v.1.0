"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Star,
  Upload,
  CheckCircle2,
  FileText,
  Save,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "Catering",
  "AV/Production",
  "Photography",
  "Florist",
  "Band/Music",
  "Transport",
  "Hair & Makeup",
  "Security",
  "Other",
];

const STATUSES = ["Active", "Preferred", "Pending", "Inactive"];

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED = {
  name: "Noble Kitchen Co.",
  category: "Catering",
  status: "Preferred",
  rating: 4,
  notes:
    "Excellent for corporate dinners. They handle dietary requirements well and always deliver on time. Preferred for events over 100 guests.",
  contactName: "Sarah Noble",
  email: "sarah@noblekitchen.co.uk",
  phone: "+44 7700 900201",
  website: "https://noblekitchen.co.uk",
  street: "14 Cavendish Road",
  city: "Bristol",
  postcode: "BS6 5EP",
  country: "United Kingdom",
  insuranceUploaded: true,
  contractUploaded: true,
  bankUploaded: false,
};

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pb-4 border-b border-surface-100 mb-5">
      <h2 className="text-base font-semibold text-surface-900">{title}</h2>
      {description && (
        <p className="text-xs text-surface-500 mt-0.5">{description}</p>
      )}
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

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="focus:outline-none"
          aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "w-6 h-6 transition-colors",
              n <= (hover || value)
                ? "fill-warning-400 text-warning-400"
                : "text-surface-200 fill-surface-200"
            )}
            strokeWidth={1.5}
          />
        </button>
      ))}
      <span className="ml-2 text-sm text-surface-500">{value} / 5</span>
    </div>
  );
}

function DocUploadRow({
  label,
  hint,
  uploaded,
  newFile,
  onFile,
}: {
  label: string;
  hint?: string;
  uploaded: boolean;
  newFile: File | null;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const hasFile = newFile !== null || uploaded;

  return (
    <div className="flex items-center justify-between gap-4 p-4 border border-surface-200 rounded-xl hover:border-brand-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            hasFile ? "bg-success-50" : "bg-surface-100"
          )}
        >
          {hasFile ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-success-600" strokeWidth={2} />
          ) : (
            <FileText className="w-4.5 h-4.5 text-surface-400" strokeWidth={1.8} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-surface-800">{label}</p>
          {newFile ? (
            <p className="text-xs text-success-600 truncate">{newFile.name}</p>
          ) : uploaded ? (
            <p className="text-xs text-success-600">On file</p>
          ) : (
            <p className="text-xs text-surface-400">{hint ?? "Not uploaded"}</p>
          )}
        </div>
      </div>
      <label className="shrink-0 cursor-pointer">
        <input
          ref={ref}
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
          <Upload className="w-3.5 h-3.5" strokeWidth={2} />
          {hasFile ? "Replace" : "Upload"}
        </span>
      </label>
    </div>
  );
}

export default function EditSupplierPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Basics
  const [name, setName] = useState(SEED.name);
  const [category, setCategory] = useState(SEED.category);
  const [status, setStatus] = useState(SEED.status);
  const [rating, setRating] = useState(SEED.rating);
  const [notes, setNotes] = useState(SEED.notes);

  // Contact
  const [contactName, setContactName] = useState(SEED.contactName);
  const [email, setEmail] = useState(SEED.email);
  const [phone, setPhone] = useState(SEED.phone);
  const [website, setWebsite] = useState(SEED.website);
  const [street, setStreet] = useState(SEED.street);
  const [city, setCity] = useState(SEED.city);
  const [postcode, setPostcode] = useState(SEED.postcode);
  const [country, setCountry] = useState(SEED.country);

  // Documents
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      router.push("/suppliers");
    }, 700);
  }

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/suppliers"
            className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Suppliers
          </Link>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight">
              Edit Supplier
            </h1>
            <p className="text-sm text-surface-500 mt-0.5">{SEED.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/suppliers"
              className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              form="edit-supplier-form"
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
        <form id="edit-supplier-form" onSubmit={handleSave}>
          {/* Basics */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-6">
            <SectionTitle title="Basic Information" description="Core details about this supplier" />
            <div className="space-y-5">
              <Field label="Supplier Name" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  required
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Category" required>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputCls}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
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
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Internal Rating">
                <StarRating value={rating} onChange={setRating} />
              </Field>

              <Field label="Notes">
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputCls + " resize-none"}
                />
              </Field>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-6">
            <SectionTitle title="Contact Details" description="Primary contact and address" />
            <div className="space-y-5">
              <Field label="Primary Contact Name">
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Website">
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <div className="pt-2 border-t border-surface-100">
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-4">
                  Address
                </p>
                <div className="space-y-4">
                  <Field label="Street Address">
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="City">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Postcode">
                      <input
                        type="text"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <Field label="Country">
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-6">
            <SectionTitle title="Documents" description="Upload or replace compliance documents" />
            <div className="space-y-3">
              <DocUploadRow
                label="Insurance Certificate"
                hint="Public liability insurance"
                uploaded={SEED.insuranceUploaded}
                newFile={insuranceFile}
                onFile={setInsuranceFile}
              />
              <DocUploadRow
                label="Contract Template"
                hint="Standard supplier agreement"
                uploaded={SEED.contractUploaded}
                newFile={contractFile}
                onFile={setContractFile}
              />
              <DocUploadRow
                label="Bank Details"
                hint="Encrypted bank information"
                uploaded={SEED.bankUploaded}
                newFile={bankFile}
                onFile={setBankFile}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/suppliers"
              className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </Link>
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
