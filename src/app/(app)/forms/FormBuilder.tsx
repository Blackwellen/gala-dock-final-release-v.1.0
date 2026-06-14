"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Type,
  AlignLeft,
  ChevronDownSquare,
  ListChecks,
  Calendar,
  Hash,
  Upload,
  Heading,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Plus,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import type { FieldType, FormType } from "@/lib/supabase/types";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  FORM_TYPES,
  FORM_TYPE_LABELS,
  needsOptions,
} from "./lib";
import { createForm, updateForm } from "./actions";

const FIELD_ICONS: Record<FieldType, typeof Type> = {
  "short-text": Type,
  "long-text": AlignLeft,
  select: ChevronDownSquare,
  "multi-select": ListChecks,
  date: Calendar,
  number: Hash,
  "file-upload": Upload,
  "section-header": Heading,
};

interface BuilderField {
  key: string; // local React key
  id?: string; // db id when editing
  field_type: FieldType;
  label: string;
  placeholder: string;
  options: string[];
  required: boolean;
}

export interface FormBuilderInitial {
  id?: string;
  title: string;
  description: string;
  formType: FormType;
  eventId: string | null;
  fields: BuilderField[];
  isPublished: boolean;
}

export interface EventOption {
  id: string;
  name: string;
}

let keySeq = 0;
function newKey() {
  keySeq += 1;
  return `f_${Date.now()}_${keySeq}`;
}

function blankField(type: FieldType): BuilderField {
  return {
    key: newKey(),
    field_type: type,
    label: FIELD_TYPE_LABELS[type],
    placeholder: "",
    options: needsOptions(type) ? ["Option 1", "Option 2"] : [],
    required: false,
  };
}

