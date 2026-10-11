import { Sparkles } from "lucide-react";
import { untyped, type Db } from "@/lib/workspace/db";
import { BudgetForm } from "./credits-form";

type Status = { allowance: number; allowance_used: number; allowance_left: number; balance: number; used_this_month: number; used_today: number; overage_this_month: number; pct: number;
  soft_caps: number[]; hard_cap: boolean; allow_overage: boolean; overage_limit: number; daily_limit: number | null; per_run_limit: number; deep_allowed: boolean; available: number };
const n = (v: number) => Number(v).toLocaleString("en-GB", { maximumFractionDigits: 1 });

/** AI Credits (release spec §17–20): allowance, purchased balance, usage, caps. Customers see credits, never provider token prices. */
export async function AgentCredits({ db, workspaceId, canEdit, canSeeUsage }: { db: Db; workspaceId: string; canEdit: boolean; canSeeUsage: boolean }) {
  const u = untyped(db as never);
  const [{ data: st }, { data: usage }] = await Promise.all([
    u.rpc("ai_credit_status", { p_workspace: workspaceId }),
    canSeeUsage ? u.from("ai_usage_events").select("purpose,tier,credits,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
  ]);
  const s = st as unknown as Status | null;
  if (!s) return null;
  const pct = Math.min(100, Number(s.pct));
  const tone = pct >= 95 ? "#c4142b" : pct >= 85 ? "#e27a00" : pct >= 70 ? "#b45f00" : "#0038fd";
  const cells: [string, string][] = [["Monthly allowance", `${n(s.allowance_used)} / ${n(s.allowance)}`], ["Purchased balance", n(s.balance)], ["Used today", n(s.used_today)], ["Available now", n(s.available)]];
  if (Number(s.overage_this_month) > 0) cells.push(["Approved overage used", n(s.overage_this_month)]);
  return <section className="k-card st-c" style={{ display: "grid", gap: 12 }} aria-labelledby="aic-h">
    <h2 id="aic-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><Sparkles size={18} aria-hidden="true" />Gala Agent credits</h2>
    <div role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly allowance used" style={{ height: 10, borderRadius: 99, background: "#eef2fb", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: tone }} /></div>
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, margin: 0 }}>
      {cells.map(([k, v]) => <div key={k} style={{ background: "#f8faff", borderRadius: 8, padding: "8px 10px" }}><dt style={{ fontSize: 11.5, color: "#5157a4" }}>{k}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{v}</dd></div>)}
    </dl>
    {s.hard_cap && Number(s.available) <= 0 && <p role="alert" style={{ margin: 0, color: "#c4142b", fontWeight: 600 }}>Credits are used up for this month. Paid Agent work is paused until credits are added or an owner approves overage. Everything else in Gala Dock keeps working.</p>}
    <p className="k-small" style={{ margin: 0 }}>Credits cover AI work only (planning, answers, summaries). You’re warned at {s.soft_caps.join("%, ")}% of the allowance. Unattended routines stop at the cap, so they never create uncontrolled spend.</p>
    {canEdit && <BudgetForm workspaceId={workspaceId} s={{ soft_caps: s.soft_caps, hard_cap: s.hard_cap, allow_overage: s.allow_overage, overage_limit: Number(s.overage_limit), daily_limit: s.daily_limit == null ? null : Number(s.daily_limit), per_run_limit: Number(s.per_run_limit), deep_allowed: s.deep_allowed }} />}
    {canSeeUsage && (usage ?? []).length > 0 && <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Recent usage</summary>
      <table className="mn-t" style={{ marginTop: 8 }}><thead><tr><th>When</th><th>What</th><th>Mode</th><th>Credits</th></tr></thead><tbody>
        {(usage as { purpose: string; tier: string; credits: number; created_at: string }[]).map((x, i) => <tr key={i}><td>{new Date(x.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td><td>{x.purpose.replace(/_/g, " ")}</td><td>{x.tier}</td><td>{n(x.credits)}</td></tr>)}
      </tbody></table></details>}
  </section>;
}
