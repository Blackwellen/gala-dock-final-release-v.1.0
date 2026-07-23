// Gala Dock — Cloudflare R2 storage (V1-2 Phase 7 / document intelligence foundation). Server-only.
// R2 is S3-compatible. This module centralises config + key helpers so document upload/read flows
// (Copilot Document Agent, event files, generated PDFs) are workspace/record-scoped and signed.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicUrl: string;
}

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: process.env.R2_BUCKET ?? "gala-dock",
    endpoint: process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`,
    publicUrl: process.env.R2_PUBLIC_URL ?? "",
  };
}

export function r2Configured(): boolean {
  return r2Config() !== null;
}

/** Resolve a stored object key (or an already-absolute URL) into a displayable public URL.
 *  Public marketing pages (event hero/gallery images) store R2 object keys, not full URLs —
 *  this is the single place that turns a key into something an <img> can load. Returns null
 *  when there's nothing to resolve (no key, or R2 has no public base URL configured). */
export function r2PublicUrl(pathOrKey: string | null | undefined): string | null {
  if (!pathOrKey) return null;
  if (/^https?:\/\//i.test(pathOrKey)) return pathOrKey;
  const base = r2Config()?.publicUrl;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${pathOrKey.replace(/^\//, "")}`;
}

/** Build a workspace/record-scoped object key. Never trust client-supplied paths. */
export function r2Key(parts: { workspaceId: string; kind: string; recordId?: string; filename: string }): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
  const segs = [safe(parts.workspaceId), safe(parts.kind)];
  if (parts.recordId) segs.push(safe(parts.recordId));
  segs.push(`${Date.now()}-${safe(parts.filename)}`);
  return segs.join("/");
}

function makeS3Client(cfg: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/** Generate a presigned PUT URL for a direct browser-to-R2 upload.
 *  Expires in 5 minutes. Never trust client-supplied keys — always call r2Key() server-side. */
export async function r2PresignedPut(opts: {
  key: string;
  contentType: string;
  maxBytes?: number;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string }> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");

  const s3 = makeS3Client(cfg);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    // ContentLength enforcement is handled by the R2 bucket policy or CORS policy
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: opts.expiresIn ?? 300, // 5 minutes
  });

  const publicUrl = cfg.publicUrl
    ? `${cfg.publicUrl.replace(/\/$/, "")}/${opts.key}`
    : "";

  return { uploadUrl, objectKey: opts.key, publicUrl };
}

/** Directly upload server-generated content (e.g. a payroll export CSV or a
 *  remittance/receipt document rendered on the server) — no round trip
 *  through a presigned URL since there's no browser involved. */
export async function r2PutObject(opts: {
  key: string;
  body: string | Uint8Array;
  contentType: string;
}): Promise<{ objectKey: string; publicUrl: string }> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");

  const s3 = makeS3Client(cfg);
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    })
  );

  const publicUrl = cfg.publicUrl ? `${cfg.publicUrl.replace(/\/$/, "")}/${opts.key}` : "";
  return { objectKey: opts.key, publicUrl };
}

/** Generate a presigned GET URL so a private object (e.g. a supplier
 *  compliance document) can be previewed/downloaded without a public bucket
 *  URL. Expires in 5 minutes by default. Callers must verify the caller is
 *  entitled to the object's workspace/record scope before calling this —
 *  this function itself does no authorization. */
export async function r2PresignedGet(opts: { key: string; expiresIn?: number }): Promise<string> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");

  const s3 = makeS3Client(cfg);
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: opts.key });

  return getSignedUrl(s3, command, { expiresIn: opts.expiresIn ?? 300 });
}
