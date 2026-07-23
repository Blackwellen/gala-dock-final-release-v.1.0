"use client";

import { Plus, Lock } from "lucide-react";
import { ProfileShell } from "../_components/ProfileShell";
import { cn } from "@/lib/utils";
import type { MemberDetail } from "../_data/member";

function formatMoney(cents: number | null, currency: string): string {
  if (cents === null) return "Not set";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const PROFICIENCY_PCT: Record<string, number> = { beginner: 30, intermediate: 55, advanced: 78, expert: 95 };
const CERT_STYLES: Record<string, { label: string; classes: string }> = {
  valid: { label: "Valid", classes: "bg-success-50 text-success-700 border-success-200" },
  expiring_soon: { label: "Expiring Soon", classes: "bg-warning-50 text-warning-600 border-warning-200" },
  expired: { label: "Expired", classes: "bg-danger-50 text-danger-600 border-danger-200" },
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

export function RolesSkillsClient({ member }: { member: MemberDetail }) {
  const regionTiers = ["primary", "secondary", "tertiary"];

  return (
    <ProfileShell
      member={{ userId: member.userId, name: member.name, role: member.role, memberCode: member.memberCode, location: member.location, status: "active" }}
      activeTab="roles-skills"
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Card title="Primary Role">
            <p className="text-surface-900 font-medium">{member.role ?? "Not set"}</p>
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700">Primary</span>
          </Card>

          <Card title="Regions Covered" action={<button type="button" className="text-xs font-medium text-brand-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Region</button>}>
            {member.regions.length === 0 ? (
              <p className="text-xs text-surface-400">No coverage regions recorded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {member.regions
                  .sort((a, b) => regionTiers.indexOf(a.tier) - regionTiers.indexOf(b.tier))
                  .map((r) => (
                    <span key={r.name} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-surface-100 text-surface-700">
                      {r.name}
                      <span className="text-[10px] text-surface-400 capitalize">{r.tier}</span>
                    </span>
                  ))}
              </div>
            )}
          </Card>

          <Card title="Availability Preferences">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-surface-400">Travel Preference</span><span className="text-surface-800">{member.willingToTravel ? `Up to ${member.travelRadiusMiles ?? "?"} mi` : "Local only"}</span></div>
              <div className="flex justify-between"><span className="text-surface-400">Standard Capacity</span><span className="text-surface-800">{member.standardWeeklyHours}h / week</span></div>
            </div>
          </Card>

          <Card title="Rates">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-surface-400">Day Rate</span><span className="text-surface-800">{formatMoney(member.dayRateCents, member.currency)}</span></div>
              <div className="flex justify-between"><span className="text-surface-400">Hour Rate</span><span className="text-surface-800">{formatMoney(member.hourRateCents, member.currency)}</span></div>
              <div className="flex justify-between"><span className="text-surface-400">OT Rate</span><span className="text-surface-800">{formatMoney(member.overtimeRateCents, member.currency)}</span></div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Role History">
            <p className="text-xs text-surface-400">Role change history will appear here once audit logging is wired to role assignment.</p>
          </Card>

          <Card title="Licenses & Certifications" action={<button type="button" className="text-xs font-medium text-brand-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Certification</button>}>
            {member.certifications.length === 0 ? (
              <p className="text-xs text-surface-400">No certifications recorded yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {member.certifications.map((c) => {
                  const style = CERT_STYLES[c.status];
                  return (
                    <li key={c.name} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-surface-800 truncate">{c.name}</p>
                        <p className="text-xs text-surface-400">{c.issuer ?? "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border", style.classes)}>{style.label}</span>
                        {c.expiresAt && <p className="text-[11px] text-surface-400 mt-0.5">Expires {new Date(c.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Core Skills">
            {member.skills.length === 0 ? (
              <p className="text-xs text-surface-400">No skills recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {member.skills.map((s) => (
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

          <Card title="Experience">
            <p className="text-xs text-surface-400">Years in industry, events completed and average event size will populate here once event-completion history rolls up per staff member.</p>
          </Card>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-1 text-xs text-surface-400">
        <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Private profile. Only visible to authorized team members.</span>
      </div>
    </ProfileShell>
  );
}
