import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { clientIp, rateLimit } from "@/lib/security";

/**
 * Q45: receiver for the staged Content-Security-Policy-Report-Only header (src/proxy.ts, CSP_REPORT_ONLY=1).
 * Logs the violated directive and the blocked origin only (never full URLs, query strings or page content) so the policy can be
 * tightened before it is enforced. 8 KB body cap, 60 reports per visitor per minute; always 204.
 */
const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
const origin = (v: unknown) => { try { return typeof v === "string" && v ? (/^[a-z-]+$/i.test(v) ? v : new URL(v).origin) : ""; } catch { return "invalid"; } };

export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (!text || text.length > 8192) return done();
  const ip = createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32);
  if (!(await rateLimit(`csp-report:${ip}`, 60, 60))) return done();
  let reports: Record<string, unknown>[] = [];
  try {
    const body = JSON.parse(text) as unknown;
    reports = (Array.isArray(body) ? body.map(r => (r as { body?: Record<string, unknown> }).body ?? {}) : [((body as { "csp-report"?: Record<string, unknown> })["csp-report"] ?? {})]).slice(0, 10);
  } catch { return done(); }
  for (const r of reports) {
    console.warn("[csp-report]", JSON.stringify({ directive: String(r["effective-directive"] ?? r["violated-directive"] ?? r.effectiveDirective ?? "").slice(0, 60),
      blocked: origin(r["blocked-uri"] ?? r.blockedURL), page: (() => { try { return new URL(String(r["document-uri"] ?? r.documentURL)).pathname.split("/").slice(0, 2).join("/").slice(0, 60); /* first segment only: token links never reach logs */ } catch { return ""; } })() }));
  }
  return done();
}
