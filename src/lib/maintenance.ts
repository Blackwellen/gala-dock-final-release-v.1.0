import { createClient as createSb } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Maintenance levels (release spec §9–10). M0 normal · M1 notice · M2 degraded (named modules off) · M3 read-only modules ·
 * M4 full maintenance (writes off, maintenance page; admin + critical event-day flows stay up) · M5 security lockdown
 * (sign-in, payments, Agent mutations, API writes off). State is read through the public maintenance_state() RPC and cached
 * per server instance for a few seconds so the proxy never adds a database round-trip to every request.
 */
export type Window = { id: string; level: number; modules: string[]; title: string; message: string; status_url: string | null; expected_restore: string | null;
  audience: "all" | "customers" | "organizers" | "providers" | "admins"; dismissible: boolean; severity: "info" | "warning" | "critical"; bypass_roles: string[]; reference: string; starts_at: string; ends_at: string | null };
import { MODULES, type Module } from "./maintenance-modules";
export { MODULES, type Module };

let cache: { at: number; data: Window[] } | null = null;
const TTL = 10_000;

export async function maintenanceState(): Promise<Window[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const { url, anonKey } = getSupabaseConfig();
    const sb = createSb(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.rpc("maintenance_state" as never);
    if (error) throw error;
    cache = { at: Date.now(), data: (data ?? []) as Window[] };
  } catch {
    // Fail open on a read error (keep the last known state if any): maintenance must never be triggered by an outage of its own lookup.
    cache = { at: Date.now() - TTL / 2, data: cache?.data ?? [] };
  }
  return cache.data;
}

/** Effective level for a module — mirrors public.maintenance_level(): platform-wide windows never cover check-in. */
export const levelFor = (ws: Window[], m: Module) => Math.max(0, ...ws.filter(w => w.modules.includes(m) || (!w.modules.length && m !== "checkin")).map(w => w.level));
export const platformLevel = (ws: Window[]) => Math.max(0, ...ws.filter(w => !w.modules.length).map(w => w.level));

/** Which module a request path belongs to (used for HTTP write enforcement). */
export function moduleFor(path: string): Module | null {
  if (/^\/(organizer|account)\/events\/[^/]+\/scan|^\/api\/tickets\/[^/]+\/(credential|scan)|^\/api\/scan/.test(path)) return "checkin";
  if (/^\/(api\/)?(checkout|pay)(\/|$)|^\/payments\//.test(path)) return "checkout";
  if (/^\/api\/agent|\/agent(\/|$)/.test(path)) return "agent";
  if (/^\/studio|\/media(\/|$)|^\/api\/media/.test(path)) return "media";
  if (/\/inbox|^\/messages|^\/api\/messages/.test(path)) return "messaging";
  if (/resale/.test(path)) return "resale";
  if (/^\/(login|signup|auth|mfa|forgot-password|reset-password)(\/|$)|^\/api\/auth/.test(path)) return "auth";
  if (/^\/api\/v\d|^\/api\/mcp/.test(path)) return "api";
  if (/^\/provider/.test(path)) return "provider";
  if (/^\/organizer/.test(path)) return "organizer";
  if (/^\/(portal|partner|promoter|client)/.test(path)) return "portals";
  if (/^\/(account|discover|plan|book|tickets|events)/.test(path)) return "customer";
  return null;
}

/** Paths that must stay reachable at every level (admin responders, inbound webhooks, workers that self-check, the status page). */
const ALWAYS = /^\/(admin|maintenance|api\/maintenance|api\/stripe|api\/webhooks|api\/cron|api\/health|_next|assets|manifest|sw\.js|offline)/;
/** Event-day flows that stay up through M4 (spec §9: ticket display, check-in, existing booking viewing). */
const CRITICAL_READ = /^\/(account\/tickets|tickets\/|account\/bookings|organizer\/events\/[^/]+\/(scan|live)|account\/events\/[^/]+\/scan)/;

export type Decision = { action: "allow" } | { action: "page"; window: Window } | { action: "deny"; window: Window; module: string };

/** Decides what the proxy does with a request given the active windows. Pure, so it is unit-testable. */
export function decide(ws: Window[], path: string, method: string): Decision {
  if (!ws.length || ALWAYS.test(path)) return { action: "allow" };
  const write = !["GET", "HEAD", "OPTIONS"].includes(method);
  const top = [...ws].sort((a, b) => b.level - a.level)[0]!;
  const mod = moduleFor(path);
  const lvl = mod ? levelFor(ws, mod) : platformLevel(ws);
  const win = ws.filter(w => w.level === lvl && (mod ? w.modules.includes(mod) || !w.modules.length : !w.modules.length))[0] ?? top;
  // M5: sign-in, payments, Agent and API writes stop everywhere; check-in survives unless explicitly named.
  if (platformLevel(ws) >= 5 && (mod === "auth" || mod === "checkout" || mod === "api" || mod === "agent" || (write && mod !== "checkin"))) return { action: "deny", window: win, module: mod ?? "platform" };
  // M4 platform-wide: maintenance page for everything except event-day critical flows.
  if (platformLevel(ws) >= 4 && mod !== "checkin" && !CRITICAL_READ.test(path)) return write ? { action: "deny", window: win, module: mod ?? "platform" } : { action: "page", window: win };
  // Platform-wide M3: everything read-only except check-in.
  if (platformLevel(ws) >= 3 && write && mod !== "checkin") return { action: "deny", window: win, module: mod ?? "platform" };
  if (!mod) return { action: "allow" };
  // Module windows: M2 module unavailable (page / refuse), M3 module read-only, M4+ module off.
  const mw = ws.filter(w => w.level >= 2 && w.modules.includes(mod)).sort((a, b) => b.level - a.level)[0];
  if (mw) { if (write) return { action: "deny", window: mw, module: mod }; if (mw.level !== 3) return { action: "page", window: mw }; }
  return { action: "allow" };
}
