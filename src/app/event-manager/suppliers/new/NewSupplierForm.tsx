"use client";

import { useState, useRef, useTransition } from "react";
import {
  X, Star, Upload, CheckCircle2, FileText, ChevronLeft, ChevronRight,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";
import { createSupplier } from "../actions";

const STEPS = [
  { id: 1, label: "Basics" },
  { id: 2, label: "Contact" },
  { id: 3, label: "Documents" },
  { id: 4, label: "Review" },
];

const STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
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

export interface CategoryOption {
  id: string;
  name: string;
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

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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
      {value > 0 && <span className="ml-2 text-sm text-surface-500">{value} / 5</span>}
    </div>
  );
}

function UploadCard({
  label,
  hint,
  file,
  onFile,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="border border-surface-200 rounded-xl p-4 flex items-center justify-between gap-4 bg-white hover:border-brand-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", file ? "bg-success-50" : "bg-surface-100")}>
          {file ? <CheckCircle2 className="w-4.5 h-4.5 text-success-600" strokeWidth={2} /> : <FileText className="w-4.5 h-4.5 text-surface-400" strokeWidth={1.8} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-surface-800">{label}</p>
          {file ? <p className="text-xs text-success-600 truncate">{file.name}</p> : <p className="text-xs text-surface-400">{hint ?? "No file uploaded"}</p>}
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
          {file ? "Replace" : "Upload"}
        </span>
      </label>
    </div>
  );
}

export function NewSupplierForm({ categories }: { categories: CategoryOption[] }) {
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Step 1
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [rating, setRating] = useState(0);
  const [logo, setLogo] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  // Step 2
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  // Step 3
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);

  function handleCreate() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("status", status);
    fd.set("category_id", categoryId);
    fd.set("website", website);
    fd.set("primary_email", email);
    fd.set("primary_phone", phone);
    fd.set("notes", notes);
    fd.set("rating_internal", String(rating));
    fd.set("contact_name", contactName);
    fd.set("contact_email", email);
    fd.set("contact_phone", phone);
    startTransition(async () => {
      try {
        await createSupplier(fd);
      } catch (e) {
        // The server action throws a control-flow error on redirect; let it bubble.
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Failed to create supplier");
      }
    });
  }

  const canNext = step === 1 ? name.trim() !== "" && categoryId !== "" : true;

  return (
    <div className="animate-fade-in min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/event-manager/suppliers" className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors" aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2} />
          </Link>
          <div className="h-5 w-px bg-surface-200" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-sm font-semibold text-surface-900">New Supplier</h1>
          </div>
        </div>

        <WizardStepper steps={STEPS} current={step} className="hidden sm:flex" />

        <div className="w-8" />
      </div>

      {/* Mobile stepper */}
      <div className="sm:hidden bg-white border-b border-surface-200 px-6 py-3 flex justify-center">
        <WizardStepper steps={STEPS} current={step} />
      </div>

      {/* Body */}
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        {error && (
          <div className="mb-4 p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
            <div className="pb-3 border-b border-surface-100">
              <h2 className="text-base font-semibold text-surface-900">Basic Information</h2>
              <p className="text-xs text-surface-500 mt-0.5">Core details about this supplier</p>
            </div>

            <Field label="Supplier Name" required>
              <input type="text" placeholder="e.g. Noble Kitchen Co." value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Category" required>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                  <option value="" disabled>Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Internal Rating">
              <StarRating value={rating} onChange={setRating} />
            </Field>

            <Field label="Supplier Logo">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setLogo(f);
                  }}
                />
                <div className={cn("w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors", logo ? "border-success-400 bg-success-50" : "border-surface-200 bg-surface-50 hover:border-brand-400")}>
                  {logo ? <CheckCircle2 className="w-6 h-6 text-success-600" strokeWidth={2} /> : <Upload className="w-5 h-5 text-surface-400" strokeWidth={1.8} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-700">{logo ? logo.name : "Upload logo image"}</p>
                  <p className="text-xs text-surface-400 mt-0.5">PNG, JPG or SVG · Max 2 MB</p>
                </div>
              </label>
            </Field>

            <Field label="Notes">
              <textarea rows={3} placeholder="Any internal notes about this supplier…" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + " resize-none"} />
            </Field>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
            <div className="pb-3 border-b border-surface-100">
              <h2 className="text-base font-semibold text-surface-900">Contact Details</h2>
              <p className="text-xs text-surface-500 mt-0.5">Primary contact for this supplier</p>
            </div>

            <Field label="Primary Contact Name">
              <input type="text" placeholder="e.g. Sarah Noble" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email">
                <input type="email" placeholder="sarah@supplier.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone">
                <input type="tel" placeholder="+44 7700 900000" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <Field label="Website">
              <input type="url" placeholder="https://example.com" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
            <div className="pb-3 border-b border-surface-100">
              <h2 className="text-base font-semibold text-surface-900">Documents</h2>
              <p className="text-xs text-surface-500 mt-0.5">Upload key compliance and contract documents</p>
            </div>

            <UploadCard label="Insurance Certificate" hint="Public liability insurance · PDF or image" file={insuranceFile} onFile={setInsuranceFile} />
            <UploadCard label="Contract Template" hint="Standard supplier agreement · PDF or DOCX" file={contractFile} onFile={setContractFile} />
            <UploadCard label="Bank Details" hint="Encrypted · PDF or image" file={bankFile} onFile={setBankFile} />

            <div className="mt-2 p-3 bg-surface-50 rounded-lg border border-surface-200">
              <p className="text-xs text-surface-500">All documents are stored securely and are only accessible to authorised team members.</p>
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
              <h2 className="text-base font-semibold text-surface-900 mb-4">Review &amp; Confirm</h2>

              <div className="mb-5">
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">Basics</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs text-surface-400">Supplier Name</p>
                    <p className="text-sm font-medium text-surface-900">{name || <span className="text-surface-300">—</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-400">Category</p>
                    <p className="text-sm font-medium text-surface-900">{categories.find((c) => c.id === categoryId)?.name || <span className="text-surface-300">—</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-400">Status</p>
                    <p className="text-sm font-medium text-surface-900">{STATUSES.find((s) => s.value === status)?.label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-400">Rating</p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn("w-3.5 h-3.5", n <= rating ? "fill-warning-400 text-warning-400" : "text-surface-200 fill-surface-200")} strokeWidth={1.5} />
                      ))}
                    </div>
                  </div>
                  {notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-surface-400">Notes</p>
                      <p className="text-sm text-surface-700">{notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-surface-100 mb-5" />

              <div>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">Contact</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs text-surface-400">Contact Name</p>
                    <p className="text-sm font-medium text-surface-900">{contactName || <span className="text-surface-300">—</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-400">Email</p>
                    <p className="text-sm font-medium text-surface-900">{email || <span className="text-surface-300">—</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-400">Phone</p>
                    <p className="text-sm font-medium text-surface-900">{phone || <span className="text-surface-300">—</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-surface-400">Website</p>
                    <p className="text-sm font-medium text-surface-900 truncate">{website || <span className="text-surface-300">—</span>}</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-brand-600/20"
            >
              {pending ? "Creating…" : "Create Supplier"}
            </button>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-6">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
              Back
            </button>
          ) : (
            <div />
          )}
          {step < 4 && (
            <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50">
              Continue
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
