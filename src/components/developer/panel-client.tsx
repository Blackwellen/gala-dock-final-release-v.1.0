"use client";

import { useState, useTransition } from "react";
import { createApiKey, revokeApiKey, createWebhook, setWebhookStatus, testWebhook, replayDelivery } from "@/lib/developer/actions";
import { confirmDialog } from "@/lib/ui/dialogs";

const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center" };
const chk: React.CSSProperties = { display: "flex", gap: 4, alignItems: "center", fontSize: 12.5 };

function OnceSecret({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  return <div role="region" aria-label={label} style={{ display: "grid", gap: 6, padding: 12, borderRadius: 10, background: "#f4f7fd" }}>
    <b>{label}</b><small>Copy it now — it won’t be shown again.</small>
    <code style={{ userSelect: "all", wordBreak: "break-all", padding: 8, background: "#fff", borderRadius: 6 }}>{value}</code>
    <div style={row}><button type="button" className="k-btn outline sm" onClick={() => void navigator.clipboard?.writeText(value)}>Copy</button><button type="button" className="k-btn outline sm" onClick={onDone}>Done</button></div>
  </div>;
}

export function KeyForm({ workspaceId, scopes }: { workspaceId: string; scopes: string[] }) {
  const [open, setOpen] = useState(false), [key, setKey] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  if (key) return <OnceSecret label="Your new API key" value={key} onDone={() => { setKey(""); setOpen(false); }} />;
  if (!open) return <button type="button" className="k-btn" style={{ width: "max-content" }} onClick={() => setOpen(true)}>Create API key</button>;
  return <form style={{ display: "grid", gap: 8 }} action={f => start(async () => { setErr(""); const r = await createApiKey(workspaceId, String(f.get("name")), f.getAll("scope").map(String), Number(f.get("expires")) || null); if (r.ok) setKey(r.data!); else setErr(r.error); })}>
    <label className="k-small" style={{ display: "grid", gap: 4 }}>Name<input className="k-input" name="name" required minLength={2} maxLength={80} placeholder="e.g. Box office sync" /></label>
    <fieldset style={{ border: "1px solid #eef2fb", borderRadius: 8, padding: 8 }}><legend className="k-small">Scopes (least privilege)</legend><div style={row}>{scopes.map(s => <label key={s} style={chk}><input type="checkbox" name="scope" value={s} defaultChecked={s.endsWith(":read")} />{s}</label>)}</div></fieldset>
    <label className="k-small" style={{ display: "grid", gap: 4, maxWidth: 220 }}>Expires<select className="k-input" name="expires" defaultValue="90"><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option><option value="">Never</option></select></label>
    <div style={row}><button className="k-btn" disabled={pending}>{pending ? "Creating…" : "Create key"}</button><button type="button" className="k-btn outline" onClick={() => setOpen(false)}>Cancel</button>{err && <span role="alert" style={{ color: "#c4142b" }}>{err}</span>}</div>
  </form>;
}

export function KeyRow({ k }: { k: { id: string; name: string; prefix: string; scopes: string[]; revoked_at: string | null; last: string; exp: string } }) {
  const [pending, start] = useTransition();
  return <tr style={k.revoked_at ? { opacity: 0.55 } : undefined}><td>{k.name}</td><td><code>gd_live_{k.prefix}_…</code></td><td>{k.scopes.join(", ")}</td><td>{k.last}</td><td>{k.revoked_at ? "Revoked" : k.exp}</td>
    <td>{!k.revoked_at && <button type="button" className="k-btn outline sm" disabled={pending} onClick={async () => { if ((await confirmDialog({ title: `Revoke “${k.name}”? Integrations using it stop working immediately.`, confirmLabel: "Revoke", danger: true }))) start(async () => { await revokeApiKey(k.id); }); }}>Revoke</button>}</td></tr>;
}

export function WebhookForm({ workspaceId, events }: { workspaceId: string; events: string[] }) {
  const [open, setOpen] = useState(false), [secret, setSecret] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  if (secret) return <OnceSecret label="Signing secret for this endpoint" value={secret} onDone={() => { setSecret(""); setOpen(false); }} />;
  if (!open) return <button type="button" className="k-btn" style={{ width: "max-content" }} onClick={() => setOpen(true)}>Add endpoint</button>;
  return <form style={{ display: "grid", gap: 8 }} action={f => start(async () => { setErr(""); const r = await createWebhook(workspaceId, String(f.get("url")), f.getAll("event").map(String), String(f.get("description") ?? "")); if (r.ok) setSecret(r.data!); else setErr(r.error); })}>
    <label className="k-small" style={{ display: "grid", gap: 4 }}>Endpoint URL<input className="k-input" name="url" type="url" required placeholder="https://example.com/hooks/gala-dock" /></label>
    <label className="k-small" style={{ display: "grid", gap: 4 }}>Description<input className="k-input" name="description" maxLength={200} /></label>
    <fieldset style={{ border: "1px solid #eef2fb", borderRadius: 8, padding: 8 }}><legend className="k-small">Events</legend><div style={row}>{events.map(e => <label key={e} style={chk}><input type="checkbox" name="event" value={e} />{e}</label>)}</div></fieldset>
    <div style={row}><button className="k-btn" disabled={pending}>{pending ? "Adding…" : "Add endpoint"}</button><button type="button" className="k-btn outline" onClick={() => setOpen(false)}>Cancel</button>{err && <span role="alert" style={{ color: "#c4142b" }}>{err}</span>}</div>
  </form>;
}

export function WebhookRow({ h }: { h: { id: string; url: string; description: string; events: string[]; status: string; consecutive_failures: number; disabled_reason: string | null } }) {
  const [pending, start] = useTransition(), [msg, setMsg] = useState("");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => { const r = await fn(); setMsg(r.ok ? done : r.error ?? "Failed."); });
  return <li style={{ display: "grid", gap: 4, padding: "8px 10px", border: "1px solid #eef2fb", borderRadius: 8 }}>
    <div style={row}><b style={{ wordBreak: "break-all" }}>{h.url}</b><span className={h.status === "active" ? "k-green" : "k-amber"}>{h.status}</span>{h.consecutive_failures > 0 && <small>{h.consecutive_failures} failures in a row</small>}</div>
    <small>{h.events.join(", ")}{h.description ? ` · ${h.description}` : ""}{h.disabled_reason ? ` · ${h.disabled_reason}` : ""}</small>
    <div style={row}>
      <button type="button" className="k-btn outline sm" disabled={pending} onClick={() => act(() => testWebhook(h.id), "Test delivery queued — it arrives within a minute.")}>Send test</button>
      <button type="button" className="k-btn outline sm" disabled={pending} onClick={() => act(() => setWebhookStatus(h.id, h.status === "active" ? "disabled" : "active"), "Updated.")}>{h.status === "active" ? "Disable" : "Enable"}</button>
      <button type="button" className="k-btn outline sm" disabled={pending} onClick={async () => { if ((await confirmDialog({ title: "Delete this endpoint and its delivery history?", confirmLabel: "Delete", danger: true }))) act(() => setWebhookStatus(h.id, "deleted"), "Deleted."); }}>Delete</button>
      {msg && <small role="status">{msg}</small>}
    </div>
  </li>;
}

export function ReplayButton({ id }: { id: string }) {
  const [pending, start] = useTransition(), [done, setDone] = useState(false);
  return <button type="button" className="k-btn outline sm" disabled={pending || done} onClick={() => start(async () => { const r = await replayDelivery(id); setDone(r.ok); })}>{done ? "Queued" : "Replay"}</button>;
}
