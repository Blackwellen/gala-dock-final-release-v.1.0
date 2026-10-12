"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmDialog } from "@/lib/ui/dialogs";

type W = { id: string; name: string; kind: string; settings: { demo_persona?: string } };
const PERSONAS: [string, string, string][] = [["organizer", "Organizer demo", "Events, tickets, suppliers, tasks and a sales pipeline"], ["venue", "Venue demo", "A venue listing and a booked wedding"], ["supplier", "Supplier demo", "A catering service and an upcoming job"]];

/** Demo workspaces (release spec §87): separate, clearly marked sample workspaces — never mixed into this real workspace. */
export function DemoCard() {
  const [sb] = useState(createClient);
  const [rows, setRows] = useState<W[] | null>(null), [msg, setMsg] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return;
    const { data } = await sb.from("workspaces").select("id,name,kind,settings").eq("owner_id", user.id).eq("settings->>demo", "true");
    setRows((data ?? []) as unknown as W[]);
  }, [sb]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const act = (fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) => start(async () => {
    setMsg(""); setErr(""); const { error } = await fn();
    if (error) setErr(/limit_reached/.test(error.message) ? "You can have up to three demo workspaces." : "That didn’t work — try again."); else { setMsg(done); await load(); }
  });
  return <section className="k-card st-c" style={{ display: "grid", gap: 12 }} aria-labelledby="demo-h">
    <h2 id="demo-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><FlaskConical size={18} aria-hidden="true" />Demo workspaces</h2>
    <p className="k-small" style={{ margin: 0 }}>Try Gala Dock with realistic sample data in a separate workspace. Demo data is labelled <b>DEMO</b>, stays private, never appears in the marketplace and never mixes with this workspace. Switch to it from the workspace switcher.</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{PERSONAS.map(([k, l, d]) => <button key={k} type="button" className="k-btn outline" title={d} disabled={pending}
      onClick={() => act(() => sb.rpc("create_demo_workspace" as never, { p_persona: k } as never), `${l} created — open it from the workspace switcher.`)}>Create {l.toLowerCase()}</button>)}</div>
    {rows && rows.length > 0 && <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>{rows.map(w => <li key={w.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", border: "1px solid #eef2fb", borderRadius: 8 }}>
      <b style={{ flex: 1 }}>{w.name}</b>
      <a className="k-btn outline sm" href={`/${w.kind}`}>Open</a>
      <button type="button" className="k-btn outline sm" disabled={pending} onClick={async () => { if ((await confirmDialog({ title: `Reset “${w.name}” to fresh sample data?`, confirmLabel: "Reset", danger: true }))) act(() => sb.rpc("reset_demo_workspace" as never, { p_workspace: w.id } as never), "Demo reset."); }}>Reset demo data</button>
      <button type="button" className="k-btn outline sm" disabled={pending} onClick={async () => { if ((await confirmDialog({ title: `Delete “${w.name}” and all its sample data?`, confirmLabel: "Delete", danger: true }))) act(() => sb.rpc("delete_demo_workspace" as never, { p_workspace: w.id } as never), "Demo deleted."); }}>Delete</button>
    </li>)}</ul>}
    {msg && <p role="status" className="k-small" style={{ margin: 0 }}>{msg}</p>}{err && <p role="alert" style={{ margin: 0, color: "#c4142b" }}>{err}</p>}
  </section>;
}
