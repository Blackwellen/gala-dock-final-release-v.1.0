import { Power, Brain, Receipt, Puzzle } from "lucide-react";
import { untyped, type Db } from "@/lib/workspace/db";
import { KillSwitchForm, MemoryButton } from "./agent-controls-forms";

type Memory = { id: string; scope: "workspace" | "user"; kind: string; key: string; value: string; updated_at: string; expires_at: string; from_run: boolean };
type Cost = { run_id: string; goal: string; status: string; mission: string | null; created_at: string; credits: number; cost_gbp: number; tokens: number; tool_calls: number; refused_calls: number };
type SkillRow = { id: string; title: string; level: string; max_risk: number; available: boolean; locked_reason: string | null };
const when = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/**
 * Settings → Agent (Q42/Q43): kill switch, skills available on this plan (Starter = read, draft and internal actions only), memory
 * (what Gala Agent remembers, with forget / reset), and per-run cost for owners and managers. All reads run as the signed-in user.
 */
export async function AgentControls({ db, workspaceId, surface, canManage }: { db: Db; workspaceId: string; surface: "organizer" | "provider"; canManage: boolean }) {
  const u = untyped(db as never);
  const [{ data: pol }, { data: mem }, { data: skills }, costs] = await Promise.all([
    u.from("agent_policies").select("kill_switch").eq("workspace_id", workspaceId).maybeSingle(),
    u.rpc("agent_memory_list", { p_workspace: workspaceId }),
    u.rpc("agent_available_skills", { p_workspace: workspaceId }),
    canManage ? u.rpc("agent_workspace_run_costs", { p_workspace: workspaceId, p_limit: 10 }) : Promise.resolve({ data: [] }),
  ]);
  const off = Boolean((pol as { kill_switch?: boolean } | null)?.kill_switch);
  const memories = (mem ?? []) as Memory[];
  const skillRows = (skills ?? []) as SkillRow[];
  const runs = ((costs as { data: unknown }).data ?? []) as Cost[];
  const base = surface === "provider" ? "/provider/agent" : "/organizer/agent";
  const locked = skillRows.filter(s => !s.available);
  return <>
    <section className="k-card st-c" style={{ display: "grid", gap: 10 }} aria-labelledby="ag-ks">
      <h2 id="ag-ks" style={{ display: "flex", gap: 8, alignItems: "center" }}><Power size={18} aria-hidden="true" />Gala Agent is {off ? "switched off" : "on"} for this workspace</h2>
      <KillSwitchForm workspaceId={workspaceId} on={off} canEdit={canManage} />
    </section>

    <section className="k-card st-c" style={{ display: "grid", gap: 10 }} aria-labelledby="ag-sk">
      <h2 id="ag-sk" style={{ display: "flex", gap: 8, alignItems: "center" }}><Puzzle size={18} aria-hidden="true" />Skills on your plan</h2>
      {skillRows.length === 0 ? <p className="k-small" style={{ margin: 0 }}>No skills are available yet.</p> : <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        {skillRows.map(s => <li key={s.id}><b>{s.title}</b> <span className="k-small">· {s.level}{s.available ? "" : " · needs Pro (sends messages, holds or quotes)"}</span></li>)}</ul>}
      {locked.length > 0 && <p className="k-small" style={{ margin: 0 }}>On Starter, Gala Agent can read, draft and create internal tasks. Actions that reach other people or commit you (messages, holds, quotes, ticket publishing) need Pro or above.</p>}
    </section>

    <section className="k-card st-c" style={{ display: "grid", gap: 10 }} aria-labelledby="ag-mem">
      <h2 id="ag-mem" style={{ display: "flex", gap: 8, alignItems: "center" }}><Brain size={18} aria-hidden="true" />What Gala Agent remembers</h2>
      <p className="k-small" style={{ margin: 0 }}>Short working preferences and facts only — never contact details, payment details, health or dietary information. Items expire after 180 days or your retention setting, whichever is sooner.</p>
      {memories.length === 0 ? <p style={{ margin: 0 }}>Nothing saved.</p> :
        <table className="mn-t"><thead><tr><th>What</th><th>Remembered</th><th>For</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {memories.map(m => <tr key={m.id}><td>{m.key.replace(/[._]/g, " ")}</td><td>{m.value}</td><td>{m.scope === "user" ? "Only you" : "Workspace"}</td><td>{when(m.updated_at)}</td>
            <td>{(m.scope === "user" || canManage) && <MemoryButton workspaceId={workspaceId} memoryId={m.id} label="Forget" />}</td></tr>)}
        </tbody></table>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MemoryButton workspaceId={workspaceId} scope="user" label="Reset my memory" confirmText="Forget everything Gala Agent remembers for you in this workspace?" />
        {canManage && <MemoryButton workspaceId={workspaceId} scope="workspace" label="Reset workspace memory" confirmText="Forget everything Gala Agent remembers for this workspace?" />}
      </div>
    </section>

    {canManage && <section className="k-card st-c" style={{ display: "grid", gap: 10 }} aria-labelledby="ag-cost">
      <h2 id="ag-cost" style={{ display: "flex", gap: 8, alignItems: "center" }}><Receipt size={18} aria-hidden="true" />Cost per task</h2>
      {runs.length === 0 ? <p style={{ margin: 0 }}>No Gala Agent tasks yet.</p> :
        <table className="mn-t"><thead><tr><th>Task</th><th>Status</th><th>Started</th><th>Credits</th><th>Cost</th><th>Tool calls</th></tr></thead><tbody>
          {runs.map(r => <tr key={r.run_id}><td><a href={`${base}/runs/${r.run_id}`}>{r.goal}</a></td><td>{r.status.replace(/_/g, " ")}</td><td>{when(r.created_at)}</td>
            <td>{Number(r.credits).toLocaleString("en-GB", { maximumFractionDigits: 2 })}</td><td>£{Number(r.cost_gbp).toFixed(2)}</td><td>{r.tool_calls}{r.refused_calls ? ` (${r.refused_calls} refused)` : ""}</td></tr>)}
        </tbody></table>}
      <p className="k-small" style={{ margin: 0 }}>1 credit = 1p of AI provider cost, metered per model call. Tool calls cost no credits.</p>
    </section>}
  </>;
}
