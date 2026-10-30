import "server-only";
import { mailboxStatus } from "@/lib/email/rules";
import { scannerConfigured } from "@/lib/upload-safety";
import { r2Configured } from "@/lib/r2";
import { signatureHealth } from "@/lib/contracts/signature-provider";
import { weatherHealth } from "@/lib/weather/provider";
import { virtualHealthSummary } from "@/lib/virtual/adapters";

/**
 * Integration contracts shared by `/api/health` (ops bearer) and the admin System health page (§200). Env names and states only —
 * never values. Database-backed parts (calendar sync, queue) are read with the caller's client: the service role for the route,
 * an ops admin (settings / agent_ops / audit) for the page.
 */
type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export type ComponentState = "healthy" | "configured" | "degraded" | "blocked_external" | "not_configured" | "unknown";
export type Contract = { key: string; name: string; state: ComponentState; detail: string };

const fromProvider = (s: { state: "ok" | "BLOCKED_EXTERNAL" | "misconfigured" }): ComponentState => s.state === "ok" ? "configured" : s.state === "BLOCKED_EXTERNAL" ? "blocked_external" : "degraded";
const safe = async <T,>(p: PromiseLike<{ data: unknown; error: unknown }>, fallback: T): Promise<T> => {
  try { const r = await p; return r.error ? fallback : (r.data as T) ?? fallback; } catch { return fallback; }
};

export async function healthContracts(db: Rpc, opts: { queue?: boolean } = {}) {
  const env = process.env;
  const mailbox = mailboxStatus(env), signature = signatureHealth(env), weather = weatherHealth(env), virtual = virtualHealthSummary(env);
  const [calendar, queue] = await Promise.all([
    safe<{ state?: string } & Record<string, unknown>>(db.rpc("calendar_sync_health"), { state: "unknown" }),
    opts.queue === false ? Promise.resolve(null) : safe<{ state?: string } & Record<string, unknown> | null>(db.rpc("queue_health"), null),
  ]);
  const raw = { mailbox, clamav: scannerConfigured() ? "configured" : "BLOCKED_EXTERNAL", r2: r2Configured() ? "configured" : "not_configured",
    e_signature: signature, weather, virtual, calendar_sync: calendar, ...(queue ? { queue } : {}) };
  const mailboxStates = Object.values(mailbox).map(m => m.status);
  const list: Contract[] = [
    { key: "e_signature", name: "E-signature provider", state: fromProvider(signature), detail: signature.state === "ok" ? `Provider ${signature.provider}` : signature.missing.length ? `Missing ${signature.missing.join(", ")} · typed-name signing works` : signature.issues.join("; ") },
    { key: "weather", name: "Weather provider", state: fromProvider(weather), detail: weather.state === "ok" ? `Provider ${weather.provider}` : weather.missing.length ? `Missing ${weather.missing.join(", ")}` : weather.issues.join("; ") },
    { key: "virtual", name: "Virtual session providers", state: virtual.configured ? "configured" : "blocked_external", detail: `Manual join links supported · ${virtual.configured}/${virtual.api_providers} API providers configured` },
    { key: "calendar_sync", name: "Calendar sync", state: calendar.state === "healthy" || calendar.state === "ok" ? "healthy" : calendar.state === "degraded" ? "degraded" : calendar.state === "unknown" ? "unknown" : "configured", detail: Object.entries(calendar).filter(([k]) => k !== "state").map(([k, v]) => `${k.replaceAll("_", " ")}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") || String(calendar.state ?? "unknown") },
    { key: "mailbox", name: "Mailbox sync / SMTP", state: mailboxStates.every(s => s === "configured") ? "configured" : mailboxStates.some(s => s !== "not_configured") ? "degraded" : "not_configured", detail: Object.entries(mailbox).map(([k, m]) => `${k}: ${m.status.replace("_", " ")}`).join(" · ") },
    { key: "clamav", name: "Malware scanner", state: raw.clamav === "configured" ? "configured" : "blocked_external", detail: raw.clamav === "configured" ? "Gateway configured" : "CLAMAV_SCAN_URL / CLAMAV_SCAN_TOKEN not set" },
    { key: "r2", name: "Object replication (R2)", state: raw.r2 === "configured" ? "configured" : "not_configured", detail: raw.r2 === "configured" ? "Configured" : "Not configured" },
  ];
  if (queue) list.push({ key: "queue", name: "Job queue and outbox", state: queue.state === "healthy" ? "healthy" : "degraded",
    detail: `${queue.dead ?? 0} dead · ${queue.failed_waiting ?? 0} waiting to retry · ${queue.stuck_running ?? 0} stuck · outbox ${queue.outbox_unpublished ?? 0} unpublished (lag ${queue.outbox_lag_seconds ?? 0}s)` });
  return { raw, list };
}
