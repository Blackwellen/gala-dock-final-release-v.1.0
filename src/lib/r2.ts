import "server-only";
import { createHash, createHmac } from "node:crypto";
import { presignR2 } from "@/lib/files/presign";

/**
 * Minimal Cloudflare R2 client (S3 API, AWS Signature V4) — no SDK dependency. Environment contract:
 * CLOUDFLARE_R2_S3_API (https://<account>.r2.cloudflarestorage.com), CLOUDFLARE_R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 */
export const r2Configured = () => Boolean(process.env.CLOUDFLARE_R2_S3_API && process.env.CLOUDFLARE_R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const hmac = (k: string | Buffer, s: string) => createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Buckets created with a data-location jurisdiction (e.g. EU) are only reachable on the jurisdiction host
 * (<account>.eu.r2.cloudflarestorage.com) and don't appear on the default endpoint. Honour CLOUDFLARE_R2_JURISDICTION when set;
 * otherwise probe the configured host and fall back to the EU host on NoSuchBucket. The result is cached per server instance.
 */
let resolvedHost: string | null = null;
const jurisdictionHost = (host: string, j: string) => host.replace(/^([^.]+)\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com$/, `$1.${j}.r2.cloudflarestorage.com`);
async function bucketHost(): Promise<string> {
  if (resolvedHost) return resolvedHost;
  const configured = new URL(process.env.CLOUDFLARE_R2_S3_API!.replace(/\/+$/, "")).host;
  const j = process.env.CLOUDFLARE_R2_JURISDICTION?.trim().toLowerCase();
  if (j && j !== "default") return (resolvedHost = jurisdictionHost(configured, j));
  for (const host of [configured, jurisdictionHost(configured, "eu")]) {
    const r = await signed("GET", host, "", { query: { "list-type": "2", "max-keys": "1" } });
    if (r.status !== 404) return (resolvedHost = host);
  }
  return (resolvedHost = configured);
}

async function r2(method: "GET" | "PUT" | "HEAD" | "DELETE", key: string, opts: { body?: Buffer; query?: Record<string, string>; contentType?: string } = {}) {
  if (!r2Configured()) throw new Error("r2_not_configured");
  return signed(method, await bucketHost(), key, opts);
}

async function signed(method: "GET" | "PUT" | "HEAD" | "DELETE", host: string, key: string, opts: { body?: Buffer; query?: Record<string, string>; contentType?: string } = {}) {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!;
  const path = `/${bucket}${key ? `/${key.split("/").map(enc).join("/")}` : ""}`;
  const qs = Object.entries(opts.query ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const now = new Date(), amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8);
  const payloadHash = sha(opts.body ?? "");
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amz, ...(opts.contentType ? { "content-type": opts.contentType } : {}) };
  const signed = Object.keys(headers).sort();
  const canonicalHeaders = signed.map(h => `${h}:${headers[h]}\n`).join("");   // ends with \n; the join below adds the blank line
  const canonical = [method, path, qs, canonicalHeaders, signed.join(";"), payloadHash].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n");
  const kSign = hmac(hmac(hmac(hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, day), "auto"), "s3"), "aws4_request");
  const sig = createHmac("sha256", kSign).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${sig}`;
  return fetch(`https://${host}${path}${qs ? `?${qs}` : ""}`, { method, headers: { ...headers, authorization: auth }, body: opts.body ? new Uint8Array(opts.body) : undefined, signal: AbortSignal.timeout(60_000) });
}

export async function r2Put(key: string, body: Buffer, contentType = "application/octet-stream") {
  const r = await r2("PUT", key, { body, contentType }); if (!r.ok) throw new Error(`r2_put_${r.status}`); return r.headers.get("etag");
}
export async function r2Head(key: string) { const r = await r2("HEAD", key); return r.ok ? { size: Number(r.headers.get("content-length") ?? 0), etag: r.headers.get("etag") } : null; }
export async function r2Get(key: string) { const r = await r2("GET", key); if (!r.ok) throw new Error(`r2_get_${r.status}`); return Buffer.from(await r.arrayBuffer()); }
export async function r2Delete(key: string) { const r = await r2("DELETE", key); if (!r.ok && r.status !== 404) throw new Error(`r2_delete_${r.status}`); }
/** Bucket reachability check for health (lists at most one key). */
export async function r2Ping() { const t0 = Date.now(); const r = await r2("GET", "", { query: { "list-type": "2", "max-keys": "1" } }); return { ok: r.ok, status: r.status, ms: Date.now() - t0 }; }

/**
 * Q04 presigned URL for one tenant-scoped key (see tenantKey in src/lib/files/policy.ts). Resolves the jurisdiction host like the
 * signed client. Caller authorises the actor first; expiry is capped at 15 minutes.
 */
export async function r2PresignedUrl(method: "GET" | "PUT", key: string, expiresSeconds = 300, contentType?: string) {
  if (!r2Configured()) throw new Error("r2_not_configured");
  const host = await bucketHost();
  return presignR2({ endpoint: `https://${host}`, bucket: process.env.CLOUDFLARE_R2_BUCKET!, accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    { method, key, expiresSeconds, contentType });
}
