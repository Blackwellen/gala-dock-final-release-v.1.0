import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, Users, CheckCircle2, Clock, XCircle, Download, Upload, Search } from "lucide-react";
// CheckCircle2, Clock, XCircle used in KPI icons above; RSVP_STYLES/guestTypeColor kept for server-side KPI calculations
import { GuestTable } from "./GuestTable";

export const dynamic = "force-dynamic";

const RSVP_STYLES: Record<string, string> = {
  confirmed:   "bg-success-100 text-success-700 border-success-200",
  pending:     "bg-warning-100 text-warning-700 border-warning-200",
  declined:    "bg-danger-100 text-danger-700 border-danger-200",
  waitlisted:  "bg-blue-100 text-blue-700 border-blue-200",
  attended:    "bg-success-100 text-success-700 border-success-200",
  no_show:     "bg-surface-100 text-surface-500 border-surface-200",
};

const GUEST_TYPE_COLORS: Record<string, string> = {
  vip:      "bg-amber-100 text-amber-700",
  speaker:  "bg-violet-100 text-violet-700",
  sponsor:  "bg-blue-100 text-blue-700",
  staff:    "bg-gray-100 text-gray-700",
  general:  "bg-green-100 text-green-700",
  media:    "bg-pink-100 text-pink-700",
  press:    "bg-pink-100 text-pink-700",
  other:    "bg-surface-100 text-surface-600",
};

function guestTypeColor(t: string | null) {
  return GUEST_TYPE_COLORS[(t ?? "general").toLowerCase()] ?? "bg-surface-100 text-surface-600";
}

interface Guest {
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

export default async function GuestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, guest_count_day")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: guestData, count: total } = await supabase
    .from("event_guests")
    .select(
      "id, first_name, last_name, email, phone, guest_type, rsvp_status, checked_in_at, dietary_notes, notes",
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(50);

  const guests = (guestData ?? []) as Guest[];

  const confirmed    = guests.filter((g) => g.rsvp_status === "confirmed").length;
  const pending      = guests.filter((g) => !g.rsvp_status || g.rsvp_status === "pending").length;
  const declined     = guests.filter((g) => g.rsvp_status === "declined").length;
  const checkedIn    = guests.filter((g) => !!g.checked_in_at).length;
  const vip          = guests.filter((g) => (g.guest_type ?? "").toLowerCase() === "vip").length;

  const kpis = [
    { label: "Total Invited",  value: (total ?? 0).toLocaleString("en-GB"), sub: `${event.guest_count_day ?? "—"} capacity`, icon: Users,         color: "text-brand-600",   bg: "bg-brand-50" },
    { label: "Confirmed",      value: confirmed.toLocaleString("en-GB"),    sub: total ? `${Math.round((confirmed / (total ?? 1)) * 100)}% of invited` : "0%", icon: CheckCircle2, color: "text-success-600", bg: "bg-success-50" },
    { label: "Pending",        value: pending.toLocaleString("en-GB"),      sub: `${total ? Math.round((pending / (total ?? 1)) * 100) : 0}% of invited`,    icon: Clock,         color: "text-warning-600", bg: "bg-warning-50" },
    { label: "Declined",       value: declined.toLocaleString("en-GB"),     sub: `${total ? Math.round((declined / (total ?? 1)) * 100) : 0}% of invited`,   icon: XCircle,       color: "text-danger-600",  bg: "bg-danger-50" },
    { label: "Checked In",     value: checkedIn.toLocaleString("en-GB"),    sub: confirmed > 0 ? `${Math.round((checkedIn / confirmed) * 100)}% of confirmed` : "—", icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Guests</h2>
          <p className="text-sm text-surface-500">{(total ?? 0).toLocaleString("en-GB")} guests · {confirmed} confirmed · {vip} VIP</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Upload className="h-4 w-4" />
            Import
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">
            <Plus className="h-4 w-4" />
            Add Guest
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-surface-900 tracking-tight">{value}</p>
                <p className="mt-0.5 text-[11px] text-surface-400">{sub}</p>
              </div>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.8} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Guest table */}
      <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search guests by name, email…"
              className="w-full rounded-lg border border-surface-200 bg-surface-50 pl-9 pr-3 py-2 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              readOnly
            />
          </div>
          <select className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm">
            <option>All Types</option>
            <option>VIP</option>
            <option>Speaker</option>
            <option>Sponsor</option>
            <option>Staff</option>
          </select>
          <select className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm">
            <option>All RSVP</option>
            <option>Confirmed</option>
            <option>Pending</option>
            <option>Declined</option>
          </select>
        </div>

        {guests.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-surface-300 mb-3" />
            <p className="text-sm font-medium text-surface-900">No guests added yet</p>
            <p className="text-xs text-surface-400 mt-1">Import a guest list or add guests individually.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50">
                <Upload className="h-4 w-4" /> Import
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <Plus className="h-4 w-4" /> Add Guest
              </button>
            </div>
          </div>
        ) : (
          <GuestTable guests={guests} eventId={eventId} />
        )}
      </div>

    </div>
  );
}
