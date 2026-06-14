"use client";

import { useState, useRef, useTransition } from "react";
import { ChevronLeft, Star, Upload, CheckCircle2, FileText, Save } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { updateSupplier } from "../../actions";
import type { CategoryOption } from "../../new/NewSupplierForm";

const STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "suspended_by_admin", label: "Suspended" },
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

export interface EditSupplierData {
  id: string;
  name: string;
  categoryId: string;
  status: string;
  rating: number;
  notes: string;
  email: string;
  phone: string;
  website: string;
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pb-4 border-b border-surface-100 mb-5">
      <h2 className="text-base font-semibold text-surface-900">{title}</h2>
      {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
    </div>
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

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} className="focus:outline-none" aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}>
          <Star className={cn("w-6 h-6 transition-colors", n <= (hover || value) ? "fill-warning-400 text-warning-400" : "text-surface-200 fill-surface-200")} strokeWidth={1.5} />
        </button>
      ))}
      {value > 0 && <span className="ml-2 text-sm text-surface-500">{value} / 5</span>}
    </div>
  );
}

function DocUploadRow({ label, hint }: { label: string; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="flex items-center justify-between gap-4 p-4 border border-surface-200 rounded-xl hover:border-brand-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", file ? "bg-success-50" : "bg-surface-100")}>
          {file ? <CheckCircle2 className="w-4.5 h-4.5 text-success-600" strokeWidth={2} /> : <FileText className="w-4.5 h-4.5 text-surface-400" strokeWidth={1.8} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-surface-800">{label}</p>
          {file ? <p className="text-xs text-success-600 truncate">{file.name}</p> : <p className="text-xs text-surface-400">{hint ?? "Not uploaded"}</p>}
        </div>
      </div>
      <label className="shrink-0 cursor-pointer">
        <input ref={ref} type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
        <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
          <Upload className="w-3.5 h-3.5" strokeWidth={2} />
          {file ? "Replace" : "Upload"}
        </span>
      </label>
    </div>
  );
}

export function EditSupplierForm({
  supplier,
  categories,
}: {
  supplier: EditSupplierData;
  categories: CategoryOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(supplier.name);
  const [categoryId, setCategoryId] = useState(supplier.categoryId);
  const [status, setStatus] = useState(supplier.status);
  const [rating, setRating] = useState(supplier.rating);
  const [notes, setNotes] = useState(supplier.notes);
  const [email, setEmail] = useState(supplier.email);
  const [phone, setPhone] = useState(supplier.phone);
  const [website, setWebsite] = useState(supplier.website);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("category_id", categoryId);
    fd.set("status", status);
    fd.set("rating_internal", String(rating));
    fd.set("notes", notes);
    fd.set("primary_email", email);
    fd.set("primary_phone", phone);
    fd.set("website", website);
    startTransition(async () => {
      try {
        await updateSupplier(supplier.id, fd);
      } catch (err) {
        if (isControlFlowError(err)) throw err;
        setError(err instanceof Error ? err.message : "Failed to save changes");
      }
    });
  }

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="bg-white border-b border-surface-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Link href={`/suppliers/${supplier.id}`} className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-900 transition-colors">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            Back to supplier
          </Link>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-surface-900 tracking-tight">Edit Supplier</h1>
            <p className="text-sm text-surface-500 mt-0.5">{supplier.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/suppliers/${supplier.id}`} className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              Cancel
            </Link>
            <button form="edit-supplier-form" type="submit" disabled={pending} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors">
              <Save className="w-3.5 h-3.5" strokeWidth={2} />
              {pending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="p-6 max-w-2xl space-y-6">
        {error && (
          <div className="p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">{error}</div>
        )}
        <form id="edit-supplier-form" onSubmit={handleSave}>
          {/* Basics */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-6">
            <SectionTitle title="Basic Information" description="Core details about this supplier" />
            <div className="space-y-5">
              <Field label="Supplier Name" required>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Category">
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                    <option value="">Uncategorised</option>
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

              <Field label="Notes">
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls + " resize-none"} />
              </Field>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-6">
            <SectionTitle title="Contact Details" description="Primary contact channels" />
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Email">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Phone">
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
                </Field>
              </div>

              <Field label="Website">
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-6">
            <SectionTitle title="Documents" description="Upload or replace compliance documents" />
            <div className="space-y-3">
              <DocUploadRow label="Insurance Certificate" hint="Public liability insurance" />
              <DocUploadRow label="Contract Template" hint="Standard supplier agreement" />
              <DocUploadRow label="Bank Details" hint="Encrypted bank information" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3">
            <Link href={`/suppliers/${supplier.id}`} className="px-4 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={pending} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors">
              <Save className="w-3.5 h-3.5" strokeWidth={2} />
              {pending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
