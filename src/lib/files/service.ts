import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { sanitize, scan, scannerConfigured } from "@/lib/upload-safety";
import { looksPolyglot, PUBLIC_BUCKETS, sniff, PUBLIC_IMAGE_TYPES, type FileClass } from "./policy";

/**
 * Files service (Q04). Every server upload path ends in `registerFile` (canonical metadata on storage_attribution) and every private
 * download goes through `gate` (public.file_access_decision) before a short-lived signed URL is issued. Async work → job_queue.
 */
type Admin = ReturnType<typeof createAdminClient>;
const db = (a: Admin) => untyped(a as never);
export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Classes that fail closed without a clean ClamAV verdict. */
export const FAIL_CLOSED: FileClass[] = ["private_document", "sensitive"];

export async function registerFile(admin: Admin, o: { bucket: string; name: string; fileClass: Exclude<FileClass, "legacy">; sniffed: string; declared?: string | null;
  bytes: Uint8Array; displayName: string; retentionDays?: number | null }) {
  const scanned = scannerConfigured();
  const quarantine = !scanned && FAIL_CLOSED.includes(o.fileClass);
  const { data, error } = await db(admin).rpc("file_register", { p_bucket: o.bucket, p_name: o.name, p_class: o.fileClass, p_sniffed: o.sniffed, p_declared: o.declared ?? null,
    p_sha256: sha256(o.bytes), p_size: o.bytes.length, p_display_name: o.displayName, p_av: scanned ? "clean" : "not_scanned", p_quarantine: quarantine,
    p_reason: quarantine ? "awaiting_scan:scanner_not_configured" : null, p_retention_days: o.retentionDays ?? null });
  if (error) throw new Error(`file_register: ${error.message}`);
  return data as { decision: string; scan: string; av: string };
}

export type Decision = "ok" | "deleted" | "infected" | "quarantined" | "pending" | "unknown";
export async function decision(admin: Admin, bucket: string, name: string): Promise<Decision> {
  const { data, error } = await db(admin).rpc("file_access_decision", { p_bucket: bucket, p_name: name });
  if (error) return "unknown";
  return (data as Decision) ?? "unknown";
}

/** Download gate for routes that already authorised the caller: null = allowed; otherwise the response to return. */
export async function gate(admin: Admin, bucket: string, name: string): Promise<NextResponse | null> {
  const d = await decision(admin, bucket, name);
  if (d === "ok") return null;
  const headers = { "Cache-Control": "private, no-store" };
  if (d === "quarantined" || d === "pending") return NextResponse.json({ error: "This file is still being checked for malware. Try again later.", status: d }, { status: 423, headers });
  if (d === "infected" || d === "deleted") return NextResponse.json({ error: "This file is no longer available.", status: d }, { status: 410, headers });
  return NextResponse.json({ error: "File not found" }, { status: 404, headers });
}

export async function enqueue(admin: Admin, kind: "files.scan" | "files.derive" | "files.delete_object", payload: Record<string, unknown>, dedupe: string) {
  const { error } = await db(admin).rpc("enqueue_job", { p_kind: kind, p_payload: payload, p_dedupe_key: dedupe });
  if (error) console.error("files_enqueue_failed", kind, error.message);
}

/**
 * Scans one stored object (cron sweep and the files.scan job): download → magic bytes vs stored type → polyglot markers (binary
 * images) → sanitise (rewrite in place when metadata was stripped) → ClamAV. Infected / mismatched / active objects are removed,
 * audited and the uploader notified. Gateway down → retried later; gateway not configured → recorded not_scanned
 * (fail-closed classes stay quarantined).
 */
