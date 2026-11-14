"use client";
import { useState } from "react";
import { Pencil, Loader2, UserMinus } from "lucide-react";
import { Dialog, Toggle, useAction } from "@/components/kit/client";
import { saveWorkspaceSettings, changeMemberRole, removeMember } from "@/lib/actions/workspace-settings";
import { confirmDialog } from "@/lib/ui/dialogs";

type F = { key: string; label: string; value: string; options?: string[] };
/** "Edit" button that opens a form for a set of workspace settings; dotted keys (agent.x) are nested. */
export function EditCard({ can, title, fields }: { can: boolean; title: string; fields: F[] }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map(f => [f.key, f.value]))); const { run, pending } = useAction();
  const save = async () => {
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) { if (k.includes(".")) { const [a, b] = k.split("."); patch[a!] = { ...(patch[a!] as object ?? {}), [b!]: val }; } else patch[k] = val; }
    const r = await run(() => saveWorkspaceSettings(patch)); if (r.ok) setOpen(false);
  };
  return <><button className="k-btn outline sm st-edit" disabled={!can} title={!can ? "Owners and managers only" : undefined} onClick={() => setOpen(true)}><Pencil size={13} />Edit</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={title}><form className="k-col" style={{ gap: 12 }} onSubmit={e => { e.preventDefault(); void save(); }}>
      {fields.map(f => <label key={f.key} className="k-field"><span>{f.label}</span>{f.options ? <select className="k-input" value={v[f.key]} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))}>{(f.options.includes(v[f.key] ?? "") ? f.options : [v[f.key] ?? "", ...f.options]).map(o => <option key={o} value={o}>{o || "Not set"}</option>)}</select> : f.key === "description" || f.key === "address" ? <textarea className="k-textarea" maxLength={400} value={v[f.key]} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))} /> : <input className="k-input" value={v[f.key]} maxLength={200} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))} />}</label>)}
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="k-spin" />}Save</button></div></form></Dialog></>;
}

export function NotifToggles({ can, prefs }: { can: boolean; prefs: Record<string, boolean> }) {
  const [v, setV] = useState(prefs); const { run } = useAction();
  const flip = (k: string, x: boolean) => { const n = { ...v, [k]: x }; setV(n); void run(() => saveWorkspaceSettings({ notifications: n }), { refresh: false }).then(r => { if (!r.ok) setV(p => ({ ...p, [k]: !x })); }); };
  return <ul className="st-notif">{([["in_app", "In-app notifications"], ["email", "Email notifications"], ["sms", "SMS notifications"], ["agent", "Agent summaries"], ["marketing", "Marketing updates"]] as const).map(([k, l]) => <li key={k}><span>{l}</span><Toggle checked={!!v[k]} disabled={!can} onChange={x => flip(k, x)} label={l} /></li>)}</ul>;
}

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const { run, pending } = useAction(); const [v, setV] = useState(role);
  return <select className="k-input st-role" disabled={pending} value={v} onChange={e => { const next = e.target.value; setV(next); void run(() => changeMemberRole(userId, next as "manager")).then(r => { if (!r.ok) setV(role); }); }} aria-label="Role"><option value="manager">Manager</option><option value="member">Member</option><option value="finance">Finance</option></select>;
}

/** Owner-only: remove a login member from the workspace (confirmed; history stays in the audit log). */
export function RemoveMember({ userId, name, restore = false }: { userId: string; name: string; restore?: boolean }) {
  const { run, pending } = useAction();
  if (restore) return <button type="button" className="k-btn ghost sm" disabled={pending} aria-label={`Restore access for ${name}`} onClick={() => void run(() => removeMember(userId, true))}>{pending && <Loader2 size={13} className="k-spin" />}Restore access</button>;
  return <button type="button" className="k-btn ghost sm" disabled={pending} aria-label={`Remove ${name}`} onClick={async () => {
    if (!(await confirmDialog({ title: `Remove ${name}?`, message: "They lose access to this workspace straight away. Their past activity stays in the audit log.", confirmLabel: "Remove member", danger: true }))) return;
    void run(() => removeMember(userId));
  }}>{pending ? <Loader2 size={13} className="k-spin" /> : <UserMinus size={13} />}Remove</button>;
}
