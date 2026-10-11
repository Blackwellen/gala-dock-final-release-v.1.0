"use client";

import { useState, useTransition } from "react";
import { saveAiBudget } from "@/lib/agent/credits";

type B = { soft_caps: number[]; hard_cap: boolean; allow_overage: boolean; overage_limit: number; daily_limit: number | null; per_run_limit: number; deep_allowed: boolean };
const f: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600 };
const check: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 };

export function BudgetForm({ workspaceId, s }: { workspaceId: string; s: B }) {
  const [pending, start] = useTransition(); const [msg, setMsg] = useState(""), [err, setErr] = useState(""), [overage, setOverage] = useState(s.allow_overage);
  return <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Budget and limits</summary>
    <form action={fd => start(async () => { setMsg(""); setErr(""); const r = await saveAiBudget(workspaceId, fd); if (r.ok) setMsg("Saved."); else setErr(r.error); })}
      style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginTop: 10 }}>
      <label style={f}>Warn at (% of allowance)<input className="k-input" name="soft_caps" defaultValue={s.soft_caps.join(",")} pattern="[0-9, ]+" /></label>
      <label style={f}>Daily limit (credits, blank = none)<input className="k-input" name="daily_limit" type="number" min={0} step="1" defaultValue={s.daily_limit ?? ""} /></label>
      <label style={f}>Per-task limit (credits)<input className="k-input" name="per_run_limit" type="number" min={1} step="1" defaultValue={s.per_run_limit} /></label>
      <label style={check}><input type="checkbox" name="hard_cap" defaultChecked={s.hard_cap} />Stop paid Agent work at the cap</label>
      <label style={check}><input type="checkbox" name="deep_allowed" defaultChecked={s.deep_allowed} />Allow Deep mode (uses more credits)</label>
      <label style={check}><input type="checkbox" name="allow_overage" checked={overage} onChange={e => setOverage(e.target.checked)} />Approve overage (owner only)</label>
      {overage && <label style={f}>Overage limit per month (credits)<input className="k-input" name="overage_limit" type="number" min={0} step="1" defaultValue={s.overage_limit} /></label>}
      <div style={{ gridColumn: "1/-1", display: "flex", gap: 10, alignItems: "center" }}><button className="k-btn" disabled={pending}>{pending ? "Saving…" : "Save limits"}</button>
        {msg && <span role="status" className="k-green">{msg}</span>}{err && <span role="alert" style={{ color: "#c4142b" }}>{err}</span>}</div>
    </form></details>;
}
