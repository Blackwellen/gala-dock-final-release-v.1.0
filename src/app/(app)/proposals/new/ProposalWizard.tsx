"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, ArrowRight, Save, Send } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { createProposal } from "./actions";

interface LeadOption {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  guestCount: string;
}

interface Line {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
}

const EVENT_TYPES = ["Wedding", "Corporate", "Charity", "Private", "Conference", "Exhibition", "Other"];

const DEFAULT_INTRO =
  "Thank you for considering Gala Dock for your event. We are delighted to present the following proposal for your consideration.";
const DEFAULT_TERMS =
  "This proposal is valid for 14 days. A 33% deposit is required to confirm the booking. The remaining balance is due 14 days before the event date. Prices are inclusive of VAT unless stated otherwise.";

const STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Pricing" },
  { id: 3, label: "Terms" },
  { id: 4, label: "Preview" },
];

let nextLineId = 2;

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

export function ProposalWizard({
  leads,
  initialLeadId,
}: {
  leads: LeadOption[];
  initialLeadId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    title: "",
    clientName: "",
    clientEmail: "",
    eventType: "",
    eventDate: "",
    eventLocation: "",
    guestCount: "",
    validUntil: defaultValidUntil(),
    leadId: initialLeadId,
    introText: DEFAULT_INTRO,
    termsText: DEFAULT_TERMS,
    depositPct: 33,
    vatInclusive: true,
  });

  const [lines, setLines] = useState<Line[]>([
    { id: 1, description: "", quantity: 1, unitPrice: 0 },
  ]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyLead(id: string) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) {
      set("leadId", "");
      return;
    }
    setForm((prev) => ({
      ...prev,
      leadId: id,
      title: prev.title || `${lead.title} Proposal`,
      clientName: prev.clientName || lead.clientName,
      clientEmail: prev.clientEmail || lead.clientEmail,
      eventType: prev.eventType || lead.eventType,
      eventDate: prev.eventDate || lead.eventDate,
      eventLocation: prev.eventLocation || lead.eventLocation,
      guestCount: prev.guestCount || lead.guestCount,
    }));
  }

  function addLine() {
    setLines((prev) => [...prev, { id: nextLineId++, description: "", quantity: 1, unitPrice: 0 }]);
  }
  function removeLine(id: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }
  function updateLine(id: number, field: keyof Line, value: string | number) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const depositAmount = (total * form.depositPct) / 100;

  const detailsValid = form.title.trim().length > 0 && form.clientName.trim().length > 0;

  function submit(send: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await createProposal({
          title: form.title,
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          eventType: form.eventType,
          eventDate: form.eventDate,
          eventLocation: form.eventLocation,
          guestCount: form.guestCount,
          validUntil: form.validUntil,
          leadId: form.leadId,
          introText: form.introText,
          termsText: form.termsText,
          depositPct: form.depositPct,
          lines: lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          send,
        });
        // createProposal redirects on success; nothing further runs.
      } catch (e) {
        // Re-throw Next.js redirect signals so navigation proceeds.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw e;
        }
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex min-h-full flex-col bg-surface-50">
      <div className="border-b border-surface-200 bg-white px-6 py-5">
        <button
          onClick={() => router.push("/proposals")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-800"
        >
          <ArrowLeft className="h-4 w-4" /> Proposals
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-surface-900">New Proposal</h1>
        <div className="mt-5">
          <WizardStepper steps={STEPS} current={step} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-2.5 text-sm text-danger-700">
            {error}
          </div>
        )}

        {step === 1 && (
          <Card title="Proposal details">
            {leads.length > 0 && (
              <Field label="Link to lead (optional)">
                <select
                  value={form.leadId}
                  onChange={(e) => applyLead(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— None —</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} · {l.clientName}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Proposal title" required>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Carter Wedding Proposal 2026"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Client name" required>
                <input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Client email">
                <input type="email" value={form.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Event type">
                <select value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Event date">
                <input type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Event location">
                <input value={form.eventLocation} onChange={(e) => set("eventLocation", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Guest count">
                <input type="number" min={0} value={form.guestCount} onChange={(e) => set("guestCount", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Valid until">
                <input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card title="Services & pricing">
            <div className="overflow-hidden rounded-lg border border-surface-200">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                  <tr>
                    <th className="px-3 py-2">Description</th>
                    <th className="w-20 px-3 py-2 text-right">Qty</th>
                    <th className="w-32 px-3 py-2 text-right">Unit £</th>
                    <th className="w-28 px-3 py-2 text-right">Total</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(l.id, "description", e.target.value)}
                          placeholder="e.g. Full event planning & coordination"
                          className="w-full rounded border border-surface-200 px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.id, "quantity", Number(e.target.value))}
                          className="w-full rounded border border-surface-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.id, "unitPrice", Number(e.target.value))}
                          className="w-full rounded border border-surface-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-surface-900">
                        {gbp(l.quantity * l.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => removeLine(l.id)} className="text-surface-400 hover:text-danger-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={addLine}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-50"
            >
              <Plus className="h-4 w-4" /> Add line
            </button>

            <div className="mt-5 flex items-center justify-between border-t border-surface-200 pt-4">
              <span className="text-sm text-surface-500">Total</span>
              <span className="text-xl font-bold tabular-nums text-surface-900">{gbp(total)}</span>
            </div>

            <div className="mt-5">
              <label className="flex items-center justify-between text-sm font-medium text-surface-700">
                <span>Deposit to confirm: {form.depositPct}%</span>
                <span className="font-semibold tabular-nums text-brand-700">{gbp(depositAmount)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={form.depositPct}
                onChange={(e) => set("depositPct", Number(e.target.value))}
                className="mt-2 w-full accent-brand-600"
              />
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-surface-600">
              <input
                type="checkbox"
                checked={form.vatInclusive}
                onChange={(e) => set("vatInclusive", e.target.checked)}
                className="h-4 w-4 rounded border-surface-300 accent-brand-600"
              />
              Prices are inclusive of VAT unless stated otherwise
            </label>
          </Card>
        )}

        {step === 3 && (
          <Card title="Terms & introduction">
            <Field label="Introduction">
              <textarea
                rows={4}
                value={form.introText}
                onChange={(e) => set("introText", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Terms & conditions">
              <textarea
                rows={6}
                value={form.termsText}
                onChange={(e) => set("termsText", e.target.value)}
                className={inputCls}
              />
            </Field>
          </Card>
        )}

        {step === 4 && (
          <div className="rounded-xl border border-surface-200 bg-white p-8 shadow-card">
            <header className="flex items-start justify-between border-b border-surface-200 pb-5">
              <div>
                <p className="text-lg font-bold tracking-tight text-brand-700">Gala Dock</p>
              </div>
              {form.validUntil && (
                <p className="text-xs text-surface-500">Valid until {form.validUntil}</p>
              )}
            </header>
            <h2 className="mt-5 text-2xl font-bold text-surface-900">{form.title || "Untitled proposal"}</h2>
            <p className="mt-1 text-sm text-surface-500">Prepared for {form.clientName || "—"}</p>
            {form.introText && (
              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-surface-700">{form.introText}</p>
            )}
            <table className="mt-6 w-full overflow-hidden rounded-lg border border-surface-200 text-sm">
              <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-surface-500">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {lines.filter((l) => l.description.trim()).map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-surface-800">{l.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{gbp(l.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{gbp(l.quantity * l.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right font-medium text-surface-600">Total</td>
                  <td className="px-3 py-2 text-right text-base font-bold tabular-nums">{gbp(total)}</td>
                </tr>
              </tfoot>
            </table>
            {form.termsText && (
              <p className="mt-6 whitespace-pre-line text-xs leading-relaxed text-surface-600">{form.termsText}</p>
            )}
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 disabled:opacity-40 hover:bg-surface-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              disabled={(step === 1 && !detailsValid) || pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-brand-700"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => submit(false)}
                disabled={pending || !detailsValid}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 disabled:opacity-40 hover:bg-surface-50"
              >
                <Save className="h-4 w-4" /> Save as draft
              </button>
              <button
                onClick={() => submit(true)}
                disabled={pending || !detailsValid}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-brand-700"
              >
                <Send className="h-4 w-4" /> {pending ? "Saving…" : "Send to client"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-surface-700">
        {label} {required && <span className="text-danger-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-6 shadow-card">
      <h2 className="mb-5 text-base font-semibold text-surface-900">{title}</h2>
      {children}
    </div>
  );
}
