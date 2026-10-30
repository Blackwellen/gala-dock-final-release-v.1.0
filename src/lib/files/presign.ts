import { createHash, createHmac } from "node:crypto";

/**
 * Presigned R2 (S3 API, SigV4 query auth) URLs for direct, short-lived upload/download (Q04). Pure: credentials are passed in, so
 * tests can verify scoping/expiry offline. Callers must authorise the actor first and only sign tenant-scoped keys
 * (`tenantKey()` in ./policy) — a URL grants exactly one method on one key until it expires (max 15 minutes here).
 */
export type R2Creds = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (k: string | Buffer, s: string) => createHmac("sha256", k).update(s).digest();

export function presignR2(c: R2Creds, o: { method: "GET" | "PUT" | "DELETE"; key: string; expiresSeconds?: number; now?: Date; contentType?: string }) {
  const expires = Math.min(900, Math.max(1, Math.floor(o.expiresSeconds ?? 300)));
  if (!o.key || o.key.startsWith("/") || o.key.includes("..") || o.key.includes("\\")) throw new Error("invalid_key");
  const host = new URL(c.endpoint.replace(/\/+$/, "")).host;
  const now = o.now ?? new Date(), amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = `/${c.bucket}/${o.key.split("/").map(enc).join("/")}`;
  const signedHeaders = o.contentType ? "content-type;host" : "host";
  const query: Record<string, string> = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${c.accessKeyId}/${scope}`, "X-Amz-Date": amz,
    "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": signedHeaders };
  const qs = Object.keys(query).sort().map(k => `${enc(k)}=${enc(query[k]!)}`).join("&");
  const headers = o.contentType ? `content-type:${o.contentType}\nhost:${host}\n` : `host:${host}\n`;
  const canonical = [o.method, path, qs, headers, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, day), "auto"), "s3"), "aws4_request");
  const sig = createHmac("sha256", key).update(toSign).digest("hex");
  return { url: `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`, expiresAt: new Date(now.getTime() + expires * 1000).toISOString(), method: o.method, key: o.key };
}
