"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { archiveSupplier, pauseSupplier, requestSupplierDocuments } from "../actions";
import { ARCHIVE_REASONS, PAUSE_REASONS } from "../_data/reasons";

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-surface-400";

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-xl shadow-xl border border-surface-200 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold text-surface-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-surface-400 hover:text-surface-700 rounded-md hover:bg-surface-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PauseModal({
  supplierId,
  onClose,
  onSaved,
}: {
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(PAUSE_REASONS[0].value);
  const [reasonDetail, setReasonDetail] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await pauseSupplier(supplierId, reason, reasonDetail, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <ModalShell title="Pause Supplier" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="pause-reason">
            Reason
          </label>
          <select id="pause-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
            {PAUSE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="pause-detail">
            Detail
          </label>
          <input
            id="pause-detail"
            className={inputCls}
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            placeholder="e.g. Insurance certificate expired, awaiting renewal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="pause-note">
            Internal Note
          </label>
          <textarea
            id="pause-note"
            rows={3}
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Context for the team…"
          />
        </div>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Pausing…" : "Pause Supplier"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function ArchiveModal({
  supplierId,
  onClose,
  onSaved,
}: {
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(ARCHIVE_REASONS[0].value);
  const [reasonDetail, setReasonDetail] = useState("");
  const [canBeRestored, setCanBeRestored] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await archiveSupplier(supplierId, reason, reasonDetail, canBeRestored, 6);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <ModalShell title="Archive Supplier" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="archive-reason">
            Reason
          </label>
          <select id="archive-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
            {ARCHIVE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5" htmlFor="archive-detail">
            Detail
          </label>
          <input
            id="archive-detail"
            className={inputCls}
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            placeholder="e.g. Contract not renewed after annual review"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-surface-700">
          <input type="checkbox" checked={canBeRestored} onChange={(e) => setCanBeRestored(e.target.checked)} />
          Can be restored later
        </label>
        <p className="text-xs text-surface-400">
          Retained for 6 years per data retention policy, then eligible for permanent deletion.
        </p>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 text-sm font-semibold text-white bg-danger-600 rounded-lg hover:bg-danger-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Archiving…" : "Archive Supplier"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function RequestDocumentsModal({
  supplierId,
  documentTypes,
  onClose,
  onSaved,
}: {
  supplierId: string;
  documentTypes: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(documentTypes));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(type: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestSupplierDocuments(supplierId, [...selected]);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved(result.message ?? "Document request recorded.");
    });
  }

  return (
    <ModalShell title="Request Documents" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <p className="text-xs text-surface-500">Select the outstanding documents to request from this supplier.</p>
        <div className="space-y-2">
          {documentTypes.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-surface-700">
              <input type="checkbox" checked={selected.has(type)} onChange={() => toggle(type)} />
              {type}
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending || selected.size === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Sending…" : "Request Documents"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
