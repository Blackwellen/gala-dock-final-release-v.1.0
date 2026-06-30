"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";

const PERMISSIONS = [
  "View events",
  "Create & edit events",
  "Delete events",
  "View suppliers",
  "Manage suppliers",
  "View finance",
  "Manage invoices & quotes",
  "View team members",
  "Invite team members",
  "Manage roles",
  "Manage billing",
  "Workspace settings",
];

const ROLES = [
  {
    name: "Owner",
    description: "Full control over the workspace. Only one owner per workspace.",
    color: "bg-danger-50 text-danger-700 border-danger-200",
    permissions: PERMISSIONS.map(() => true),
  },
  {
    name: "Admin",
    description: "Can manage most workspace settings and all records except billing.",
    color: "bg-warning-50 text-warning-700 border-warning-200",
    permissions: [true, true, true, true, true, true, true, true, true, true, false, false],
  },
  {
    name: "Member",
    description: "Can create and manage events, suppliers, and finance records.",
    color: "bg-brand-50 text-brand-700 border-brand-200",
    permissions: [true, true, false, true, true, true, true, true, false, false, false, false],
  },
  {
    name: "Viewer",
    description: "Read-only access to events and suppliers. Cannot edit or create records.",
    color: "bg-surface-100 text-surface-600 border-surface-200",
    permissions: [true, false, false, true, false, true, false, true, false, false, false, false],
  },
];

export default function RolesPage() {
  return (
    <SettingsShell title="Roles & Permissions" description="View the permissions associated with each workspace role.">
      <div className="max-w-3xl space-y-5">
        <div className="flex items-start gap-3 bg-brand-50 border border-brand-200 rounded-lg p-4">
          <p className="text-sm text-brand-700">
            <strong>Custom roles</strong> are coming in V2. For now, use the built-in roles below to manage access.
          </p>
        </div>

        {ROLES.map((role) => (
          <div key={role.name} className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${role.color}`}>
                {role.name}
              </span>
              <p className="text-sm text-surface-500">{role.description}</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PERMISSIONS.map((perm, i) => (
                  <div key={perm} className="flex items-center gap-2">
                    {role.permissions[i] ? (
                      <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" strokeWidth={2} />
                    ) : (
                      <XCircle className="w-4 h-4 text-surface-300 shrink-0" strokeWidth={2} />
                    )}
                    <span className={`text-sm ${role.permissions[i] ? "text-surface-700" : "text-surface-400"}`}>
                      {perm}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SettingsShell>
  );
}