export function FormBuilder({
  initial,
  events,
}: {
  initial?: FormBuilderInitial;
  events: EventOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [formType, setFormType] = useState<FormType>(initial?.formType ?? "custom");
  const [eventId, setEventId] = useState<string>(initial?.eventId ?? "");
  const [fields, setFields] = useState<BuilderField[]>(initial?.fields ?? []);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);

  const isEdit = Boolean(initial?.id);

  function addField(type: FieldType) {
    const f = blankField(type);
    setFields((prev) => [...prev, f]);
    setEditingKey(f.key);
  }

  function updateField(key: string, patch: Partial<BuilderField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f.key !== key));
    setEditingKey((k) => (k === key ? null : k));
  }

  function move(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function onDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
  }

  function submit(publish: boolean) {
    if (!title.trim()) {
      setError("Please give your form a title.");
      return;
    }
    setError(null);
    const payload = fields.map((f) => ({
      id: f.id,
      field_type: f.field_type,
      label: f.label,
      placeholder: f.placeholder || null,
      options: f.options,
      required: f.required,
    }));
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("description", description.trim());
    fd.set("form_type", formType);
    if (eventId) fd.set("event_id", eventId);
    fd.set("fields", JSON.stringify(payload));
    fd.set("publish", publish ? "true" : "false");

    startTransition(async () => {
      try {
        if (isEdit && initial?.id) {
          await updateForm(initial.id, fd);
        } else {
          await createForm(fd);
        }
      } catch (e) {
        // redirect() throws NEXT_REDIRECT — let it bubble so navigation happens.
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        if (
          typeof e === "object" &&
          e !== null &&
          "digest" in e &&
          String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
        ) {
          throw e;
        }
        setError(e instanceof Error ? e.message : "Failed to save form.");
      }
    });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={isEdit ? "Edit Form" : "New Form"}
        description="Add fields from the palette, then publish to get a shareable link."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(isEdit && initial?.id ? `/forms/${initial.id}` : "/forms")}
              className="px-3.5 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(false)}
              className="px-3.5 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(true)}
              className="px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {initial?.isPublished ? "Save & Publish" : "Publish"}
            </button>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Field palette */}
        <aside className="space-y-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
              Add a field
            </h3>
            <div className="grid grid-cols-1 gap-1.5">
              {FIELD_TYPES.map((t) => {
                const Icon = FIELD_ICONS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addField(t)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-surface-700 border border-surface-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-surface-400 shrink-0" />
                    {FIELD_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Form settings
            </h3>
            <label className="block">
              <span className="text-xs font-medium text-surface-600">Form Type</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as FormType)}
                className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                {FORM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FORM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {(formType === "rsvp" || formType === "enquiry") && events.length > 0 && (
              <label className="block">
                <span className="text-xs font-medium text-surface-600">Link to Event</span>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  <option value="">No event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <section className="space-y-4">
          {error && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled form"
              className="w-full text-xl font-semibold text-surface-900 placeholder:text-surface-300 focus:outline-none"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a short description (optional)"
              className="mt-2 w-full text-sm text-surface-600 placeholder:text-surface-300 focus:outline-none"
            />
          </div>

          {fields.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-surface-300 p-10 text-center text-sm text-surface-500">
              Add fields from the palette on the left to start building your form.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((f, i) => {
                const Icon = FIELD_ICONS[f.field_type];
                const editing = editingKey === f.key;
                return (
                  <div
                    key={f.key}
                    draggable
                    onDragStart={() => (dragIndex.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    className="bg-white rounded-xl border border-surface-200 shadow-card"
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <GripVertical className="w-4 h-4 text-surface-300 cursor-grab shrink-0" />
                      <Icon className="w-4 h-4 text-surface-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-surface-900 truncate">
                          {f.label || FIELD_TYPE_LABELS[f.field_type]}
                          {f.required && f.field_type !== "section-header" && (
                            <span className="text-danger-500 ml-0.5">*</span>
                          )}
                        </p>
                        <p className="text-xs text-surface-400">
                          {FIELD_TYPE_LABELS[f.field_type]}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="p-1.5 rounded-md hover:bg-surface-100 text-surface-500 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === fields.length - 1}
                          className="p-1.5 rounded-md hover:bg-surface-100 text-surface-500 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKey(editing ? null : f.key)}
                          className="px-2 py-1 rounded-md hover:bg-surface-100 text-xs font-medium text-surface-600"
                        >
                          {editing ? "Done" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeField(f.key)}
                          className="p-1.5 rounded-md hover:bg-danger-50 text-danger-500"
                          aria-label="Delete field"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {editing && (
                      <div className="border-t border-surface-100 px-4 py-4 space-y-3 bg-surface-50/60">
                        <label className="block">
                          <span className="text-xs font-medium text-surface-600">Label</span>
                          <input
                            value={f.label}
                            onChange={(e) => updateField(f.key, { label: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                          />
                        </label>

                        {f.field_type !== "section-header" && (
                          <label className="block">
                            <span className="text-xs font-medium text-surface-600">
                              Placeholder
                            </span>
                            <input
                              value={f.placeholder}
                              onChange={(e) =>
                                updateField(f.key, { placeholder: e.target.value })
                              }
                              className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                            />
                          </label>
                        )}

                        {needsOptions(f.field_type) && (
                          <div>
                            <span className="text-xs font-medium text-surface-600">Options</span>
                            <div className="mt-1 space-y-2">
                              {f.options.map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <input
                                    value={opt}
                                    onChange={(e) => {
                                      const next = [...f.options];
                                      next[oi] = e.target.value;
                                      updateField(f.key, { options: next });
                                    }}
                                    className="flex-1 rounded-lg border border-surface-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateField(f.key, {
                                        options: f.options.filter((_, x) => x !== oi),
                                      })
                                    }
                                    className="p-1.5 rounded-md hover:bg-danger-50 text-danger-500"
                                    aria-label="Remove option"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  updateField(f.key, {
                                    options: [...f.options, `Option ${f.options.length + 1}`],
                                  })
                                }
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add option
                              </button>
                            </div>
                          </div>
                        )}

                        {f.field_type !== "section-header" && (
                          <label className="flex items-center gap-2 text-sm text-surface-700">
                            <input
                              type="checkbox"
                              checked={f.required}
                              onChange={(e) =>
                                updateField(f.key, { required: e.target.checked })
                              }
                              className="rounded border-surface-300 text-brand-600 focus:ring-brand-200"
                            />
                            Required field
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
