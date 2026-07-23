"use client";

import { Pencil } from "lucide-react";
import { ProfileShell } from "../_components/ProfileShell";
import { cn } from "@/lib/utils";
import type { MemberDetail } from "../_data/member";
import type { TeamAssignmentRow } from "../../../_data/queries";
import { buildWeekDays, getWeekStart, assignmentSpansDay, assignmentHoursOnDay, STANDARD_WEEKLY_HOURS } from "../../../_lib/workload";

function formatMoney(cents: number | null, currency: string): string {
  if (cents === null) return "Not set";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const PROFICIENCY_PCT: Record<string, number> = { beginner: 30, intermediate: 55, advanced: 78, expert: 95 };
const CERT_STYLES: Record<string, string> = {
  valid: "bg-success-50 text-success-700 border-success-200",
  expiring_soon: "bg-warning-50 text-warning-600 border-warning-200",
  expired: "bg-danger-50 text-danger-600 border-danger-200",
};

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className="text-surface-800 text-right">{value}</span>
    </div>
  );
}

export function OverviewClient({ member, assignments }: { member: MemberDetail; assignments: TeamAssignmentRow[] }) {
  const days = buildWeekDays(getWeekStart(new Date()), 7);
  const dailyHours = days.map((d) => {
    const dayAssignments = assignments.filter((a) => assignmentSpansDay(a, d.iso));
    return { ...d, hours: Math.min(dayAssignments.reduce((sum, a) => sum + assignmentHoursOnDay(a), 0), 24) };
  });
  const scheduledHours = dailyHours.reduce((sum, d) => sum + d.hours, 0);

  const upcoming = assignments
    .filter((a) => a.startAt && new Date(a.startAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())
    .slice(0, 4);

  return (
    <ProfileShell
      member={{ userId: member.userId, name: member.name, role: member.role, memberCode: member.memberCode, location: member.location, status: "active" }}
      activeTab="overview"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Personal Details" action={<button type="button" className="text-surface-400 hover:text-surface-700" aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></button>}>
          <Field label="Full Name" value={member.name} />
          <Field label="Location" value={member.location ?? "Not set"} />
          <Field label="Phone" value={member.phone ?? "Not set"} />
          <p className="mt-2 text-xs text-surface-400">Date of birth, address and languages are not yet captured — add via Edit Profile once that field set ships.</p>
        </Card>

        <Card title="Emergency Contact">
          <p className="text-xs text-surface-400">No emergency contact on file. This is a private, permission-gated field pending a follow-up migration.</p>
        </Card>

        <Card title="Skills Summary">
          {member.skills.length === 0 ? (
            <p className="text-xs text-surface-400">No skills recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {member.skills.slice(0, 5).map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-surface-700">{s.name}</span>
                    <span className="text-surface-400 capitalize">{s.proficiency}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${PROFICIENCY_PCT[s.proficiency] ?? 50}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Employment Details">
          <Field label="Member ID" value={member.memberCode ?? "—"} />
          <Field label="Employment Type" value={member.employmentType} />
          <Field label="Department" value={member.department ?? "—"} />
          <Field label="Joined" value={member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
        </Card>

        <Card title="Preferences">
          <Field label="Work Locations" value={member.location ?? "—"} />
          <Field label="Willing to Travel" value={member.willingToTravel ? `Yes — up to ${member.travelRadiusMiles ?? "?"} mi` : "No"} />
          <Field label="Preferred Roles" value={member.role ?? "—"} />
        </Card>

        <Card title="Weekly Capacity">
          <div className="flex items-center justify-between text-xs text-surface-400 mb-2">
            <span>{days[0].label} – {days[6].label}</span>
          </div>
          <div className="space-y-1.5">
            {dailyHours.map((d) => (
              <div key={d.iso} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-surface-400">{d.dow}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-100 overflow-hidden">
                  <div className="h-full rounded-full bg-success-500" style={{ width: `${Math.min(100, (d.hours / 8) * 100)}%` }} />
                </div>
                <span className="w-14 text-right text-surface-500 tabular-nums">{Math.round(d.hours)}h / 8h</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-surface-400">{Math.round(scheduledHours)}h / {STANDARD_WEEKLY_HOURS}h scheduled this week</p>
        </Card>

        <Card title="Upcoming Assignments">
          {upcoming.length === 0 ? (
            <p className="text-xs text-surface-400">No upcoming assignments.</p>
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-surface-800 truncate">{a.eventName}</p>
                    <p className="text-xs text-surface-400">{a.startAt ? new Date(a.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBC"}{a.venueName ? ` · ${a.venueName}` : ""}</p>
                  </div>
                  <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border", a.status === "confirmed" ? "bg-success-50 text-success-700 border-success-200" : "bg-warning-50 text-warning-600 border-warning-200")}>
                    {a.status === "confirmed" ? "Confirmed" : "Tentative"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Compliance Snapshot">
          {member.certifications.length === 0 ? (
            <p className="text-xs text-surface-400">No certifications recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {member.certifications.slice(0, 5).map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-surface-700 truncate">{c.name}</span>
                  <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border", CERT_STYLES[c.status])}>
                    {c.status === "valid" ? "Compliant" : c.status === "expiring_soon" ? "Expiring Soon" : "Expired"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 bg-white rounded-xl border border-surface-200 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-surface-900">Performance Summary</h3>
        </div>
        {member.rating ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-surface-900 tabular-nums">{member.rating.toFixed(1)}</span>
            <p className="text-xs text-surface-400">Average rating across completed assignments.</p>
          </div>
        ) : (
          <p className="text-xs text-surface-400">No performance reviews recorded yet — this section populates once post-event feedback is captured.</p>
        )}
      </div>
    </ProfileShell>
  );
}
