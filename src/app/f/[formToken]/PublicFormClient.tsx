"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import type { FieldType } from "@/lib/supabase/types";
import { submitPublicForm } from "../actions";

export interface PublicField {
  id: string;
  label: string;
  fieldType: FieldType;
  placeholder: string | null;
  options: string[];
  required: boolean;
}

const inputBase =
  "mt-1.5 w-full rounded-lg border border-surface-200 px-3.5 py-2.5 text-sm text-surface-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300";

export function PublicFormClient({
  shareToken,
  workspaceName,
  title,
  description,
  fields,
}: {
  shareToken: string;
  workspaceName: string;
  title: string;
  description: string | null;
  fields: PublicField[];
}) {
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function setValue(id: string, v: string | string[]) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  function toggleMulti(id: string, option: string, checked: boolean) {
    setValues((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = checked
        ? [...current, option]
        : current.filter((o) => o !== option);
      return { ...prev, [id]: next };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side required check for fast feedback.
    for (const f of fields) {
      if (f.fieldType === "section-header" || !f.required) continue;
      const v = values[f.id];
      const empty =
        v === undefined ||
        (typeof v === "string" && v.trim() === "") ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        setError(`"${f.label}" is required.`);
        return;
      }
    }

    // Merge file field display names into the submitted payload.
    const payload: Record<string, string | string[]> = { ...values };
    for (const [id, name] of Object.entries(files)) {
      if (name) payload[id] = name;
    }

    startTransition(async () => {
      const result = await submitPublicForm(shareToken, payload);
      if (result.ok) {
        setDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  if (done) {
    return (
      <main className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card max-w-md w-full p-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-success-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-success-600" strokeWidth={1.8} />
          </div>
          <h1 className="text-lg font-semibold text-surface-900">Thank you!</h1>
          <p className="mt-2 text-sm text-surface-500">
            Your submission has been received. {workspaceName} will be in touch if needed.
          </p>
          <p className="mt-8 text-xs text-surface-400">Powered by Gala Dock</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <p className="text-sm font-semibold text-surface-500 mb-4">{workspaceName}</p>
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-surface-200 shadow-card p-6 sm:p-8 space-y-5"
        >
          <header>
            <h1 className="text-xl font-semibold text-surface-900">{title}</h1>
            {description && <p className="mt-1.5 text-sm text-surface-500">{description}</p>}
          </header>

          {fields.map((f) => {
            if (f.fieldType === "section-header") {
              return (
                <div key={f.id} className="pt-2">
                  <h2 className="text-sm font-semibold text-surface-900 border-b border-surface-100 pb-2">
                    {f.label}
                  </h2>
                </div>
              );
            }

            const labelEl = (
              <span className="text-sm font-medium text-surface-700">
                {f.label}
                {f.required && <span className="text-danger-500 ml-0.5">*</span>}
              </span>
            );

            return (
              <div key={f.id}>
                {f.fieldType === "short-text" && (
                  <label className="block">
                    {labelEl}
                    <input
                      type="text"
                      placeholder={f.placeholder ?? ""}
                      value={(values[f.id] as string) ?? ""}
                      onChange={(e) => setValue(f.id, e.target.value)}
                      className={inputBase}
                    />
                  </label>
                )}

                {f.fieldType === "long-text" && (
                  <label className="block">
                    {labelEl}
                    <textarea
                      rows={4}
                      placeholder={f.placeholder ?? ""}
                      value={(values[f.id] as string) ?? ""}
                      onChange={(e) => setValue(f.id, e.target.value)}
                      className={inputBase}
                    />
                  </label>
                )}

                {f.fieldType === "number" && (
                  <label className="block">
                    {labelEl}
                    <input
                      type="number"
                      placeholder={f.placeholder ?? ""}
                      value={(values[f.id] as string) ?? ""}
                      onChange={(e) => setValue(f.id, e.target.value)}
                      className={inputBase}
                    />
                  </label>
                )}

                {f.fieldType === "date" && (
                  <label className="block">
                    {labelEl}
                    <input
                      type="date"
                      value={(values[f.id] as string) ?? ""}
                      onChange={(e) => setValue(f.id, e.target.value)}
                      className={inputBase}
                    />
                  </label>
                )}

                {f.fieldType === "select" && (
                  <label className="block">
                    {labelEl}
                    <select
                      value={(values[f.id] as string) ?? ""}
                      onChange={(e) => setValue(f.id, e.target.value)}
                      className={inputBase}
                    >
                      <option value="">{f.placeholder || "Select an option"}</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {f.fieldType === "multi-select" && (
                  <fieldset>
                    {labelEl}
                    <div className="mt-2 space-y-2">
                      {f.options.map((o) => {
                        const arr = Array.isArray(values[f.id])
                          ? (values[f.id] as string[])
                          : [];
                        return (
                          <label key={o} className="flex items-center gap-2 text-sm text-surface-700">
                            <input
                              type="checkbox"
                              checked={arr.includes(o)}
                              onChange={(e) => toggleMulti(f.id, o, e.target.checked)}
                              className="rounded border-surface-300 text-brand-600 focus:ring-brand-200"
                            />
                            {o}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {f.fieldType === "file-upload" && (
                  <div>
                    {labelEl}
                    <label className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-dashed border-surface-300 px-3.5 py-3 text-sm text-surface-500 cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                      <Upload className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {files[f.id] || "Choose a file to upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) =>
                          setFiles((prev) => ({
                            ...prev,
                            [f.id]: e.target.files?.[0]?.name ?? "",
                          }))
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-brand-600 text-white text-sm font-semibold py-3 hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {isPending ? "Submitting…" : "Submit"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-surface-400">Powered by Gala Dock</p>
      </div>
    </main>
  );
}
