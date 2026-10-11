import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Minimal Cloudflare R2 client (S3 API, AWS Signature V4) — no SDK dependency. Environment contract:
 * CLOUDFLARE_R2_S3_API (https://<account>.r2.cloudflarestorage.com), CLOUDFLARE_R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 */
export const r2Configured = () => Boolean(process.env.CLOUDFLARE_R2_S3_API && process.env.CLOUDFLARE_R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const hmac = (k: string | Buffer, s: string) => createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function r2(method: "GET" | "PUT" | "HEAD" | "DELETE", key: string, opts: { body?: Buffer; query?: Record<string, string>; contentType?: string } = {}) {
  if (!r2Configured()) throw new Error("r2_not_configured");
  const endpoint = new URL(process.env.CLOUDFLARE_R2_S3_API!.replace(/\/+$/, ""));
  const host = endpoint.host, bucket = process.env.CLOUDFLARE_R2_BUCKET!;
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
  return fetch(`${endpoint.origin}${path}${qs ? `?${qs}` : ""}`, { method, headers: { ...headers, authorization: auth }, body: opts.body ? new Uint8Array(opts.body) : undefined, signal: AbortSignal.timeout(60_000) });
}

export async function r2Put(key: string, body: Buffer, contentType = "application/octet-stream") {
  const r = await r2("PUT", key, { body, contentType }); if (!r.ok) throw new Error(`r2_put_${r.status}`); return r.headers.get("etag");
}
export async function r2Head(key: string) { const r = await r2("HEAD", key); return r.ok ? { size: Number(r.headers.get("content-length") ?? 0), etag: r.headers.get("etag") } : null; }
export async function r2Get(key: string) { const r = await r2("GET", key); if (!r.ok) throw new Error(`r2_get_${r.status}`); return Buffer.from(await r.arrayBuffer()); }
export async function r2Delete(key: string) { const r = await r2("DELETE", key); if (!r.ok && r.status !== 404) throw new Error(`r2_delete_${r.status}`); }
/** Bucket reachability check for health (lists at most one key). */
export async function r2Ping() { const t0 = Date.now(); const r = await r2("GET", "", { query: { "list-type": "2", "max-keys": "1" } }); return { ok: r.ok, status: r.status, ms: Date.now() - t0 }; }
