"use client";

import { useState, useTransition } from "react";
import { X, Paperclip, Send, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommType } from "@/lib/supabase/types";
import { COMM_TYPE_META, LOGGABLE_TYPES, LOCKED_TYPES } from "./inbox-utils";
import { logCommunication } from "./actions";

export interface EventOption {
  id: string;
  name: string;
}

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set, the message is appended to an existing thread (reply mode). */
  threadId?: string;
  /** Pre-selected and locked event (e.g. opened from an event Comms tab). */
  lockedEventId?: string;
  lockedEventName?: string;
  events?: EventOption[];
  title?: string;
}

export function ComposeDialog({
  open,
  onClose,
  threadId,
  lockedEventId,
  lockedEventName,
  events = [],
  title,
}: ComposeDialogProps) {
  const [commType, setCommType] = useState<CommType>("email");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);

  if (!open) return null;

  const isNote = commType === "note";
  const isReply = Boolean(threadId);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await logCommunication(formData);
        onClose();
      } catch (e) {
        // redirect() throws a NEXT_REDIRECT error we must let bubble up.
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        const msg = (e as { digest?: string })?.digest;
        if (typeof msg === "string" && msg.startsWith("NEXT_REDIRECT")) throw e;
        setError(e instanceof Error ? e.message : "Failed to log message");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-surface-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-surface-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900">
            {title ?? (isReply ? "Reply in thread" : "Log a communication")}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {threadId && <input type="hidden" name="thread_id" value={threadId} />}
          {lockedEventId && <input type="hidden" name="event_id" value={lockedEventId} />}
          <input type="hidden" name="comm_type" value={commType} />
          <input type="hidden" name="direction" value={isNote ? "internal" : "outbound"} />

          {/* Activity-log notice */}
          <div className="flex items-start gap-2 rounded-lg bg-info-50 border border-info-200 px-3 py-2 text-xs text-info-700">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              This is an in-app activity log. Logging a message records it here — it does not send a
              live email or message in V1.
            </span>
          </div>

          {/* Comm type selector */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {LOGGABLE_TYPES.map((t) => {
                const meta = COMM_TYPE_META[t];
                const Icon = meta.icon;
                const active = commType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCommType(t)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700 border-brand-200"
                        : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {meta.label}
                  </button>
                );
              })}
              {LOCKED_TYPES.map((t) => {
                const meta = COMM_TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <span
                    key={t}
                    title="Coming in a future release"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-surface-200 bg-surface-50 text-surface-400 cursor-not-allowed"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {meta.label}
                    <Lock className="w-3 h-3" />
                  </span>
                );
              })}
            </div>
            {isNote && (
              <p className="mt-1.5 text-xs text-warning-600">
                Internal notes are visible to your team only.
              </p>
            )}
          </div>

          {/* Participant + event fields (hidden for pure internal notes) */}
          {!isNote && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field name="participant_name" label="Participant name" placeholder="e.g. Sarah Carter" />
              {commType === "call" ? (
                <Field name="participant_phone" label="Phone" type="tel" placeholder="07700 900000" />
              ) : (
                <Field name="participant_email" label="Email" type="email" placeholder="name@example.com" />
              )}
            </div>
          )}

          {!isNote && (
            <Field name="subject" label="Subject" placeholder="e.g. Catering quote request" />
          )}

          {/* Event link */}
          {lockedEventId ? (
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Linked event</label>
              <div className="px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-sm text-surface-700">
                {lockedEventName ?? "This event"}
              </div>
            </div>
          ) : (
            events.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1.5">
                  Link to event (optional)
                </label>
                <select
                  name="event_id"
                  defaultValue=""
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">No event</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          )}

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">
              {isNote ? "Note" : "Message"}
            </label>
            <textarea
              name="body"
              required
              rows={5}
              placeholder={isNote ? "Write an internal note…" : "Write a message to log…"}
              className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
            />
          </div>

          {/* Attachments — upload only, no URL fields */}
          <div>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-surface-300 text-sm text-surface-600 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
              <Paperclip className="w-4 h-4" />
              Attach files
              <input
                type="file"
                name="attachments"
                multiple
                className="hidden"
                onChange={(e) =>
                  setFiles(Array.from(e.target.files ?? []).map((f) => f.name))
                }
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f}-${i}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-100 text-xs text-surface-600"
                  >
                    <Paperclip className="w-3 h-3" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              {pending ? "Logging…" : isNote ? "Save Note" : "Log Message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
