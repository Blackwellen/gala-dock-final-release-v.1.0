"use client";

import { useState, useTransition } from "react";
import { UserPlus, Trash2, ChevronDown } from "lucide-react";
import type { WorkspaceMemberRole } from "@/lib/supabase/types";
import { updateMemberRole, removeMember } from "./actions";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";

const ASSIGNABLE_ROLES: WorkspaceMemberRole[] = ["admin", "manager", "member"];

const ROLE_LABELS: Record<WorkspaceMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

export interface MemberRow {
  id: string;
  name: string;
  role: WorkspaceMemberRole;
  joined: string;
  isCurrent: boolean;
}

function MemberRoleControl({ member }: { member: MemberRow }) {
  const [isPending, startTransition] = useTransition();

  function onChange(role: string) {
    const fd = new FormData();
    fd.set("member_id", member.id);
    fd.set("role", role);
    startTransition(() => {
      void updateMemberRole(fd);
    });
  }

  if (member.role === "owner") {
    return <span className="text-sm text-surface-500">Owner</span>;
  }

  return (
    <div className="relative inline-block">
      <select
        defaultValue={member.role}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-2 pr-6 py-1 text-xs font-medium bg-surface-50 border border-surface-200 rounded-lg text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-400 pointer-events-none" strokeWidth={1.8} />
    </div>
  );
}

function RemoveMemberButton({ memberId }: { memberId: string }) {
  const [isPending, startTransition] = useTransition();

  function onRemove() {
    const fd = new FormData();
    fd.set("member_id", memberId);
    startTransition(() => {
      void removeMember(fd);
    });
  }

  return (
    <button
      onClick={onRemove}
      disabled={isPending}
      className="p-1.5 text-surface-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
    </button>
  );
}

export function TeamClient({ members }: { members: MemberRow[] }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>("member");
  const [inviteNote, setInviteNote] = useState(false);

  function handleInvite() {
    if (!inviteEmail) return;
    // Invitations require an email/server flow that is out of scope for this wiring pass.
    setInviteNote(true);
    setInviteEmail("");
    setTimeout(() => setInviteNote(false), 4000);
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Invite form */}
      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-4">Invite a member</h2>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as WorkspaceMemberRole)}
            className="px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button
            onClick={handleInvite}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" strokeWidth={1.8} />
            Send invite
          </button>
        </div>
        {inviteNote && (
          <p className="mt-2 text-sm text-surface-500">
            Email invitations are not enabled in this release. Members are added directly via Supabase.
          </p>
        )}
      </div>

      {/* Current members */}
      <div className="border-t border-surface-100 pt-6">
        <h2 className="text-sm font-semibold text-surface-900 mb-4">
          Current members <span className="text-surface-400 font-normal">({members.length})</span>
        </h2>
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-[10px] font-semibold">
                            {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-surface-900">{m.name}</span>
                        {m.isCurrent && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <MemberRoleControl member={m} />
                    </td>
                    <td className="px-4 py-3 text-surface-500 text-xs">{m.joined}</td>
                    <td className="px-4 py-3 text-right">
                      {!m.isCurrent && m.role !== "owner" && (
                        <RemoveMemberButton memberId={m.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
