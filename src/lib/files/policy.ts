/**
 * File classes, type detection and access rules (Q04, cards 185–188). Pure: no I/O and no `server-only`, so the hostile-fixture
 * tests import it directly. The database mirror is `public.file_access_decision()` (migration 202610291017) — keep them in step.
 *
 * Classes
 *  • public_media    — images shown on public pages (event-media, listing-media, avatars). PNG/JPEG/WebP only, magic-byte checked,
 *                      metadata stripped, never SVG. Uploaded only through the server (`/api/files/public-media`, avatar, listing routes).
 *  • private_image   — images in the private `workspace-files` bucket (message/request attachments, Media Studio assets).
 *  • private_document— PDFs and other documents in `workspace-files`.
 *  • sensitive       — dispute evidence, verification / provider documents, anything holding personal data. Never public.
 *  • derivative      — server-generated thumbnails (re-encoded with sharp, so they carry no original bytes).
 *  • legacy          — rows that predate Q04; PDFs get private_document rules, everything else (images, SVG elements, fonts) private_image rules.
 *
 * Quarantine: a file is downloadable only with a verdict its class accepts. With the ClamAV gateway unconfigured, images that passed
 * magic-byte + sanitising checks are recorded `not_scanned` and stay usable (documented behaviour); private documents and sensitive
 * files fail closed (quarantined) until the gateway returns `clean`.
 */
export type FileClass = "public_media" | "private_image" | "private_document" | "sensitive" | "derivative" | "legacy";
export type AvVerdict = "pending" | "clean" | "infected" | "not_scanned";
export type ScanStatus = "pending" | "clean" | "sanitised" | "infected" | "skipped" | "error" | "quarantined";
export type Sniffed = { ext: "png" | "jpg" | "webp" | "gif" | "pdf" | "svg"; type: string };

export const PUBLIC_BUCKETS = ["event-media", "listing-media", "avatars"] as const;
export const PRIVATE_BUCKET = "workspace-files";
export const PUBLIC_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Per-class byte limits (buckets enforce the same ceilings: avatars 5 MB, others 10 MB). */
export const MAX_BYTES: Record<FileClass, number> = { public_media: 10 * 1024 * 1024, private_image: 10 * 1024 * 1024, private_document: 10 * 1024 * 1024,
  sensitive: 10 * 1024 * 1024, derivative: 2 * 1024 * 1024, legacy: 10 * 1024 * 1024 };

/** Identifies the real file type from its leading bytes; the browser-supplied type and the file name are ignored. */
export function sniff(bytes: Uint8Array): Sniffed | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", type: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", type: "image/webp" };
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { ext: "pdf", type: "application/pdf" };
  if (starts(0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return { ext: "gif", type: "image/gif" };
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return { ext: "svg", type: "image/svg+xml" };
  return null;
}

/** Markup / script markers that must never appear in a binary image's bytes (polyglot defence: e.g. a PNG with an HTML body). */
const MARKUP = /<\s*(script|html|body|iframe|object|embed|svg|meta)\b|javascript:|<\?php/i;
export function looksPolyglot(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024)));
  return MARKUP.test(text);
}

/**
 * Validates an upload for a class: size, magic bytes, declared-vs-real MIME, allowed types, polyglot markers.
 * Returns the sniffed type to store under (the declared type is never trusted).
 */
export function validateUpload(o: { bytes: Uint8Array; declaredType?: string | null; fileClass: FileClass; allowed: string[] }):
  { ok: true; kind: Sniffed } | { ok: false; status: 413 | 415 | 422; code: "too_large" | "empty" | "unknown_type" | "type_not_allowed" | "mime_mismatch" | "polyglot" } {
  if (o.bytes.length === 0) return { ok: false, status: 413, code: "empty" };
  if (o.bytes.length > MAX_BYTES[o.fileClass]) return { ok: false, status: 413, code: "too_large" };
  const kind = sniff(o.bytes);
  if (!kind) return { ok: false, status: 415, code: "unknown_type" };
  if (!o.allowed.includes(kind.type) || (o.fileClass === "public_media" && !PUBLIC_IMAGE_TYPES.includes(kind.type))) return { ok: false, status: 415, code: "type_not_allowed" };
  const declared = (o.declaredType ?? "").toLowerCase().split(";")[0]!.trim();
  if (declared && declared !== "application/octet-stream" && declared !== kind.type && !(declared === "image/jpg" && kind.type === "image/jpeg")) return { ok: false, status: 415, code: "mime_mismatch" };
  if (kind.type !== "image/svg+xml" && kind.type !== "application/pdf" && looksPolyglot(o.bytes)) return { ok: false, status: 422, code: "polyglot" };
  return { ok: true, kind };
}

/** Display name only (storage keys are always server-generated UUIDs): strips directories, traversal, control and reserved characters. */
export function safeFileName(name: string | null | undefined, fallback = "file") {
  const base = String(name ?? "").replace(/\0/g, "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").replace(/^\.+/, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean && !/^\.*$/.test(clean) ? clean : fallback;
}

/** True when a storage key is one the server would generate for this owner: `<owner>/<uuid>.<ext>` or `<owner>/events/<event>/<uuid>.<ext>`. */
export function isOwnedKey(key: string, ownerId: string) {
  if (key.includes("..") || key.includes("\\") || key.includes("//") || key.startsWith("/")) return false;
  return new RegExp(`^${ownerId}/(?:events/[0-9a-f-]{36}/)?[0-9a-f-]{36}(?:\\.(?:png|jpg|webp|gif|pdf|svg))?$`).test(key);
}

/** Tenant-scoped object key for R2 / Storage: `t/<workspace|personal>/<owner>/<uuid>.<ext>`. */
export function tenantKey(o: { workspaceId: string | null; ownerId: string; fileId: string; ext: string }) {
  const uuid = /^[0-9a-f-]{36}$/;
  if (!uuid.test(o.ownerId) || !uuid.test(o.fileId) || (o.workspaceId && !uuid.test(o.workspaceId)) || !/^[a-z0-9]{2,5}$/.test(o.ext)) throw new Error("invalid_file_key");
  return `t/${o.workspaceId ?? "personal"}/${o.ownerId}/${o.fileId}.${o.ext}`;
}

export function classForMime(fileClass: FileClass, mime: string): Exclude<FileClass, "legacy"> {
  if (fileClass !== "legacy") return fileClass;
  return mime === "application/pdf" ? "private_document" : "private_image";   // legacy: only documents fail closed (SVG elements, GIF, fonts keep image rules)
}

/** Download/publish decision — mirror of public.file_access_decision(). */
export function accessDecision(f: { fileClass: FileClass; mime: string; av: AvVerdict; scan: ScanStatus; deleted?: boolean }):
  "ok" | "deleted" | "infected" | "quarantined" | "pending" {
  if (f.deleted) return "deleted";
  if (f.av === "infected" || f.scan === "infected") return "infected";
  if (f.scan === "quarantined") return "quarantined";
  const c = classForMime(f.fileClass, f.mime);
  if (f.av === "clean") return "ok";
  if (f.av === "pending" || f.scan === "pending" || f.scan === "error") return c === "private_document" || c === "sensitive" ? "quarantined" : "pending";
  // not_scanned (gateway not configured): sanitised, magic-byte-verified images are usable; documents/sensitive fail closed.
  return c === "private_document" || c === "sensitive" ? "quarantined" : "ok";
}
