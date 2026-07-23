"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MoreHorizontal, PauseCircle, RotateCcw, Send, Star, Archive as ArchiveIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { reactivateSupplier, restoreSupplier, sendDocumentReminder, toggleSupplierStar } from "../actions";
import { PauseModal, ArchiveModal, RequestDocumentsModal } from "./SupplierLifecycleModals";

/** Mail + kebab row actions. Kebab opens a small menu with Pause/Archive for live suppliers. */
export function RowActions({ supplierId, status }: { supplierId: string; status?: "active" | "paused" | "archived" | string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"pause" | "archive" | null>(null);

  return (
    <div className="flex items-center justify-end gap-1 relative">
      <button
        type="button"
        aria-label="Email supplier"
        className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-surface-100 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Mail className="w-4 h-4" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-8 z-40 w-44 bg-white border border-surface-200 rounded-lg shadow-lg py-1"
          >
            {status !== "paused" && status !== "archived" && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); setModal("pause"); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 transition-colors"
              >
                <PauseCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
                Pause Supplier
              </button>
            )}
            {status !== "archived" && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); setModal("archive"); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors"
              >
                <ArchiveIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                Archive Supplier
              </button>
            )}
          </div>
        </>
      )}

      {modal === "pause" && (
        <PauseModal
          supplierId={supplierId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); router.refresh(); }}
        />
      )}
      {modal === "archive" && (
        <ArchiveModal
          supplierId={supplierId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

export function StarToggle({ supplierId, starred }: { supplierId: string; starred: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(starred);

  return (
    <button
      type="button"
      aria-label={optimistic ? "Remove from recently used" : "Mark as recently used"}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const next = !optimistic;
        setOptimistic(next);
        startTransition(async () => {
          const result = await toggleSupplierStar(supplierId);
          if (result.error) {
            setOptimistic(!next); // roll back
            alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
      className="p-1 rounded-lg hover:bg-surface-100 transition-colors disabled:opacity-60"
    >
      <Star
        className={cn("w-4 h-4", optimistic ? "text-warning-500 fill-warning-500" : "text-surface-300")}
        strokeWidth={1.8}
      />
    </button>
  );
}

export function ReactivateAction({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleReactivate() {
    if (!confirm("Reactivate this supplier? It will move back to Active.")) return;
    startTransition(async () => {
      const result = await reactivateSupplier(supplierId, "");
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => { e.stopPropagation(); handleReactivate(); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-60"
      >
        <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
        {pending ? "Reactivating…" : "Reactivate"}
      </button>
    </div>
  );
}

export function RestoreAction({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRestore() {
    if (!confirm("Restore this supplier? It will move back to Active.")) return;
    startTransition(async () => {
      const result = await restoreSupplier(supplierId);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => { e.stopPropagation(); handleRestore(); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-60"
      >
        <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
        {pending ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}

export function DocumentChaseAction({
  supplierId,
  state,
  missingTypes,
}: {
  supplierId: string;
  state: "request" | "remind";
  missingTypes: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function handleRemind() {
    startTransition(async () => {
      const result = await sendDocumentReminder(supplierId, missingTypes[0] ?? "");
      if (result.error) {
        alert(result.error);
        return;
      }
      setNotice(result.message ?? null);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (state === "request") setShowRequestModal(true);
          else handleRemind();
        }}
        title={notice ?? undefined}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
      >
        <Send className="w-3.5 h-3.5" strokeWidth={2} />
        {pending ? "Sending…" : state === "request" ? "Request Docs" : "Send Reminder"}
      </button>

      {showRequestModal && (
        <RequestDocumentsModal
          supplierId={supplierId}
          documentTypes={missingTypes}
          onClose={() => setShowRequestModal(false)}
          onSaved={(message) => {
            setShowRequestModal(false);
            setNotice(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
