"use client";

import { useState } from "react";
import { SettingsShell } from "@/components/settings/SettingsShell";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

export default function FinanceDefaultsPage() {
  const [currency, setCurrency] = useState("GBP");
  const [taxRate, setTaxRate] = useState("20");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [quotePrefix, setQuotePrefix] = useState("QT-");
  const [paymentTerms, setPaymentTerms] = useState("30");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <SettingsShell title="Finance Defaults" description="Set default values for invoices, quotes, and payment terms.">
      <div className="max-w-lg space-y-6">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Default currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={INPUT_CLS}>
              <option value="GBP">GBP — British Pound (£)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Default tax rate (%)</label>
            <div className="relative">
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                min="0"
                max="100"
                step="0.5"
                className={`${INPUT_CLS} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-surface-400">%</span>
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Invoice prefix</label>
            <input
              type="text"
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
              placeholder="INV-"
              className={INPUT_CLS}
            />
            <p className="mt-1.5 text-xs text-surface-400">Example: {invoicePrefix}0001</p>
          </div>

          <div>
            <label className={LABEL_CLS}>Quote prefix</label>
            <input
              type="text"
              value={quotePrefix}
              onChange={(e) => setQuotePrefix(e.target.value)}
              placeholder="QT-"
              className={INPUT_CLS}
            />
            <p className="mt-1.5 text-xs text-surface-400">Example: {quotePrefix}0001</p>
          </div>

          <div>
            <label className={LABEL_CLS}>Default payment terms</label>
            <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={INPUT_CLS}>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
            </select>
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
