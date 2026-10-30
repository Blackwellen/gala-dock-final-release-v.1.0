import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { scannerConfigured } from "@/lib/upload-safety";
import { scanStoredObject } from "@/lib/files/service";
import { withObservability } from "@/lib/observability/http";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Background upload safety (release spec §74, Q04). Every new stored object — including anything that reached a bucket without the
 * server upload routes — is checked: magic bytes must match the stored type (public buckets: PNG/JPEG/WebP only), binary images
 * must not carry markup (polyglots), metadata is stripped in place, active PDFs/SVGs are refused and, when the ClamAV gateway is
 * configured, the bytes are scanned. Failures are removed, audited and the uploader notified (src/lib/files/service.ts). Every 5 minutes; time-boxed.
 */
export const POST = withObservability("cron.scan_uploads", async (request: Request) => {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createAdminClient(), db = untyped(admin as never), deadline = Date.now() + 45_000;
  const { data } = await db.rpc("scan_candidates", { p_limit: 40 });
  const out = { scanned: 0, sanitised: 0, removed: 0, errors: 0, scanner: scannerConfigured() };
  for (const o of (data ?? []) as { bucket: string; name: string; mimetype: string; size: number; workspace_id: string | null; user_id: string | null }[]) {
    if (Date.now() > deadline) break;
    try {
      const r = await scanStoredObject(admin, o);
      if (r.result === "removed") out.removed++;
      else if (r.result === "error" || r.result === "retry") out.errors++;
      else { out.scanned++; if ("sanitised" in r && r.sanitised) out.sanitised++; }
    } catch { await db.from("storage_attribution").update({ scan_status: "error", scan_detail: "exception", scanned_at: new Date().toISOString() }).eq("bucket", o.bucket).eq("name", o.name); out.errors++; }
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}, { kind: "worker" });
export const GET = POST;
