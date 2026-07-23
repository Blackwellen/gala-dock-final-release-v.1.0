"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { createConversation } from "@/lib/messaging/actions";
import type { ConversationType } from "@/lib/messaging/types";

export interface EventOption {
  id: string;
  name: string;
}

const TYPE_OPTIONS: { value: ConversationType; label: string; requiresOrg: boolean }[] = [
  { value: "client_direct", label: "New client conversation", requiresOrg: true },
  { value: "supplier_direct", label: "New supplier conversation", requiresOrg: true },
  { value: "direct_internal", label: "New internal message", requiresOrg: false },
  { value: "group_internal", label: "New internal group", requiresOrg: false },
  { value: "internal_note_thread", label: "New internal note", requiresOrg: false },
];

export function NewMessageDialog({
  open,
  onClose,
  events,
  lockedEventId,
  lockedEventName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  events: EventOption[];
  lockedEventId?: string;
  lockedEventName?: string;
  /** When provided, called instead of navigating to the full Inbox — used by
   * the Event Profile Comms tab, which stays on-page after creating a
   * conversation rather than leaving the event. */
  onCreated?: (conversationId: string) => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<ConversationType>("client_direct");
  const [title, setTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [eventId, setEventId] = useState(lockedEventId ?? "");
  const [initialMessage, setInitialMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const config = TYPE_OPTIONS.find((t) => t.value === type)!;
  const isExternal = config.requiresOrg;

  function handleSubmit() {
    setError(null);
    if (!initialMessage.trim()) {
      setError("An opening message is required");
      return;
    }
    if (isExternal && !orgName.trim()) {
      setError(`${type === "client_direct" ? "Client" : "Supplier"} organisation name is required`);
      return;
    }

    startTransition(async () => {
      try {
        const { conversationId } = await createConversation({
          type,
          title: title.trim() || undefined,
          externalOrgName: isExternal ? orgName.trim() : undefined,
          eventId: eventId || undefined,
          participants: isExternal
            ? [
                {
                  externalContactName: participantName.trim() || orgName.trim(),
                  externalContactEmail: participantEmail.trim() || undefined,
                  kind: type === "client_direct" ? "client" : "supplier",
                },
              ]
            : [],
          initialMessage: initialMessage.trim(),
        });
        onClose();
        if (onCreated) onCreated(conversationId);
        else router.push(`/event-manager/inbox?conversation=${conversationId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create conversation");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-surface-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-surface-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900">New Message</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Conversation type</label>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                    type === opt.value
                      ? "bg-brand-50 text-brand-700 border-brand-200"
                      : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {type === "group_internal" && (
            <Field label="Group name" value={title} onChange={setTitle} placeholder="e.g. Stage & AV Alignment" />
          )}

          {isExternal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label={type === "client_direct" ? "Client organisation" : "Supplier organisation"}
                value={orgName}
                onChange={setOrgName}
                placeholder="e.g. Skyline Events Inc."
              />
              <Field label="Contact name" value={participantName} onChange={setParticipantName} placeholder="e.g. Sarah Chandler" />
              <Field label="Contact email (optional)" value={participantEmail} onChange={setParticipantEmail} type="email" placeholder="name@example.com" />
            </div>
          )}

          {lockedEventId ? (
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Linked event</label>
              <div className="px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-sm text-surface-700">
                {lockedEventName ?? "This event"}
              </div>
            </div>
          ) : events.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Link to event (optional)</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
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
          )}

          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">
              {type === "internal_note_thread" ? "Note" : "Opening message"}
            </label>
            <textarea
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              rows={4}
              placeholder="Write your message…"
              className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
            />
          </div>

          {error && <p className="text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium shadow-sm"
          >
            <Send className="w-4 h-4" />
            {pending ? "Creating…" : "Start Conversation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-600 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-surface-200 bg-white text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
