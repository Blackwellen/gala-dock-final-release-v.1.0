import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { r2Configured, r2Put, r2Delete } from "@/lib/r2";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/** Storage → R2 replication worker (release spec §92/§132). Every 15 minutes; a no-op once caught up. Time-boxed to ~45 s per run. */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!r2Configured()) return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  const admin = createAdminClient(), db = untyped(admin as never), deadline = Date.now() + 45_000;
  let copied = 0, failed = 0, expired = 0;
  const { data } = await db.rpc("storage_backup_candidates", { p_limit: 200 });
  for (const o of (data ?? []) as { bucket: string; name: string; updated_at: string; size: number; mimetype: string }[]) {
    if (Date.now() > deadline) break;
    try {
      const file = await admin.storage.from(o.bucket).download(o.name);
      if (file.error || !file.data) throw new Error(file.error?.message ?? "download_failed");
      const etag = await r2Put(`storage/${o.bucket}/${o.name}`, Buffer.from(await file.data.arrayBuffer()), o.mimetype);
      await db.from("storage_backups").upsert({ bucket: o.bucket, name: o.name, object_updated_at: o.updated_at, size: o.size, r2_etag: etag, backed_up_at: new Date().toISOString(), source_deleted_at: null });
      copied++;
    } catch { failed++; }
  }
  const { data: old } = await db.rpc("storage_backup_expired", { p_limit: 200 });
  for (const o of (old ?? []) as { bucket: string; name: string }[]) {
    if (Date.now() > deadline) break;
    try { await r2Delete(`storage/${o.bucket}/${o.name}`); await db.from("storage_backups").delete().eq("bucket", o.bucket).eq("name", o.name); expired++; } catch { /* retried next run */ }
  }
  return NextResponse.json({ configured: true, copied, failed, expired }, { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
