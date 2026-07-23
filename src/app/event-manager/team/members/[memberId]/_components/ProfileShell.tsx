"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Phone, Clock, MessageSquare, CalendarPlus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PROFILE_TABS = [
  "overview", "workload", "schedule", "availability", "assignments",
  "roles-skills", "time-off", "performance", "documents", "notes",
  "activity", "payroll", "settings",
] as const;

const TAB_LABELS: Record<(typeof PROFILE_TABS)[number], string> = {
  overview: "Overview",
  workload: "Workload",
  schedule: "Schedule",
  availability: "Availability",
  assignments: "Assignments",
  "roles-skills": "Roles & Skills",
  "time-off": "Time Off",
  performance: "Performance",
  documents: "Documents",
  notes: "Notes",
  activity: "Activity",
  payroll: "Payroll / Commercial",
  settings: "Settings",
};

export interface ProfileHeaderData {
  userId: string;
  name: string;
  role: string | null;
  memberCode: string | null;
  location: string | null;
  status: "active" | "inactive";
}

export function ProfileShell({
  member,
  activeTab,
  children,
}: {
  member: ProfileHeaderData;
  activeTab: (typeof PROFILE_TABS)[number];
  children: React.ReactNode;
}) {
  const base = `/event-manager/team/members/${member.userId}`;
  return (
    <div className="animate-fade-in">
      <div className="bg-white border-b border-surface-200 px-6 pt-3">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {PROFILE_TABS.map((t) => (
            <Link
              key={t}
              href={`${base}/${t}`}
              className={cn(
                "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === t ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-700",
              )}
            >
              {TAB_LABELS[t]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="bg-white border-b border-surface-200 px-6 py-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 text-xl font-semibold flex items-center justify-center shrink-0">
              {initials(member.name)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-surface-900">{member.name}</h1>
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                  member.status === "active" ? "bg-success-50 text-success-700 border-success-200" : "bg-surface-100 text-surface-500 border-surface-200",
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", member.status === "active" ? "bg-success-500" : "bg-surface-400")} />
                  {member.status === "active" ? "Active" : "Inactive"}
                </span>
                {member.memberCode && <span className="text-xs text-surface-400">{member.memberCode}</span>}
              </div>
              <p className="text-sm text-surface-500 mt-0.5">{member.role ?? "Team member"}</p>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-surface-400">
                {member.location && (
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {member.location}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
              <MessageSquare className="w-4 h-4" /> Message
            </button>
            <button type="button" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50">
              <CalendarPlus className="w-4 h-4" /> Assign to Event
            </button>
            <button type="button" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-brand">
              Edit Profile
            </button>
            <button type="button" aria-label="More actions" className="p-2 text-surface-500 border border-surface-200 rounded-lg hover:bg-surface-50">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="p-6 max-w-[1600px]">{children}</div>
    </div>
  );
}

export { initials };
