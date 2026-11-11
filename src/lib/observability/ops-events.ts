import { randomUUID } from "node:crypto";
import { bwSign, type BwKey } from "./bw-hmac";
import type { OpsHealth } from "./ops-health";

/**
 * Operational events to the Blackwellen event bus (OPS-A, `https://events.blackwellen-operations.cloud/v1/events`), which projects them
 * into Watchtower's `hb:OPS-A:events-gala-dock` (P1 when Gala Dock reports down or stops reporting, P2 when degraded) and Hermes.
 * One `service.heartbeat` per run (every 5 minutes) with the overall state, counts by state and each component's state. Envelope v1.0
 * (blackwellen-operations ops/schemas/event-envelope.v1.json), signed BW-HMAC-SHA256-V1 with key `gala_dock-events`.
 * Payload: component names, states and counts only (the bus refuses keys that look like secrets, paths or queries).
 * Dormant (nothing sent) until BLACKWELLEN_EVENTS_URL and its key are configured.
 */
export type OpsEventsDeps = { endpoint: string | null; key: BwKey | null; environment: "production" | "staging" | "test"; send: typeof fetch; now?: () => number };

const SEV: Record<string, "P1" | "P2" | "P3" | "info"> = { down: "P1", degraded: "P2", unknown: "P3", healthy: "info" };

export function heartbeatEnvelope(h: OpsHealth, environment: OpsEventsDeps["environment"], now: number) {
  const at = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  const by: Record<string, number> = {};
  const states: Record<string, string> = {};
  for (const [name, c] of Object.entries(h.components)) { if (!c.informational) by[c.state] = (by[c.state] ?? 0) + 1; states[name] = c.state; }
  return {
    schema_version: "1.0", event_id: randomUUID(), occurred_at: at, brand: "gala_dock", environment, service: "gala-dock-web",
    event_type: "service.heartbeat", severity_hint: SEV[h.overall] ?? "P3", subject_ref: "gala-dock-web", correlation_id: randomUUID(),
    idempotency_key: `heartbeat:${environment}:${at.slice(0, 16)}`,
    payload: { safe_operational_fields_only: true, overall: h.overall, components_by_state: by, component_states: states,
      alert_rules_open: h.components.alerts?.rule_keys ?? [] },
  };
}

export type PublishResult = { status: "dormant" | "sent" | "failed"; http?: number; overall?: string; idempotency?: string };

export async function publishHeartbeat(h: OpsHealth, deps: OpsEventsDeps): Promise<PublishResult> {
  if (!deps.endpoint || !deps.key) return { status: "dormant" };
  const e = heartbeatEnvelope(h, deps.environment, (deps.now ?? Date.now)());
  const body = new TextEncoder().encode(JSON.stringify(e));
  const target = new URL(deps.endpoint);
  try {
    const r = await deps.send(deps.endpoint, { method: "POST", body, signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", ...bwSign(deps.key, "POST", target.pathname + target.search, body) } });
    // 409 = the bus already holds this idempotency key (a retry inside the same minute).
    return { status: r.ok || r.status === 409 ? "sent" : "failed", http: r.status, overall: h.overall, idempotency: e.idempotency_key };
  } catch { return { status: "failed", overall: h.overall, idempotency: e.idempotency_key }; }
}
