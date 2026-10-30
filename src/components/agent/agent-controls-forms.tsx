"use client";

import { useState, useTransition } from "react";
import { forgetAgentMemory, setAgentKillSwitch } from "@/lib/agent/controls";

const row: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const err: React.CSSProperties = { color: "#c4142b" };

/** Workspace kill switch: owners/managers, reason required, step-up enforced by the database. */
export function KillSwitchForm({ workspaceId, on, canEdit }: { workspaceId: string; on: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition(); const [msg, setMsg] = useState(""), [e, setE] = useState("");
  if (!canEdit) return <p className="k-small" style={{ margin: 0 }}>Only owners and managers can switch Gala Agent off or on.</p>;
  return <form action={fd => start(async () => { setMsg(""); setE(""); const r = await setAgentKillSwitch(workspaceId, fd); if (r.ok) setMsg(r.message ?? "Saved."); else setE(r.error); })} style={{ display: "grid", gap: 8 }}>
    <input type="hidden" name="on" value={on ? "false" : "true"} />
    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>Reason (kept in the audit log)
      <input className="k-input" name="reason" required minLength={3} maxLength={300} placeholder={on ? "e.g. Issue resolved" : "e.g. Investigating an unexpected message"} /></label>
    <div style={row}><button className={on ? "k-btn" : "k-btn danger"} disabled={pending} aria-describedby="ks-help">{pending ? "Saving…" : on ? "Switch Gala Agent back on" : "Switch Gala Agent off"}</button>
      {msg && <span role="status" className="k-green">{msg}</span>}{e && <span role="alert" style={err}>{e}</span>}</div>
    <p id="ks-help" className="k-small" style={{ margin: 0 }}>Switching off pauses every running task at once and refuses new ones. Nothing is deleted. You may be asked to confirm with your authenticator.</p>
  </form>;
}

/** Forget one memory item or reset a scope. */
export function MemoryButton({ workspaceId, memoryId, scope, label, confirmText }: { workspaceId: string; memoryId?: string; scope?: "user" | "workspace" | "all"; label: string; confirmText?: string }) {
  const [pending, start] = useTransition(); const [msg, setMsg] = useState(""), [e, setE] = useState("");
  return <span style={row}>
    <button type="button" className="k-btn ghost sm" disabled={pending} onClick={() => { if (confirmText && !window.confirm(confirmText)) return;
      start(async () => { setMsg(""); setE(""); const r = await forgetAgentMemory(workspaceId, memoryId ?? null, scope ?? null); if (r.ok) setMsg(r.message ?? "Done."); else setE(r.error); }); }}>
      {pending ? "Working…" : label}</button>
    {msg && <span role="status" className="k-small">{msg}</span>}{e && <span role="alert" style={err}>{e}</span>}
  </span>;
}
