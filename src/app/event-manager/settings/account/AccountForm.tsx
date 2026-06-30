"use client";

import { useState, useTransition } from "react";
import { Upload, Mail } from "lucide-react";
import { updateProfile } from "./actions";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

const TIMEZONES = [
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore",
];

interface AccountFormProps {
  initialName: string;
  email: string;
  initialTimezone: string;
}

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AccountForm({ initialName, email, initialTimezone }: AccountFormProps) {
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(
    TIMEZONES.includes(initialTimezone) ? initialTimezone : TIMEZONES[0]
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const fd = new FormData();
    fd.set("display_name", name);
    fd.set("timezone", timezone);
    startTransition(async () => {
      const res = await updateProfile(fd);
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
      {/* Profile photo */}
      <div>
        <p className={LABEL_CLS}>Profile Photo</p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 text-xl font-bold">{initials(name, email)}</span>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-700 bg-white hover:bg-surface-50 border border-surface-200 rounded-lg cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
            Upload photo
            <input type="file" accept="image/*" className="sr-only" />
          </label>
        </div>
        <p className="mt-2 text-xs text-surface-400">JPG, PNG or WebP. Max 2 MB.</p>
      </div>

      <div className="border-t border-surface-100 pt-6">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>Email address</label>
            <div className="flex items-center gap-3">
              <input
                type="email"
                value={email}
                readOnly
                className={`${INPUT_CLS} bg-surface-50 text-surface-500 cursor-not-allowed`}
              />
              <button className="px-3 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors whitespace-nowrap">
                Change email
              </button>
            </div>
            <p className="mt-1.5 text-xs text-surface-400 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              A verification link will be sent to your new email address.
            </p>
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
      </div>

      <div className="flex items-center gap-3 pt-2">
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
    </div>
  );
}
