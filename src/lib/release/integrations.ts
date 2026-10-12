import "server-only";

/**
 * Integration readiness (release spec intro + §137). Each external dependency declares the environment contract it needs.
 * "configured" only means the variables are present; live checks (where cheap and side-effect free) confirm reachability.
 * A missing credential is reported as BLOCKED_EXTERNAL_CONFIGURATION — never presented as working.
 */
export type Readiness = "ready" | "sandbox" | "degraded" | "blocked_external" | "not_implemented";
export type Integration = { key: string; name: string; purpose: string; env: string[]; optionalEnv?: string[]; critical: boolean; docs: string; implemented?: boolean;
  check?: () => Promise<{ ok: boolean; detail: string }> };

const has = (k: string) => Boolean(process.env[k] && String(process.env[k]).trim());
const timed = async (url: string, init: RequestInit = {}) => {
  const t0 = Date.now(); const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6000), cache: "no-store" }); return { r, ms: Date.now() - t0 };
};

export const INTEGRATIONS: Integration[] = [
  { key: "supabase", name: "Supabase (database, auth, storage)", purpose: "Core data, RLS, auth, files, realtime, cron", env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"], critical: true, docs: "docs/architecture",
    check: async () => { const { r, ms } = await timed(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }); return { ok: r.ok, detail: `auth ${r.status} in ${ms}ms` }; } },
  { key: "stripe", name: "Stripe (payments, Connect)", purpose: "Checkout, transfers, refunds, disputes, webhooks", env: ["STRIPE_SECRET_KEY", "STRIPE_PUBLIC_KEY", "STRIPE_WEBHOOK_SECRET"], optionalEnv: ["STRIPE_WEBHOOK_SECRET_CONNECT", "STRIPE_SECRET_KEY_SANDBOX"], critical: true, docs: "docs/architecture/payments.md",
    check: async () => { const live = String(process.env.STRIPE_SECRET_KEY).startsWith("sk_live_"); const { r, ms } = await timed("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }); return { ok: r.ok, detail: `${live ? "LIVE" : "TEST"} mode · ${r.status} in ${ms}ms` }; } },
  { key: "cron", name: "Scheduled workers", purpose: "Payments, agent worker, waitlists, marketplace sweep", env: ["CRON_SECRET"], critical: true, docs: "supabase/migrations/202610180002_dispatch.sql" },
  { key: "tickets", name: "Ticket credential signing", purpose: "Rotating wallet QR and print credentials", env: ["TICKET_QR_SECRET"], critical: true, docs: "src/lib/tickets/credentials.ts" },
  { key: "agent", name: "Azure OpenAI (Gala Agent)", purpose: "Planning, answers, summaries", env: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AGENT_MODEL_MINI"], optionalEnv: ["AGENT_MODEL_NANO", "AGENT_MODEL_DEEP", "AZURE_OPENAI_API_VERSION"], critical: false, docs: "src/lib/agent/llm.ts" },
  { key: "maps", name: "MapTiler", purpose: "Maps, geocoding, venue/site maps", env: ["MAP_TILER_API_KEY"], critical: false, docs: "src/lib/maps" },
  { key: "email", name: "Transactional email (Resend)", purpose: "Receipts, tickets, invites, security alerts, booking updates", env: ["RESEND_API_KEY", "EMAIL_FROM"], critical: true, docs: "src/lib/email" },
  { key: "r2", name: "Cloudflare R2", purpose: "Storage object replication (backups); exports and media derivatives", env: ["CLOUDFLARE_R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET"], critical: false, docs: "docs/operations/runbook.md",
    check: async () => { const { r2Ping } = await import("@/lib/r2"); const r = await r2Ping(); return { ok: r.ok, detail: r.status === 404 ? `Bucket "${process.env.CLOUDFLARE_R2_BUCKET}" does not exist — create it in Cloudflare R2 (credentials are valid)` : r.status === 403 ? "Credentials rejected or not scoped to the bucket" : `bucket ${r.status} in ${r.ms}ms · storage replication every 15 min` }; } },
  { key: "av_scanner", name: "Malware scanning (ClamAV on Oracle Cloud)", purpose: "Scans every upload; metadata stripping and PDF active-content checks run without it", env: ["CLAMAV_SCAN_URL", "CLAMAV_SCAN_TOKEN"], critical: false, docs: "docs/operations/oracle-setup.md",
    check: async () => { const { r, ms } = await timed(`${process.env.CLAMAV_SCAN_URL!.replace(/\/+$/, "")}/health`, { headers: { Authorization: `Bearer ${process.env.CLAMAV_SCAN_TOKEN}` } }); return { ok: r.ok, detail: `scanner ${r.status} in ${ms}ms` }; } },
  { key: "error_tracking", name: "Error tracking (Sentry-compatible / GlitchTip on Oracle)", purpose: "Server errors reported with request context", env: ["SENTRY_DSN"], critical: false, docs: "docs/operations/oracle-setup.md" },
  { key: "google_oauth", name: "Google sign-in", purpose: "Sign in with Google (Supabase Auth provider)", env: ["GOOGLE_OAUTH_CLIENT_ID"], critical: false, docs: "Supabase Auth → Providers → Google" },
  { key: "calendar", name: "Calendar sync (Google / Microsoft)", purpose: "Two-way calendar sync (ICS subscription works without it)", env: ["GOOGLE_CALENDAR_CLIENT_ID", "MICROSOFT_CLIENT_ID"], critical: false, docs: "docs/release/RELEASE_READINESS_REPORT.md", implemented: false },
  { key: "virtual", name: "Virtual event provider", purpose: "Ticket-gated online sessions (manual links work now; Zoom/Teams API adapters need their own credentials)", env: [], critical: false, docs: "src/lib/virtual/providers.ts" },
];

export async function readiness(live = false) {
  return Promise.all(INTEGRATIONS.map(async i => {
    const missing = i.env.filter(k => !has(k));
    let status: Readiness = missing.length ? "blocked_external" : "ready";
    let detail = missing.length ? `Missing: ${missing.join(", ")}` : "Configured";
    if (i.implemented === false) { status = "not_implemented"; detail = `${missing.length ? `Missing: ${missing.join(", ")} · ` : "Credentials present · "}no code path uses this integration yet`; }
    else if (!missing.length && i.key === "stripe" && !String(process.env.STRIPE_SECRET_KEY).startsWith("sk_live_")) { status = "sandbox"; detail = "Configured with a TEST key"; }
    if (!missing.length && live && i.check && i.implemented !== false) {
      try { const c = await i.check(); detail = c.detail; if (!c.ok) status = "degraded"; } catch (e) { status = "degraded"; detail = `Check failed: ${(e as Error).message.slice(0, 80)}`; }
    }
    return { key: i.key, name: i.name, purpose: i.purpose, critical: i.critical, status, detail, env: i.env, optionalEnv: i.optionalEnv ?? [], docs: i.docs };
  }));
}
