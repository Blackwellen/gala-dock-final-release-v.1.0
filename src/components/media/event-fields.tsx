"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Clock, Globe, Link2, Mail, MapPin, Building2, Phone, PoundSterling, Sparkles, Store, Ticket, Type } from "lucide-react";
import "@/styles/event-fields.css";
import { FIELD_LABELS, PLACEHOLDERS, PLACEHOLDER_DEFAULTS, fromFriendly, toFriendly, type EventData } from "@/lib/media/document";

/**
 * Event details in plain English for Media Studio. Customers never see {{braces}}: fields show "[Event name]" and an
 * "Insert event detail" menu lists each detail with its live value. Stored text keeps the canonical {{event.*}} tokens.
 */
type Key = (typeof PLACEHOLDERS)[number];
const ICON: Record<Key, typeof Type> = { "event.name": Sparkles, "event.date": CalendarDays, "event.time": Clock, "event.venue_name": Building2, "event.city": MapPin,
  "event.public_url": Link2, "ticket.starting_price": PoundSterling, "organizer.name": Ticket,
  "business.name": Store, "business.location": MapPin, "business.price_from": PoundSterling, "business.website": Globe, "business.email": Mail, "business.phone": Phone };
export const FIELD_HELP: Record<Key, string> = { "event.name": "Your event’s title", "event.date": "e.g. Sat 21 June 2026", "event.time": "When doors open", "event.venue_name": "Where it’s happening",
  "event.city": "Town or city", "event.public_url": "Link to buy tickets", "ticket.starting_price": "Cheapest ticket, e.g. £25.00", "organizer.name": "Your company or name",
  "business.name": "Your venue or business", "business.location": "Where you’re based", "business.price_from": "e.g. From £450", "business.website": "Your Gala Dock page", "business.email": "Enquiries email", "business.phone": "Enquiries phone" };
export const fieldPreview = (k: Key, data: EventData) => data[k] || PLACEHOLDER_DEFAULTS[k] || "";

/** Dropdown listing every event detail with its current value; calls onPick with the canonical key. */
export function InsertField({ data, onPick, label = "Insert event detail", only, keepFocus = false, open: openProp, onOpenChange }: { data: EventData; onPick: (key: Key) => void; label?: string; only?: Key[];
  /** Don't take focus from the text being typed (canvas editing): the caret stays put and the pick is inserted there. */
  keepFocus?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [openState, setOpenState] = useState(false), ref = useRef<HTMLDivElement>(null);
  const open = openProp ?? openState, setOpen = (v: boolean | ((o: boolean) => boolean)) => { const n = typeof v === "function" ? v(open) : v; setOpenState(n); onOpenChange?.(n); };
  const hold = keepFocus ? { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() } : {};
  useEffect(() => { if (!open) return; const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", k); return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", k); }; }, [open]);
  const keys = (only ?? PLACEHOLDERS) as readonly Key[];
  return <div className="ef" ref={ref}>
    <button type="button" className="ef-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} {...hold}><Sparkles size={14} aria-hidden="true" />{label}<ChevronDown size={14} aria-hidden="true" /></button>
    {open && <div className="ef-menu" role="menu" aria-label={label}>

      {keys.map(k => { const I = ICON[k]; return <button key={k} type="button" role="menuitem" onClick={() => { onPick(k); setOpen(false); }} {...hold}>
        <I size={15} aria-hidden="true" /><span><b>{FIELD_LABELS[k]}</b><small>{fieldPreview(k, data)}</small></span></button>; })}
    </div>}
  </div>;
}

/** Textarea/input that shows [Event name] style tokens and saves {{event.name}}; includes the insert dropdown (inserts at the cursor). */
export function FriendlyField({ value, onChange, data, multiline = false, rows = 3, maxLength = 1000, label, only }: { value: string; onChange: (v: string) => void; data: EventData; multiline?: boolean; rows?: number; maxLength?: number; label: string; only?: Key[] }) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [text, setText] = useState(() => toFriendly(value)), last = useRef(value);
  // Follow external changes (another layer selected, canvas edit, undo).
  useEffect(() => { if (value !== last.current) { last.current = value; queueMicrotask(() => setText(toFriendly(value))); } }, [value]);
  const commit = (t: string) => { setText(t); const v = fromFriendly(t).slice(0, maxLength); last.current = v; onChange(v); };
  const insert = (k: Key) => {
    const el = ref.current, token = `[${FIELD_LABELS[k]}]`, s = el?.selectionStart ?? text.length, e = el?.selectionEnd ?? text.length;
    const next = text.slice(0, s) + token + text.slice(e); commit(next);
    queueMicrotask(() => { el?.focus(); el?.setSelectionRange(s + token.length, s + token.length); });
  };
  const known = Object.values(FIELD_LABELS).filter(l => text.includes(`[${l}]`));
  return <div className="ef-field">
    <div className="ef-head"><span>{label}</span><InsertField data={data} onPick={insert} only={only} label="Insert detail" /></div>
    {multiline ? <textarea ref={ref} rows={rows} value={text} onChange={e => commit(e.target.value)} aria-label={label} /> : <input ref={ref} value={text} onChange={e => commit(e.target.value)} aria-label={label} />}
    {known.length > 0 && <p className="ef-hint">Words in [brackets] fill in from your event — e.g. {known.slice(0, 2).map(l => `[${l}] → ${fieldPreview((Object.entries(FIELD_LABELS).find(([, v]) => v === l)![0]) as Key, data)}`).join(", ")}.</p>}
  </div>;
}

/** Grid of one-click "add this detail" buttons (adds a new text layer linked to the event). */
export function EventFieldButtons({ data, onAdd }: { data: EventData; onAdd: (key: Key) => void }) {
  return <ul className="ef-grid">{PLACEHOLDERS.map(k => { const I = ICON[k]; return <li key={k}><button type="button" onClick={() => onAdd(k)} title={FIELD_HELP[k]}>
    <I size={16} aria-hidden="true" /><span><b>{FIELD_LABELS[k]}</b><small>{fieldPreview(k, data)}</small></span></button></li>; })}</ul>;
}
