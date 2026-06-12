"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

const TIMEZONES = [
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore",
];

const BUSINESS_TYPES = [
  "Event Management Agency",
  "Wedding Planner",
  "Corporate Events",
  "Venue",
  "Freelance Coordinator",
  "Other",
];

export default function WorkspaceSettingsPage() {
  const [name, setName] = useState("The Grand Affair");
  const [businessType, setBusinessType] = useState("Event Management Agency");
  const [timezone, setTimezone] = useState("Europe/London");
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsShell title="Workspace" description="Manage your workspace identity and configuration.">
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
              value="the-grand-affair"
              readOnly
              className={`${INPUT_CLS} bg-surface-50 text-surface-500 cursor-not-allowed`}
            />
            <p className="mt-1.5 text-xs text-surface-400">Slug cannot be changed after workspace creation.</p>
          </div>

          <div>
            <label className={LABEL_CLS}>Business type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className={INPUT_CLS}
            >
              {BUSINESS_TYPES.map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
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
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Save changes
          </button>
          {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
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
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-danger-700 mb-2">Delete workspace</h3>
            <p className="text-sm text-surface-600 mb-4">
              To confirm, type <strong>the-grand-affair</strong> below.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="the-grand-affair"
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
                disabled={deleteConfirm !== "the-grand-affair"}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-danger-600 hover:bg-danger-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsShell>
  );
}
