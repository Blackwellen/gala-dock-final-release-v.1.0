"use client";

import { useState } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

const REQUIRED_DOCS = [
  { key: "insurance", label: "Public liability insurance" },
  { key: "contract", label: "Signed contract" },
  { key: "bank", label: "Bank details" },
  { key: "id", label: "ID verification" },
];

export default function SupplierDefaultsPage() {
  const [paymentTerms, setPaymentTerms] = useState("30");
  const [currency, setCurrency] = useState("GBP");
  const [quoteExpiry, setQuoteExpiry] = useState("14");
  const [requiredDocs, setRequiredDocs] = useState<string[]>(["insurance", "contract", "bank"]);
  const [saved, setSaved] = useState(false);

  function toggleDoc(key: string) {
    setRequiredDocs((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsShell title="Supplier Defaults" description="Set default values applied when adding new suppliers.">
      <div className="max-w-lg space-y-6">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Default payment terms</label>
            <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={INPUT_CLS}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Default currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={INPUT_CLS}>
              <option value="GBP">GBP — British Pound (£)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Default quote expiry</label>
            <select value={quoteExpiry} onChange={(e) => setQuoteExpiry(e.target.value)} className={INPUT_CLS}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
        </div>

        <div className="border-t border-surface-100 pt-6">
          <p className={LABEL_CLS}>Required documents</p>
          <p className="text-xs text-surface-400 mb-3">New suppliers will be prompted to submit these documents.</p>
          <div className="space-y-2">
            {REQUIRED_DOCS.map((doc) => (
              <label
                key={doc.key}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  requiredDocs.includes(doc.key)
                    ? "border-brand-200 bg-brand-50"
                    : "border-surface-200 bg-white hover:bg-surface-50"
                )}
              >
                <input
                  type="checkbox"
                  checked={requiredDocs.includes(doc.key)}
                  onChange={() => toggleDoc(doc.key)}
                  className="w-4 h-4 accent-brand-600 rounded"
                />
                <span className="text-sm text-surface-900">{doc.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            Save defaults
          </button>
          {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        </div>
      </div>
    </SettingsShell>
  );
}
