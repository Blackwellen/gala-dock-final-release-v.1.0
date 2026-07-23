"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { updateWorkspace, updateSupplierType } from "./actions";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

const TIMEZONES = [
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore",
];

interface WorkspaceFormProps {
  initialName: string;
  slug: string;
  initialTimezone: string;
  /** Persona of the active workspace; the business-type control only shows for suppliers. */
  workspaceType?: string;
  initialSupplierType?: "solo" | "agency";
}

export function WorkspaceForm({
  initialName,
  slug,
  initialTimezone,
  workspaceType,
  initialSupplierType = "solo",
}: WorkspaceFormProps) {
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(
    TIMEZONES.includes(initialTimezone) ? initialTimezone : TIMEZONES[0]
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [supplierType, setSupplierType] = useState(initialSupplierType);
  const [supplierTypeSaving, setSupplierTypeSaving] = useState(false);
  const [supplierTypeSaved, setSupplierTypeSaved] = useState(false);

  function handleSupplierTypeChange(next: "solo" | "agency") {
    if (next === supplierType) return;
    setSupplierType(next);
    setSupplierTypeSaving(true);
    startTransition(async () => {
      const res = await updateSupplierType(next);
      setSupplierTypeSaving(false);
      if (res?.ok) {
        setSupplierTypeSaved(true);
        setTimeout(() => setSupplierTypeSaved(false), 2500);
      } else {
        setSupplierType(initialSupplierType);
        setError(res?.error ?? "Could not update business type.");
      }
    });
  }

  function handleSave() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("timezone", timezone);
    startTransition(async () => {
      const res = await updateWorkspace(fd);
      if (res?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res?.error ?? "Could not save changes.");
      }
    });
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-4">
        <div>
          <label className={LABEL_CLS}>Workspace name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLS}
          />
        </div>

        <div>
          <label className={LABEL_CLS}>Workspace slug</label>
          <input
            type="text"
            value={slug}
            readOnly
            className={`${INPUT_CLS} bg-surface-50 text-surface-500 cursor-not-allowed`}
          />
          <p className="mt-1.5 text-xs text-surface-400">Slug cannot be changed after workspace creation.</p>
        </div>

        <div>
          <label className={LABEL_CLS}>Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={INPUT_CLS}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {workspaceType === "supplier" && (
          <div>
            <label className={LABEL_CLS}>Business type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSupplierTypeChange("solo")}
                disabled={supplierTypeSaving}
                className={`text-left px-4 py-3 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                  supplierType === "solo"
                    ? "border-brand-500 bg-brand-50 text-brand-900"
                    : "border-surface-200 hover:border-surface-300 text-surface-700"
                }`}
              >
                <span className="block font-medium">Solo supplier</span>
                <span className="block text-xs text-surface-500 mt-0.5">Just me — no roster to manage.</span>
              </button>
              <button
                type="button"
                onClick={() => handleSupplierTypeChange("agency")}
                disabled={supplierTypeSaving}
                className={`text-left px-4 py-3 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                  supplierType === "agency"
                    ? "border-brand-500 bg-brand-50 text-brand-900"
                    : "border-surface-200 hover:border-surface-300 text-surface-700"
                }`}
              >
                <span className="block font-medium">Agency</span>
                <span className="block text-xs text-surface-500 mt-0.5">
                  I manage a team/roster and assign jobs internally.
                </span>
              </button>
            </div>
            <p className="mt-1.5 text-xs text-surface-400">
              Agencies get a Team/Roster area in the sidebar for managing staff and assigning jobs.
              {supplierTypeSaved && <span className="text-success-600 font-medium ml-2">Saved!</span>}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        {error && <span className="text-sm text-danger-600 font-medium">{error}</span>}
      </div>

      {/* Danger zone */}
      <div className="border-t border-surface-100 pt-6 mt-6">
        <h2 className="text-sm font-semibold text-danger-700 mb-2">Danger zone</h2>
        <p className="text-sm text-surface-500 mb-4">
          Permanently delete this workspace, all events, suppliers, files, and billing data.
          This cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-danger-600 hover:bg-danger-700 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.8} />
          Delete workspace
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-danger-700 mb-2">Delete workspace</h3>
            <p className="text-sm text-surface-600 mb-4">
              To confirm, type <strong>{slug}</strong> below.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={slug}
              className={INPUT_CLS}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirm !== slug}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-danger-600 hover:bg-danger-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
