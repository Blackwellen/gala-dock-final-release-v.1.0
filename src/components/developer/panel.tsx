import { untyped, type Db } from "@/lib/workspace/db";
import { ALL_SCOPES } from "@/lib/developer/gateway";
import { webhookEvents } from "@/lib/developer/actions";
import { KeyForm, KeyRow, WebhookForm, WebhookRow, ReplayButton } from "./panel-client";

type Key = { id: string; name: string; prefix: string; scopes: string[]; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string };
type Hook = { id: string; url: string; description: string; events: string[]; status: string; consecutive_failures: number; disabled_reason: string | null };
type Delivery = { id: string; endpoint_id: string; event_type: string; status: string; attempts: number; response_status: number | null; created_at: string; delivered_at: string | null };
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Settings → Developers (release spec §96–100): API keys, webhooks, delivery history, request log. Owners and managers. */
export async function DevelopersPanel({ db, workspaceId, canManage }: { db: Db; workspaceId: string; canManage: boolean }) {
  if (!canManage) return <section className="k-card st-c"><h2>Developers</h2><p className="k-small">Only workspace owners and managers can manage API keys and webhooks.</p></section>;
  const u = untyped(db as never);
  const [{ data: keys }, { data: hooks }, { data: deliveries }, { data: reqs }, events] = await Promise.all([
    u.from("api_keys").select("id,name,prefix,scopes,expires_at,last_used_at,revoked_at,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    u.from("webhook_endpoints").select("id,url,description,events,status,consecutive_failures,disabled_reason").eq("workspace_id", workspaceId).order("created_at"),
    u.from("webhook_deliveries").select("id,endpoint_id,event_type,status,attempts,response_status,created_at,delivered_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(25),
    u.from("api_requests").select("request_id,channel,method,path,tool,status,duration_ms,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(20),
    webhookEvents(),
  ]);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");
  return <div style={{ display: "grid", gap: 16 }}>
    <section className="k-card st-c" style={{ display: "grid", gap: 10 }}>
      <h2>API keys</h2>
      <p className="k-small">Keys act with <b>your</b> permissions in this workspace, limited to the scopes you choose. Commitments (sending quotes, placing holds, publishing tickets) always need approval in the app. API: <code>{site}/api/v1</code> · <a href="/api/v1/openapi.json">OpenAPI</a> · MCP: <code>{site}/api/mcp</code></p>
      <KeyForm workspaceId={workspaceId} scopes={ALL_SCOPES} />
      <table className="mn-t"><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Last used</th><th>Expires</th><th /></tr></thead><tbody>
        {((keys ?? []) as Key[]).map(k => <KeyRow key={k.id} k={{ ...k, last: when(k.last_used_at), exp: k.expires_at ? when(k.expires_at) : "Never" }} />)}
        {!(keys ?? []).length && <tr><td colSpan={6} className="k-small">No API keys yet.</td></tr>}</tbody></table>
    </section>
    <section className="k-card st-c" style={{ display: "grid", gap: 10 }}>
      <h2>Webhooks</h2>
      <p className="k-small">We POST JSON to your endpoint, signed with <code>Gala-Signature: t=…,v1=HMAC-SHA256(secret, &quot;t.body&quot;)</code>. Dedupe on <code>Gala-Event-Id</code>. Failed deliveries retry with backoff for about two days; endpoints that keep failing for 24 hours are disabled.</p>
      <WebhookForm workspaceId={workspaceId} events={events} />
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>{((hooks ?? []) as Hook[]).map(h => <WebhookRow key={h.id} h={h} />)}</ul>
      {((deliveries ?? []) as Delivery[]).length > 0 && <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Recent deliveries</summary>
        <table className="mn-t"><thead><tr><th>Event</th><th>Status</th><th>Attempts</th><th>Response</th><th>Created</th><th /></tr></thead><tbody>
          {((deliveries ?? []) as Delivery[]).map(d => <tr key={d.id}><td>{d.event_type}</td><td>{d.status}</td><td>{d.attempts}</td><td>{d.response_status ?? "—"}</td><td>{when(d.created_at)}</td><td><ReplayButton id={d.id} /></td></tr>)}
        </tbody></table></details>}
    </section>
    {(reqs ?? []).length > 0 && <section className="k-card st-c"><h2>Recent API requests</h2>
      <table className="mn-t"><thead><tr><th>Request</th><th>Channel</th><th>Operation</th><th>Status</th><th>ms</th><th>When</th></tr></thead><tbody>
        {(reqs as { request_id: string; channel: string; tool: string | null; path: string; status: number; duration_ms: number | null; created_at: string }[]).map(r =>
          <tr key={r.request_id}><td><code>{r.request_id}</code></td><td>{r.channel}</td><td>{r.tool ?? r.path}</td><td>{r.status}</td><td>{r.duration_ms ?? "—"}</td><td>{when(r.created_at)}</td></tr>)}
      </tbody></table></section>}
  </div>;
}
