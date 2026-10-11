"use client";
import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { Dialog, Toggle, useAction } from "@/components/kit/client";
import { saveWorkspaceSettings, changeMemberRole } from "@/lib/actions/workspace-settings";

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
      {fields.map(f => <label key={f.key} className="k-field"><span>{f.label}</span>{f.options ? <select className="k-input" value={v[f.key]} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))}>{f.options.map(o => <option key={o}>{o}</option>)}</select> : f.key === "description" || f.key === "address" ? <textarea className="k-textarea" maxLength={400} value={v[f.key]} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))} /> : <input className="k-input" value={v[f.key]} maxLength={200} onChange={e => setV(p => ({ ...p, [f.key]: e.target.value }))} />}</label>)}
      <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="k-spin" />}Save</button></div></form></Dialog></>;
}

export function NotifToggles({ can, prefs }: { can: boolean; prefs: Record<string, boolean> }) {
  const [v, setV] = useState(prefs); const { run } = useAction();
  const flip = (k: string, x: boolean) => { const n = { ...v, [k]: x }; setV(n); void run(() => saveWorkspaceSettings({ notifications: n }), { refresh: false }); };
  return <ul className="st-notif">{([["in_app", "In-app notifications"], ["email", "Email notifications"], ["sms", "SMS notifications"], ["agent", "Agent summaries"], ["marketing", "Marketing updates"]] as const).map(([k, l]) => <li key={k}><span>{l}</span><Toggle checked={!!v[k]} disabled={!can} onChange={x => flip(k, x)} label={l} /></li>)}</ul>;
}

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const { run, pending } = useAction();
  return <select className="k-input st-role" disabled={pending} defaultValue={role} onChange={e => void run(() => changeMemberRole(userId, e.target.value as "manager"))} aria-label="Role"><option value="manager">Manager</option><option value="member">Member</option><option value="finance">Finance</option></select>;
}
