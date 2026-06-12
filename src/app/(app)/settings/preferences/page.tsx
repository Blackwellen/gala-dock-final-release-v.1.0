"use client";

import { useState } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

export default function PreferencesPage() {
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [currency, setCurrency] = useState("GBP");
  const [language, setLanguage] = useState("en-GB");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsShell title="Preferences" description="Customise how dates, currencies, and language appear across the app.">
      <div className="max-w-lg space-y-6">
        {/* Date format */}
        <div>
          <p className={LABEL_CLS}>Date format</p>
          <div className="space-y-2">
            {["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((fmt) => (
              <label
                key={fmt}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  dateFormat === fmt
                    ? "border-brand-300 bg-brand-50"
                    : "border-surface-200 bg-white hover:bg-surface-50"
                )}
              >
                <input
                  type="radio"
                  name="dateFormat"
                  value={fmt}
                  checked={dateFormat === fmt}
                  onChange={() => setDateFormat(fmt)}
                  className="accent-brand-600"
                />
                <span className="text-sm font-medium text-surface-900">{fmt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-surface-100 pt-6">
          <div>
            <label className={LABEL_CLS}>Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={INPUT_CLS}>
              <option value="GBP">GBP — British Pound (£)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-surface-100 pt-6">
          <div>
            <label className={LABEL_CLS}>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={INPUT_CLS}>
              <option value="en-GB">English (UK)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-surface-100 pt-6">
          <p className={LABEL_CLS}>Theme</p>
          <div className="flex gap-3">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "flex-1 py-3 rounded-lg border text-sm font-medium capitalize transition-colors",
                  theme === t
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
                )}
              >
                {t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-surface-400">Theme switching is UI-only in this release.</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Save preferences
          </button>
          {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        </div>
      </div>
    </SettingsShell>
  );
}
