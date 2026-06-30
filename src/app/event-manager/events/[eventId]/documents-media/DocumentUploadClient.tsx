"use client";

import { useState, useRef, useTransition } from "react";
import { Upload, X, FileText, Image, Video, File, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { uploadDocuments } from "./actions";

const CATEGORIES = [
  { value: "contract", label: "Contract" },
  { value: "proposal", label: "Proposal" },
  { value: "invoice", label: "Invoice" },
  { value: "media", label: "Media" },
  { value: "floor_plan", label: "Floor Plan" },
  { value: "brief", label: "Brief" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

function FileIcon({ name, type }: { name: string; type: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = type.toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
    return <Image className="h-4 w-4 text-blue-500" />;
  if (mime.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext))
    return <Video className="h-4 w-4 text-violet-500" />;
  if (mime === "application/pdf" || ext === "pdf")
    return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-surface-400" />;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  eventId: string;
}

export function DocumentUploadButton({ eventId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm"
      >
        <Upload className="h-4 w-4" />
        Upload
      </button>
      {open && <DocumentUploadModal eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  );
}

interface ModalProps {
  eventId: string;
  onClose: () => void;
}

function DocumentUploadModal({ eventId, onClose }: ModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("other");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => {
      const combined = [...prev, ...picked];
      return combined.slice(0, 10);
    });
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped].slice(0, 10));
  }

  function handleSubmit() {
    if (files.length === 0) {
      setError("Please select at least one file.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("category", category);
    for (const f of files) fd.append("files", f);

    startTransition(async () => {
      try {
        await uploadDocuments(eventId, fd);
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <div>
            <h2 className="text-base font-semibold text-surface-900">Upload Documents</h2>
            <p className="text-xs text-surface-500">Up to 10 files · Max 50 MB each</p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isPending}
              className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => !isPending && inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-surface-200 hover:border-brand-400 bg-surface-50 hover:bg-brand-50 transition-colors flex flex-col items-center justify-center py-8 gap-2"
          >
            <Upload className="h-7 w-7 text-surface-400" />
            <p className="text-sm text-surface-600 font-medium">Drop files here or <span className="text-brand-600">browse</span></p>
            <p className="text-xs text-surface-400">PDF, Word, Excel, images, videos</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.mov,.webm,.txt,.csv"
              onChange={handleFilePick}
              className="hidden"
              disabled={isPending}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
              {files.map((file, idx) => (
                <li key={idx} className="flex items-center gap-2.5 rounded-lg border border-surface-100 bg-surface-50 px-3 py-2">
                  <FileIcon name={file.name} type={file.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-surface-900 truncate">{file.name}</p>
                    <p className="text-[11px] text-surface-400">{fmtSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    disabled={isPending}
                    className="text-surface-400 hover:text-danger-600 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-xs text-danger-700 whitespace-pre-line">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-success-600" />
              <p className="text-xs text-success-700 font-medium">Files uploaded successfully!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-surface-100 bg-surface-50">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || files.length === 0 || success}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""}` : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline empty-state upload button — calls the same modal. */
export function DocumentUploadEmptyButton({ eventId }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Upload className="h-4 w-4" />
        Upload Files
      </button>
      {open && <DocumentUploadModal eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  );
}
