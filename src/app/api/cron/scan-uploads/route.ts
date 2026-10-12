import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { sanitize, scan, scannerConfigured } from "@/lib/upload-safety";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Background upload safety (release spec §74). Every new stored object is sanitised (image metadata stripped and written back in place;
 * PDFs with active content removed) and, when the ClamAV scanner is configured, malware-scanned. Infected or active files are deleted,
 * audited and the uploader is notified. Runs every 5 minutes; time-boxed.
 */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createAdminClient(), db = untyped(admin as never), deadline = Date.now() + 45_000, configured = scannerConfigured();
  const { data } = await db.rpc("scan_candidates", { p_limit: 40 });
  const out = { scanned: 0, sanitised: 0, removed: 0, errors: 0, scanner: configured };
  for (const o of (data ?? []) as { bucket: string; name: string; mimetype: string; size: number; workspace_id: string | null; user_id: string | null }[]) {
    if (Date.now() > deadline) break;
    const mark = (scan_status: string, scan_detail: string | null = null) => db.from("storage_attribution").update({ scan_status, scan_detail, scanned_at: new Date().toISOString() }).eq("bucket", o.bucket).eq("name", o.name);
    try {
      const file = await admin.storage.from(o.bucket).download(o.name);
      if (file.error || !file.data) { await mark("error", "download_failed"); out.errors++; continue; }
      const original = new Uint8Array(await file.data.arrayBuffer());
      const s = sanitize(original, o.mimetype);
      const v = s.ok ? await scan(s.bytes) : s;
      if (!v.ok && v.reason !== "scanner_unavailable") {
        await admin.storage.from(o.bucket).remove([o.name]);
        await mark("infected", v.detail ?? v.reason);
        await db.from("audit_events").insert({ actor_type: "system", workspace_id: o.workspace_id, event: "upload.blocked", metadata: { bucket: o.bucket, name: o.name, reason: v.reason, detail: v.detail ?? null } });
        if (o.user_id) await db.from("notifications").insert({ user_id: o.user_id, kind: "security", title: "A file you uploaded was removed",
          body: v.reason === "infected" ? "Our malware scanner flagged it. If you think this is a mistake, contact support." : "It contained active content (for example scripts in a PDF), which we don’t accept.", link: "/help/security-mfa" });
        out.removed++; continue;
      }
      if (!v.ok) { out.errors++; continue; }   // scanner temporarily down: retried next run
      const changed = s.ok && s.bytes.length !== original.length;
      if (changed) {
        const up = await admin.storage.from(o.bucket).update(o.name, new Uint8Array(s.bytes), { contentType: o.mimetype, upsert: true });
        if (up.error) { await mark("error", "rewrite_failed"); out.errors++; continue; }
        out.sanitised++;
      }
      await mark(configured ? (changed ? "sanitised" : "clean") : (changed ? "sanitised" : "skipped"), configured ? null : "scanner_not_configured");
      out.scanned++;
    } catch { await mark("error", "exception"); out.errors++; }
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
