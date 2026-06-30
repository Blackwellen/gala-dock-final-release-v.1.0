"use client";

import { useState, useRef, useCallback } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

type FieldType = "text" | "textarea" | "email" | "tel" | "number" | "date" | "datetime-local" | "select";

interface InlineEditFieldProps {
  /** Display label (shown in row header) */
  label?: string;
  /** Current value to display and edit */
  value: string | number | null | undefined;
  /** Placeholder when empty */
  placeholder?: string;
  /** HTML input type */
  type?: FieldType;
  /** Options for select type */
  options?: { label: string; value: string }[];
  /** Called when user saves — receives the new string value */
  onSave: (value: string) => Promise<{ error?: string }>;
  /** Tailwind classes for the displayed value text */
  valueClassName?: string;
  /** If true, renders as a standalone block (not a dl row) */
  block?: boolean;
  /** Multi-line display rows for textarea */
  rows?: number;
  /** Prefix shown before the value (e.g. "£") */
  prefix?: string;
  /** Suffix shown after the value (e.g. " days") */
  suffix?: string;
}

function fmt(value: string | number | null | undefined, prefix?: string, suffix?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${prefix ?? ""}${value}${suffix ?? ""}`;
}

export function InlineEditField({
  label,
  value,
  placeholder = "Click to edit…",
  type = "text",
  options,
  onSave,
  valueClassName = "text-sm text-surface-900",
  block = false,
  rows = 3,
  prefix,
  suffix,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value != null ? String(value) : "");
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(draft);
      if (result?.error) {
        setError(result.error);
        setSaving(false);
      } else {
        setEditing(false);
        setSaving(false);
      }
    } catch {
      setError("Save failed. Please try again.");
      setSaving(false);
    }
  }, [draft, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter" && type !== "textarea") { e.preventDefault(); save(); }
  }, [cancel, save, type]);

  const sharedInputCls =
    "w-full rounded-lg border border-brand-400 bg-white px-3 py-1.5 text-sm text-surface-900 " +
    "placeholder-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm";

  if (!editing) {
    return (
      <div className={`group relative ${block ? "" : "flex items-start gap-3 py-3 border-b border-surface-100 last:border-0"}`}>
        {label && !block && (
          <dt className="w-48 shrink-0 text-xs font-semibold text-surface-500 pt-0.5">{label}</dt>
        )}
        {label && block && (
          <p className="text-xs font-semibold text-surface-500 mb-1">{label}</p>
        )}
        <div className={`flex items-start gap-2 ${block ? "w-full" : "flex-1 min-w-0"}`}>
          <span className={`flex-1 min-w-0 ${valueClassName} ${!value ? "text-surface-300 italic" : ""}`}>
            {value != null && value !== "" ? fmt(value, prefix, suffix) : placeholder}
          </span>
          <button
            onClick={startEdit}
            aria-label={`Edit ${label ?? "field"}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-100 text-surface-400 hover:text-brand-600 shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${block ? "" : "flex items-start gap-3 py-3 border-b border-surface-100 last:border-0"}`}>
      {label && !block && (
        <dt className="w-48 shrink-0 text-xs font-semibold text-surface-500 pt-0.5">{label}</dt>
      )}
      {label && block && (
        <p className="text-xs font-semibold text-surface-500 mb-1">{label}</p>
      )}
      <div className={`${block ? "w-full" : "flex-1 min-w-0"} space-y-1.5`}>
        {type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className={sharedInputCls + " resize-none"}
            value={draft}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : type === "select" ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className={sharedInputCls}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          >
            <option value="">— Select —</option>
            {options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            className={sharedInputCls}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {error && <p className="text-xs text-danger-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
