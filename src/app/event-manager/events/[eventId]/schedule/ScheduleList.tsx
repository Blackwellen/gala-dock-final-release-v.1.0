"use client";

import { useState, useCallback } from "react";
import { Pencil, Check, X, Loader2, Clock, ChevronRight } from "lucide-react";
import { updateRunSheetItem } from "./actions";

const LANE_COLORS: Record<string, string> = {
  tech:     "bg-blue-100 text-blue-700 border-blue-200",
  foh:      "bg-green-100 text-green-700 border-green-200",
  talent:   "bg-violet-100 text-violet-700 border-violet-200",
  comms:    "bg-amber-100 text-amber-700 border-amber-200",
  security: "bg-red-100 text-red-700 border-red-200",
  catering: "bg-orange-100 text-orange-700 border-orange-200",
  other:    "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function laneColor(lane: string | null) {
  return LANE_COLORS[(lane ?? "other").toLowerCase()] ?? LANE_COLORS.other;
}

function fmtTime(ts: string | null | undefined) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export interface RunItem {
  id: string;
  title: string | null;
  lane: string | null;
  section: string | null;
  starts_at: string | null;
  notes: string | null;
  position: number | null;
}

function ScheduleRow({ item, eventId }: { item: RunItem; eventId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title:     item.title ?? "",
    lane:      item.lane ?? "other",
    notes:     item.notes ?? "",
    starts_at: item.starts_at ? String(item.starts_at).slice(0, 16) : "",
  });

  const openEdit = useCallback(() => {
    setDraft({
      title:     item.title ?? "",
      lane:      item.lane ?? "other",
      notes:     item.notes ?? "",
      starts_at: item.starts_at ? String(item.starts_at).slice(0, 16) : "",
    });
    setError(null);
    setEditing(true);
  }, [item]);

  const cancel = useCallback(() => { setEditing(false); setError(null); }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    for (const [field, value] of Object.entries(draft) as Array<[string, string]>) {
      const result = await updateRunSheetItem(eventId, item.id, field, value);
      if (result?.error) { setError(result.error); setSaving(false); return; }
    }
    setEditing(false);
    setSaving(false);
  }, [draft, eventId, item.id]);

  if (editing) {
    const inputCls = "w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";
    const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-0.5";
    return (
      <div className="border-b border-brand-200 bg-brand-50/40 px-5 py-3.5">
        <div className="grid grid-cols-4 gap-4 max-w-3xl">
          <div className="col-span-2">
            <p className={labelCls}>Title</p>
            <input className={inputCls} value={draft.title} placeholder="Item title…" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Lane</p>
            <select className={inputCls} value={draft.lane} onChange={(e) => setDraft((d) => ({ ...d, lane: e.target.value }))}>
              {[
                ["tech","Tech"],["foh","FOH"],["talent","Talent"],
                ["comms","Comms"],["security","Security"],["catering","Catering"],["other","Other"],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Start Time</p>
            <input type="datetime-local" className={inputCls} value={draft.starts_at} onChange={(e) => setDraft((d) => ({ ...d, starts_at: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <p className={labelCls}>Notes</p>
            <textarea className={inputCls + " resize-none"} rows={1} value={draft.notes} placeholder="Notes for this schedule item…" onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
          </div>
        </div>
        {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
          <button onClick={cancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-50">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 px-5 py-3.5 hover:bg-surface-50 transition-colors group border-b border-surface-100 last:border-0">
      <div className="w-14 shrink-0 pt-0.5">
        <span className="text-sm font-mono font-semibold text-surface-700">{fmtTime(item.starts_at)}</span>
      </div>
      <div className="w-28 shrink-0 pt-0.5">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${laneColor(item.lane)}`}>
          {(item.lane ?? "other").toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-900">{item.title ?? "Untitled item"}</p>
        {item.notes && (
          <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{item.notes}</p>
        )}
      </div>
      <button
        onClick={openEdit}
        aria-label="Edit schedule item"
        className="opacity-0 group-hover:opacity-100 transition-opacity flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-100 text-surface-400 hover:text-brand-600 shrink-0 mt-0.5"
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>
      <ChevronRight className="h-4 w-4 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
    </div>
  );
}

interface ScheduleListProps {
  runItems: RunItem[];
  eventId: string;
}

export function ScheduleList({ runItems, eventId }: ScheduleListProps) {
  const sections = new Map<string, RunItem[]>();
  for (const item of runItems) {
    const sec = item.section ?? "General";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(item);
  }

  return (
    <div className="space-y-5">
      {[...sections.entries()].map(([section, secItems]) => (
        <div key={section} className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
          <div className="px-5 py-3.5 bg-surface-50 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-900">{section}</h3>
          </div>
          <div>
            {secItems.map((item) => (
              <ScheduleRow key={item.id} item={item} eventId={eventId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
