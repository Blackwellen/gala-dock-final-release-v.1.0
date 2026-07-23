"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Mail, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupplierDocument, requestSupplierDocument } from "./actions";
import type { FilterOption } from "./types";

const KIND_OPTIONS: { value: "contract" | "rider" | "menu" | "invoice_template" | "document" | "image"; label: string }[] = [
  { value: "contract", label: "Contract" },
  { value: "rider", label: "Rider" },
  { value: "menu", label: "Menu" },
  { value: "invoice_template", label: "Invoice / Quote" },
  { value: "document", label: "Document / Certificate" },
  { value: "image", label: "Image" },
];

const RISK_OPTIONS = [
  { value: "", label: "No risk rating" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

interface Props {
  workspaceId: string;
  supplierOptions: FilterOption[];
  documentTypeOptions: FilterOption[];
  eventOptions: FilterOption[];
}

export function SupplierDocsHeaderActions({ workspaceId, supplierOptions, documentTypeOptions, eventOptions }: Props) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setRequestOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
      >
        <Mail className="w-4 h-4" strokeWidth={1.8} />
        Request documents
      </button>
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
      >
        <Upload className="w-4 h-4" strokeWidth={1.8} />
        Upload document
        <ChevronDown className="w-3.5 h-3.5 opacity-70" strokeWidth={1.8} />
      </button>

      {requestOpen && (
        <RequestDocumentsModal supplierOptions={supplierOptions} documentTypeOptions={documentTypeOptions} onClose={() => setRequestOpen(false)} />
      )}
      {uploadOpen && (
        <UploadDocumentModal
          workspaceId={workspaceId}
          supplierOptions={supplierOptions}
          eventOptions={eventOptions}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-surface-900">{title}</h2>
            {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function RequestDocumentsModal({
  supplierOptions, documentTypeOptions, onClose,
}: { supplierOptions: FilterOption[]; documentTypeOptions: FilterOption[]; onClose: () => void }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [customType, setCustomType] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const type = documentType === "__custom__" ? customType.trim() : documentType;
    if (!supplierId || !type) {
      setError("Choose a supplier and document type.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestSupplierDocument({ supplierId, documentType: type, note: note.trim() || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      setTimeout(onClose, 900);
    });
  }

  return (
    <ModalShell
      title="Request documents"
      subtitle="Creates a real outreach request logged against the supplier's compliance record."
      onClose={onClose}
    >
      <div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Supplier</label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
          <option value="">Select supplier…</option>
          {supplierOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Document type</label>
        <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
          <option value="">Select document type…</option>
          {documentTypeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="__custom__">Other (type below)</option>
        </select>
        {documentType === "__custom__" && (
          <input
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="e.g. Public Liability Insurance"
            className="mt-2 w-full px-3 py-2 rounded-lg border border-surface-200 text-sm"
          />
        )}
      </div>
      <div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Add context for the request…"
          className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm resize-none"
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-danger-600 shrink-0 mt-0.5" />
          <p className="text-xs text-danger-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-success-600" />
          <p className="text-xs text-success-700 font-medium">Request logged.</p>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
        <button
          onClick={submit}
          disabled={pending || success}
          className={cn("inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50")}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Sending…" : "Send request"}
        </button>
      </div>
    </ModalShell>
  );
}

function UploadDocumentModal({
  workspaceId, supplierOptions, eventOptions, onClose,
}: { workspaceId: string; supplierOptions: FilterOption[]; eventOptions: FilterOption[]; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]["value"]>("document");
  const [supplierId, setSupplierId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [category, setCategory] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [relatedEventId, setRelatedEventId] = useState("");
  const [visibility, setVisibility] = useState<"workspace" | "restricted" | "link">("workspace");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
    }
    e.target.value = "";
  }

  function submit() {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!title.trim()) {
      setError("Give the document a name.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const presignRes = await fetch("/api/r2/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            kind: "library-asset",
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            recordId: supplierId || undefined,
          }),
        });
        const presignJson = await presignRes.json();
        if (!presignRes.ok) throw new Error(presignJson.error ?? "Could not prepare upload.");

        const putRes = await fetch(presignJson.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error("File upload to storage failed.");

        const result = await createSupplierDocument({
          title,
          kind,
          storagePath: presignJson.objectKey,
          mime: file.type || null,
          sizeBytes: file.size,
          supplierId: supplierId || null,
          documentType: documentType || KIND_OPTIONS.find((k) => k.value === kind)?.label || "Document",
          category,
          expiryDate: expiryDate || null,
          riskLevel: (riskLevel || null) as "critical" | "high" | "medium" | "low" | null,
          relatedEventId: relatedEventId || null,
          visibility,
        });
        if (!result.ok) throw new Error(result.error);

        setSuccess(true);
        router.refresh();
        setTimeout(onClose, 900);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <ModalShell title="Upload document" subtitle="Uploads directly to secure storage, scoped to this workspace." onClose={onClose}>
      <div
        onClick={() => !pending && inputRef.current?.click()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-6 gap-1.5"
      >
        <Upload className="h-6 w-6 text-surface-400" />
        <p className="text-sm text-surface-600 font-medium">{file ? file.name : <>Drop a file or <span className="text-brand-600">browse</span></>}</p>
        <p className="text-xs text-surface-400">PDF, Word, Excel, images</p>
        <input ref={inputRef} type="file" onChange={handlePick} className="hidden" disabled={pending} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Document name</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" placeholder="e.g. Floral Co Insurance Certificate" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">File kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
            {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Document type</label>
          <input value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="e.g. Insurance Certificate" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Supplier (optional)</label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
          <option value="">No supplier — company-wide document</option>
          {supplierOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Security" className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Expiry date (optional)</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Related event</label>
          <select value={relatedEventId} onChange={(e) => setRelatedEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
            <option value="">No linked event</option>
            {eventOptions.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Risk level</label>
          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
            {RISK_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Visibility</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm">
          <option value="workspace">Internal (workspace only)</option>
          <option value="restricted">Restricted</option>
          <option value="link">Shared via link</option>
        </select>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-danger-600 shrink-0 mt-0.5" />
          <p className="text-xs text-danger-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-success-600" />
          <p className="text-xs text-success-700 font-medium">Document uploaded.</p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium">Cancel</button>
        <button
          onClick={submit}
          disabled={pending || success}
          className={cn("inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50")}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </ModalShell>
  );
}
