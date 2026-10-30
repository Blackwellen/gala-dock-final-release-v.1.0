import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/security";
import { isClientEvent, type TrackInput } from "./events";

/**
 * Q35 analytics service (domains 223–228, 265–266). Capture goes through the service role (route handler only); every read runs
 * as the signed-in user so the SQL functions enforce membership/role/admin permission themselves (tenant isolation).
 */
type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
const svc = () => createAdminClient() as unknown as Rpc;
const asUser = async () => (await createClient()) as unknown as Rpc & { auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> } };

export type Consent = "granted" | "denied" | "unknown";
export type AnalyticsError = { ok: false; error: string; status: number };
const fail = (e: { message: string; code?: string }): AnalyticsError => ({
  ok: false, error: e.message, status: e.code === "42501" || /not_authorized/.test(e.message) ? 403 : e.code === "P0002" ? 404 : e.code === "54000" ? 429 : 400 });

/** Anonymous consent from the gd_consent cookie (`analytics:yes|no`, comma-separated with other choices). */
export function cookieConsent(cookieHeader: string | null): Consent {
  const raw = decodeURIComponent(cookieHeader?.match(/(?:^|;\s*)gd_consent=([^;]+)/)?.[1] ?? "");
  const m = raw.split(",").map(s => s.trim()).find(s => s.startsWith("analytics:"));
  return m === "analytics:yes" ? "granted" : m === "analytics:no" ? "denied" : "unknown";
}

/** sha256(ip | user agent): input to the daily-rotating visitor pseudonym. Never stored (the DB keys an HMAC of it per day). */
export const visitorHash = (request: Request) => createHash("sha256").update(`${clientIp(request)}|${request.headers.get("user-agent") ?? ""}`).digest("hex");

export function deviceClass(ua: string | null): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export type CaptureContext = { userId: string | null; consent: Consent; visitorHash: string; workspaceId?: string | null; device: string; standalone: boolean;
  refHost: string; utm: Record<string, string>; correlationId?: string };

export async function capture(events: TrackInput[], ctx: CaptureContext) {
  const clean = events.filter(e => isClientEvent(e?.name)).slice(0, 50).map(e => ({ name: e.name, path: e.path ?? "", props: e.props ?? {}, event_id: e.eventId, listing_id: e.listingId, at: e.at }));
  if (!clean.length) return { accepted: 0, dropped: events.length };
  const { data, error } = await svc().rpc("analytics_capture", { p_events: clean, p_ctx: {
    user_id: ctx.userId, consent: ctx.consent, visitor_hash: ctx.visitorHash, workspace_id: ctx.workspaceId ?? null, device: ctx.device,
    standalone: ctx.standalone, ref_host: ctx.refHost, utm: ctx.utm, correlation_id: ctx.correlationId } });
  if (error) throw new Error(`analytics_capture: ${error.message}`);
  return data as { accepted: number; dropped: number };
}

/** Server-emitted product events from trusted code (e.g. signup.completed). Never throws. */
export async function captureServer(event: "signup.completed", userId: string | null, workspaceId: string | null, props: Record<string, string | number | boolean> = {}) {
  try { await svc().rpc("analytics_capture_server", { p_event: event, p_user: userId, p_workspace: workspaceId, p_props: props }); } catch { /* best effort */ }
}

export async function consentFor(userId: string): Promise<Consent> {
  const { data } = await svc().rpc("analytics_consent_for", { p_user: userId });
  return data === "granted" || data === "denied" ? data : "unknown";
}

// ── Reads (as the caller) ─────────────────────────────────────────────────────────────────────────────────────────────
export type MetricValue = { key: string; version: number; unit: "count" | "minor_gbp" | "ratio" | "credits"; value: number | null; previous?: number | null;
  numerator?: number | null; denominator?: number | null; name?: string; domain?: string };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | AnalyticsError> {
  const { data, error } = await (await asUser()).rpc(fn, args);
  return error ? fail(error) : { ok: true, data: data as T };
}

export const workspaceMetrics = (workspaceId: string, from: string, to: string, keys?: string[]) =>
  call<{ workspace_id: string; from: string; to: string; freshness: string | null; metrics: MetricValue[] }>("analytics_workspace_metrics",
    { p_workspace: workspaceId, p_from: from, p_to: to, p_keys: keys?.length ? keys : null });
export const trend = (metric: string, workspaceId: string | null, from: string, to: string, grain: "day" | "week" | "month" = "day") =>
  call<{ metric: string; version: number; grain: string; points: { from: string; to: string; value: number | null }[] }>("analytics_trend",
    { p_metric: metric, p_workspace: workspaceId, p_from: from, p_to: to, p_grain: grain });
export const eventReport = (eventId: string) => call<Record<string, unknown>>("analytics_event_report", { p_event: eventId });
export const platformReport = (from: string, to: string, includeDemo = false) =>
  call<{ metrics: MetricValue[]; supply_gaps: unknown[]; freshness: string | null }>("analytics_platform_report", { p_from: from, p_to: to, p_include_demo: includeDemo });
export const reconcile = (from: string, to: string) => call<{ ok: boolean; checks: { check: string; facts: number; source: number; ok: boolean }[] }>("analytics_reconcile", { p_from: from, p_to: to });
export const funnel = (steps: string[], from: string, to: string, workspaceId: string | null = null) =>
  call<{ steps: { step: string; subjects: number; drop_off: number | null }[] }>("analytics_funnel", { p_steps: steps, p_from: from, p_to: to, p_workspace: workspaceId, p_include_demo: false });
export const retention = (from: string, weeks = 8) => call<unknown[]>("analytics_retention", { p_from: from, p_weeks: weeks });

export const EXPORT_DATASETS = ["payment_daily", "ticket_daily", "event_daily", "booking_daily", "agent_daily", "product_daily", "kpi_snapshots"] as const;
export type ExportDataset = typeof EXPORT_DATASETS[number];
export const requestExport = (dataset: ExportDataset, workspaceId: string | null, from: string, to: string, includeDemo = false) =>
  call<string>("analytics_request_export", { p_dataset: dataset, p_workspace: workspaceId, p_from: from, p_to: to, p_include_demo: includeDemo });
export const downloadExport = (exportId: string) => call<{ status: string; dataset?: string; rows?: number; csv?: string; error?: string }>("analytics_export_download", { p_export: exportId });

/** Validates YYYY-MM-DD and a bounded range (≤ 731 days, the SQL limit). */
export function range(fromRaw: string | null, toRaw: string | null, defaultDays = 30): { from: string; to: string } | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const to = toRaw && iso.test(toRaw) ? toRaw : new Date().toISOString().slice(0, 10);
  const from = fromRaw && iso.test(fromRaw) ? fromRaw : new Date(Date.parse(to) - (defaultDays - 1) * 864e5).toISOString().slice(0, 10);
  const span = (Date.parse(to) - Date.parse(from)) / 864e5;
  return Number.isFinite(span) && span >= 0 && span <= 731 ? { from, to } : null;
}

export async function currentUserId() {
  try { return (await (await asUser()).auth.getUser()).data.user?.id ?? null; } catch { return null; }
}