export async function scanStoredObject(admin: Admin, o: { bucket: string; name: string; mimetype: string; workspace_id?: string | null; user_id?: string | null }) {
  const configured = scannerConfigured();
  const file = await admin.storage.from(o.bucket).download(o.name);
  if (file.error || !file.data) { await db(admin).from("storage_attribution").update({ scan_status: "error", scan_detail: "download_failed", scanned_at: new Date().toISOString() }).eq("bucket", o.bucket).eq("name", o.name); return { result: "error" as const }; }
  const original = new Uint8Array(await file.data.arrayBuffer());
  const kind = sniff(original);
  const isPublic = (PUBLIC_BUCKETS as readonly string[]).includes(o.bucket);
  let blocked: { reason: string; detail: string } | null = null;
  if (!kind || kind.type !== o.mimetype.toLowerCase().replace("image/jpg", "image/jpeg")) blocked = { reason: "mime_mismatch", detail: `stored as ${o.mimetype}, bytes are ${kind?.type ?? "unknown"}` };
  else if (isPublic && !PUBLIC_IMAGE_TYPES.includes(kind.type)) blocked = { reason: "type_not_allowed", detail: kind.type };
  else if (kind.type !== "image/svg+xml" && kind.type !== "application/pdf" && looksPolyglot(original)) blocked = { reason: "polyglot", detail: "markup inside a binary image" };
  const s = blocked ? null : sanitize(original, kind!.type);
  if (s && !s.ok) blocked = { reason: s.reason, detail: s.detail ?? s.reason };
  let verdict: "clean" | "not_scanned" = "not_scanned";
  if (!blocked && s?.ok && configured) {
    const v = await scan(s.bytes);
    if (!v.ok && v.reason === "scanner_unavailable") return { result: "retry" as const };
    if (!v.ok) blocked = { reason: "infected", detail: v.detail ?? "infected" }; else verdict = "clean";
  }
  if (blocked) {
    // Verdict first (the delete trigger moves the facts to file_tombstones), then remove the object so it is no longer reachable.
    await db(admin).rpc("file_record_verdict", { p_bucket: o.bucket, p_name: o.name, p_verdict: "infected", p_detail: `${blocked.reason}: ${blocked.detail}`.slice(0, 200), p_sha256: sha256(original) });
    const rm = await admin.storage.from(o.bucket).remove([o.name]);
    if (rm.error) throw new Error(`remove_failed: ${rm.error.message}`);
    await db(admin).from("audit_events").insert({ actor_type: "system", workspace_id: o.workspace_id ?? null, event: "upload.blocked", metadata: { bucket: o.bucket, name: o.name, reason: blocked.reason } });
    if (o.user_id) await db(admin).from("notifications").insert({ user_id: o.user_id, kind: "security", title: "A file you uploaded was removed",
      body: blocked.reason === "infected" ? "Our malware scanner flagged it. If you think this is a mistake, contact support." : "It wasn’t a valid image or document, or it contained active content, which we don’t accept.", link: "/help/security-mfa" });
    return { result: "removed" as const, reason: blocked.reason };
  }
  const changed = !!s?.ok && s.bytes.length !== original.length;
  if (changed && s?.ok) {
    const up = await admin.storage.from(o.bucket).update(o.name, new Uint8Array(s.bytes), { contentType: kind!.type, upsert: true });
    if (up.error) { await db(admin).from("storage_attribution").update({ scan_status: "error", scan_detail: "rewrite_failed" }).eq("bucket", o.bucket).eq("name", o.name); return { result: "error" as const }; }
  }
  await db(admin).rpc("file_record_verdict", { p_bucket: o.bucket, p_name: o.name, p_verdict: verdict, p_detail: verdict === "not_scanned" ? "scanner_not_configured" : null, p_sha256: sha256(s && s.ok ? s.bytes : original) });
  return { result: verdict, sanitised: changed };
}

/** Thumbnail derivative: re-encode through sharp (metadata-free WebP, max 480 px). Unavailable sharp → permanent failure. */
export async function deriveThumbnail(admin: Admin, o: { bucket: string; name: string }) {
  if (!(PUBLIC_BUCKETS as readonly string[]).includes(o.bucket)) throw new Error("derive_public_media_only");
  if ((await decision(admin, o.bucket, o.name)) !== "ok") return { skipped: "not_released" };
  const file = await admin.storage.from(o.bucket).download(o.name);
  if (file.error || !file.data) throw new Error("derive_download_failed");
  const sharp = (await import("sharp")).default;
  const out = await sharp(Buffer.from(await file.data.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const thumb = `${o.name.replace(/\.[a-z0-9]+$/i, "")}.thumb.webp`;
  const up = await admin.storage.from(o.bucket).upload(thumb, new Uint8Array(out), { contentType: "image/webp", upsert: true });
  if (up.error) throw new Error(`derive_upload_failed: ${up.error.message}`);
  await db(admin).from("storage_attribution").update({ file_class: "derivative", derived_from_bucket: o.bucket, derived_from_name: o.name, variant: "thumb_480",
    sniffed_mime: "image/webp", sha256: sha256(out), size_bytes: out.length, av_verdict: "clean", scan_status: "clean", scanned_at: new Date().toISOString() }).eq("bucket", o.bucket).eq("name", thumb);
  return { thumb, bytes: out.length, url: admin.storage.from(o.bucket).getPublicUrl(thumb).data.publicUrl };
}

/** Removes one object through the Storage API and stamps deleted_at (legal hold refuses). Idempotent. */
export async function deleteObject(admin: Admin, o: { bucket: string; name: string; reason: string }) {
  const { data: row } = await db(admin).from("storage_attribution").select("legal_hold,deleted_at").eq("bucket", o.bucket).eq("name", o.name).maybeSingle();
  if (row?.legal_hold) return { skipped: "legal_hold" };
  if (row?.deleted_at) return { skipped: "already_deleted" };
  await db(admin).rpc("file_mark_deleted", { p_bucket: o.bucket, p_name: o.name, p_reason: o.reason });   // gate closes first (decision 'deleted')
  const r = await admin.storage.from(o.bucket).remove([o.name]);
  if (r.error) throw new Error(`delete_failed: ${r.error.message}`);
  return { deleted: true };
}

/** Server-side public media upload (replaces browser → public bucket uploads). Caller has checked workspace membership. */
export async function storePublicMedia(admin: Admin, o: { workspaceId: string; bytes: Uint8Array; type: string; ext: string; displayName: string; userId: string }) {
  const name = `${o.workspaceId}/${randomUUID()}.${o.ext}`;
  const up = await admin.storage.from("event-media").upload(name, o.bytes, { contentType: o.type, upsert: false });
  if (up.error) return { error: up.error.message };
  await db(admin).from("storage_attribution").update({ user_id: o.userId }).eq("bucket", "event-media").eq("name", name);
  await registerFile(admin, { bucket: "event-media", name, fileClass: "public_media", sniffed: o.type, declared: o.type, bytes: o.bytes, displayName: o.displayName });
  await enqueue(admin, "files.derive", { bucket: "event-media", name }, `files.derive:event-media/${name}`);
  return { name, url: admin.storage.from("event-media").getPublicUrl(name).data.publicUrl };
}
