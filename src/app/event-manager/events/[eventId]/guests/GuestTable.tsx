"use client";

import { useState, useCallback } from "react";
import { Pencil, Check, X, Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { updateGuestField } from "./actions";

const RSVP_STYLES: Record<string, string> = {
  confirmed:  "bg-success-100 text-success-700 border-success-200",
  pending:    "bg-warning-100 text-warning-700 border-warning-200",
  declined:   "bg-danger-100 text-danger-700 border-danger-200",
  waitlisted: "bg-blue-100 text-blue-700 border-blue-200",
  attended:   "bg-success-100 text-success-700 border-success-200",
  no_show:    "bg-surface-100 text-surface-500 border-surface-200",
};

const GUEST_TYPE_COLORS: Record<string, string> = {
  vip:     "bg-amber-100 text-amber-700",
  speaker: "bg-violet-100 text-violet-700",
  sponsor: "bg-blue-100 text-blue-700",
  staff:   "bg-gray-100 text-gray-700",
  general: "bg-green-100 text-green-700",
  media:   "bg-pink-100 text-pink-700",
  press:   "bg-pink-100 text-pink-700",
  other:   "bg-surface-100 text-surface-600",
};

function guestTypeColor(t: string | null) {
  return GUEST_TYPE_COLORS[(t ?? "general").toLowerCase()] ?? "bg-surface-100 text-surface-600";
}

export interface Guest {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guest_type: string | null;
  rsvp_status: string | null;
  checked_in_at: string | null;
  dietary_notes: string | null;
  notes: string | null;
}

function GuestRow({ guest, eventId }: { guest: Guest; eventId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    first_name:    guest.first_name,
    last_name:     guest.last_name,
    email:         guest.email ?? "",
    phone:         guest.phone ?? "",
    rsvp_status:   guest.rsvp_status ?? "pending",
    guest_type:    guest.guest_type ?? "general",
    dietary_notes: guest.dietary_notes ?? "",
    notes:         guest.notes ?? "",
  });

  const openEdit = useCallback(() => {
    setDraft({
      first_name:    guest.first_name,
      last_name:     guest.last_name,
      email:         guest.email ?? "",
      phone:         guest.phone ?? "",
      rsvp_status:   guest.rsvp_status ?? "pending",
      guest_type:    guest.guest_type ?? "general",
      dietary_notes: guest.dietary_notes ?? "",
      notes:         guest.notes ?? "",
    });
    setError(null);
    setExpanded(true);
  }, [guest]);

  const cancel = useCallback(() => { setExpanded(false); setError(null); }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const fields = Object.entries(draft) as Array<[string, string]>;
    for (const [field, value] of fields) {
      const result = await updateGuestField(eventId, guest.id, field, value);
      if (result?.error) { setError(result.error); setSaving(false); return; }
    }
    setExpanded(false);
    setSaving(false);
  }, [draft, eventId, guest.id]);

  const rsvpSt = RSVP_STYLES[(guest.rsvp_status ?? "pending").toLowerCase()] ?? RSVP_STYLES.pending;
  const typeCls = guestTypeColor(guest.guest_type);
  const isCheckedIn = !!guest.checked_in_at;

  const inputCls = "w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-0.5";

  return (
    <>
      <tr className="hover:bg-surface-50 transition-colors group">
        <td className="px-5 py-3">
          <p className="font-medium text-surface-900">{[guest.first_name, guest.last_name].filter(Boolean).join(" ") || "—"}</p>
          {guest.email && <p className="text-[11px] text-surface-400">{guest.email}</p>}
          {guest.phone && <p className="text-[11px] text-surface-400">{guest.phone}</p>}
        </td>
        <td className="px-5 py-3">
          {guest.guest_type && (
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${typeCls}`}>
              {guest.guest_type}
            </span>
          )}
        </td>
        <td className="px-5 py-3">
          <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold capitalize ${rsvpSt}`}>
            {(guest.rsvp_status ?? "pending").replace(/_/g, " ")}
          </span>
        </td>
        <td className="px-5 py-3">
          {isCheckedIn ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Checked In
            </span>
          ) : (
            <span className="text-[11px] text-surface-400">—</span>
          )}
        </td>
        <td className="px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {guest.dietary_notes && (
              <span className="text-[10px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 font-medium">{guest.dietary_notes}</span>
            )}
            {guest.notes && (
              <span className="text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 font-medium">{guest.notes}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-right">
          <button
            onClick={expanded ? cancel : openEdit}
            aria-label="Edit guest"
            className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg px-2 py-1 text-[11px] text-surface-500 hover:bg-surface-100 hover:text-brand-600"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {expanded ? "Close" : "Edit"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-brand-50/40">
          <td colSpan={6} className="px-5 py-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 max-w-2xl">
              <div>
                <p className={labelCls}>First Name</p>
                <input className={inputCls} value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Last Name</p>
                <input className={inputCls} value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Email</p>
                <input type="email" className={inputCls} value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Phone</p>
                <input type="tel" className={inputCls} value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Guest Type</p>
                <select className={inputCls} value={draft.guest_type} onChange={(e) => setDraft((d) => ({ ...d, guest_type: e.target.value }))}>
                  {["vip","speaker","sponsor","staff","general","media","press","other"].map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className={labelCls}>RSVP Status</p>
                <select className={inputCls} value={draft.rsvp_status} onChange={(e) => setDraft((d) => ({ ...d, rsvp_status: e.target.value }))}>
                  {[
                    ["confirmed","Confirmed"],["pending","Pending"],["declined","Declined"],
                    ["waitlisted","Waitlisted"],["attended","Attended"],["no_show","No Show"],
                  ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <p className={labelCls}>Dietary Notes</p>
                <input className={inputCls} value={draft.dietary_notes} placeholder="e.g. Vegan, Nut allergy" onChange={(e) => setDraft((d) => ({ ...d, dietary_notes: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Notes</p>
                <input className={inputCls} value={draft.notes} placeholder="Internal notes" onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Changes
              </button>
              <button onClick={cancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50 disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface GuestTableProps {
  guests: Guest[];
  eventId: string;
}

export function GuestTable({ guests, eventId }: GuestTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-surface-100 bg-surface-50">
          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Guest</th>
          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Type</th>
          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">RSVP</th>
          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Check-in</th>
          <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Notes</th>
          <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500 w-20">Edit</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-100">
        {guests.map((g) => (
          <GuestRow key={g.id} guest={g} eventId={eventId} />
        ))}
      </tbody>
    </table>
  );
}
