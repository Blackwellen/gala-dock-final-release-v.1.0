import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { getProvider } from "@/lib/provider/context";
import { untyped } from "@/lib/workspace/db";
import { RunControls } from "./run-controls";
import { agentRefusalCode, agentRefusalText } from "@/lib/agent/refusals";
import "@/styles/agent-run.css";

type Run={id:string;user_id:string;goal:string;status:string;progress:number;summary:string|null;result:string|null;waiting_reason:string|null;next_wake_at:string|null;financial_exposure_minor:number;created_at:string;updated_at:string;finished_at:string|null};
type Step={id:string;seq:number;tool_id:string|null;status:string;attempt:number;error:string|null;started_at:string|null;finished_at:string|null};
type Artifact={id:string;kind:string;title:string;link:string|null;created_at:string};
const stamp=(date:string|null)=>date?new Date(date).toLocaleString('en-GB',{timeZone:'Europe/London'}):'—';

/** User-scoped client plus current workspace constraint; unknown and inaccessible IDs return the same 404. */
export async function AgentRunDetail({ id, surface }: { id:string; surface:'organizer'|'provider' }) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const ctx=surface==='organizer'?await getOrganizer():await getProvider();
  const db='supabase' in ctx?untyped(ctx.supabase):ctx.db;
  const {data,error}=await db.from('agent_runs').select('id,user_id,goal,status,progress,summary,result,waiting_reason,next_wake_at,financial_exposure_minor,created_at,updated_at,finished_at').eq('id',id).eq('workspace_id',ctx.workspace.id).eq('surface',surface).maybeSingle();
  if(error) throw new Error('Could not load this Agent run. Try again.');
  if(!data) notFound(); const run=data as Run;
  const [steps,artifacts,audit]=await Promise.all([
    db.from('agent_run_steps').select('id,seq,tool_id,status,attempt,error,started_at,finished_at').eq('run_id',id).order('seq'),
    db.from('agent_artifacts').select('id,kind,title,link,created_at').eq('run_id',id).order('created_at'),
    db.from('audit_events').select('id,event,created_at').eq('agent_run_id',id).eq('workspace_id',ctx.workspace.id).order('created_at'),
  ]);
  // Refused tool calls (RLS: owners/managers of the workspace; others get none). Shown with friendly text, code kept for support.
  const {data:refusedRows}=await db.from('agent_tool_calls').select('id,tool_id,refusal,finished_at').eq('run_id',id).eq('status','refused').order('finished_at').limit(50);
  const refused=(refusedRows??[]) as {id:string;tool_id:string;refusal:string|null;finished_at:string|null}[];
  if(steps.error||artifacts.error||audit.error) throw new Error('Could not load the run activity. Try again.');
  const userId='user' in ctx?ctx.user.id:ctx.userId;
  const home=`/${surface}/agent`;
  return <article className="ar">
    <Link href={home}>← Gala Agent</Link>
    <header><p>Run detail</p><h1>{run.goal}</h1><span className="ar-status">{run.status.replaceAll('_',' ')}</span></header>
    <dl className="ar-stats"><div><dt>Progress</dt><dd>{run.progress}%</dd></div><div><dt>Next wake</dt><dd>{stamp(run.next_wake_at)}</dd></div><div><dt>Commitment exposure</dt><dd>{new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(run.financial_exposure_minor)/100)}</dd></div><div><dt>Updated</dt><dd>{stamp(run.updated_at)}</dd></div></dl>
    {run.waiting_reason && <p className="ar-note" role="status">Waiting: {run.waiting_reason}</p>}
    <RunControls id={id} status={run.status} canControl={run.user_id===userId||['owner','manager'].includes(ctx.role)} />
    <section><h2>Plan and progress</h2><ol className="ar-steps">{(steps.data as Step[]??[]).map(s=><li key={s.id}><div><b>{s.tool_id?.replaceAll('.',' · ')??`Step ${s.seq}`}</b><span>{s.status.replaceAll('_',' ')} · Attempt {s.attempt}</span></div><small>Started {stamp(s.started_at)} · Finished {stamp(s.finished_at)}</small>{s.error && <p role="alert">{agentRefusalText(s.error)}{agentRefusalCode(s.error) && <small> (code: {agentRefusalCode(s.error)})</small>}</p>}</li>)}</ol>{!steps.data?.length&&<p>This run has no persisted steps yet.</p>}</section>
    {refused.length>0&&<section><h2>Stopped by your safeguards</h2><ul className="ar-outputs">{refused.map(c=><li key={c.id}><b>{c.tool_id.replaceAll('.',' · ')}</b><span>{agentRefusalText(c.refusal)} · {stamp(c.finished_at)}</span></li>)}</ul></section>}
    {(run.summary||run.result)&&<section><h2>Result</h2><p className="ar-result">{run.summary||run.result}</p></section>}
    <section><h2>Outputs</h2><ul className="ar-outputs">{(artifacts.data as Artifact[]??[]).map(a=><li key={a.id}><b>{a.title}</b><span>{a.kind.replaceAll('_',' ')} · {stamp(a.created_at)}</span>{a.link?.startsWith(`/${surface}/`)&&!a.link.includes('\\')&&<Link href={a.link}>Open output</Link>}</li>)}</ul>{!artifacts.data?.length&&<p>No outputs recorded yet.</p>}</section>
    <section><h2>Change audit</h2><ul className="ar-outputs">{(audit.data??[]).map(a=><li key={String(a.id)}><b>{String(a.event).replaceAll('.',' · ')}</b><span>{stamp(String(a.created_at))}</span></li>)}</ul>{!audit.data?.length&&<p>No changes recorded yet.</p>}</section>
  </article>;
}
