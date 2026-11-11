import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * BW-HMAC-SHA256-V1, the Blackwellen request signature (blackwellen-operations ops/lib/bwlib/hmacsig.py; same code as Gigvora's
 * src/lib/ops/bw-hmac.ts):
 *   canonical = "BW-HMAC-SHA256-V1\n<key_id>\n<unix ts>\n<nonce>\n<METHOD>\n<path?query>\n<hex sha256(body)>"
 *   headers   = X-BW-Key-Id, X-BW-Timestamp, X-BW-Nonce, X-BW-Signature: v1=<hex hmac-sha256(secret bytes, canonical)>
 * Used for Watchtower readiness probes into Gala Dock (verify, key `watchtower-gala_dock`) and Gala Dock events out to the
 * Blackwellen event bus (sign, key `gala_dock-events`).
 */
const ALGO = "BW-HMAC-SHA256-V1";
export type BwKey = { keyId: string; secret: Buffer };

const sha256Hex = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const canonical = (k: string, ts: string, nonce: string, method: string, target: string, body: Uint8Array) =>
  [ALGO, k, ts, nonce, method.toUpperCase(), target, sha256Hex(body)].join("\n");

/** A key from env names (hex secret, 32+ bytes). Null when not configured, so callers stay dormant. */
export function bwKey(keyId: string | undefined, secretHex: string | undefined): BwKey | null {
  const hex = secretHex?.trim();
  if (!keyId || !hex || !/^[0-9a-f]{64,}$/i.test(hex) || hex.length % 2) return null;
  return { keyId, secret: Buffer.from(hex, "hex") };
}

export function bwSign(key: BwKey, method: string, target: string, body: Uint8Array, now = Date.now(), nonce = randomBytes(16).toString("hex")) {
  const ts = String(Math.floor(now / 1000));
  const sig = createHmac("sha256", key.secret).update(canonical(key.keyId, ts, nonce, method, target, body), "utf8").digest("hex");
  return { "X-BW-Key-Id": key.keyId, "X-BW-Timestamp": ts, "X-BW-Nonce": nonce, "X-BW-Signature": `v1=${sig}` };
}

export type BwVerdict = { ok: true; nonce: string } | { ok: false; reason: "missing" | "key" | "stale" | "signature" };

/** Checks key id, a ±300 s timestamp window and the signature in constant time. The caller must also reject a reused nonce. */
export function bwVerify(key: BwKey, method: string, target: string, body: Uint8Array, h: Headers, now = Date.now()): BwVerdict {
  const kid = h.get("x-bw-key-id"), ts = h.get("x-bw-timestamp"), nonce = h.get("x-bw-nonce"), sig = h.get("x-bw-signature");
  if (!kid || !ts || !nonce || !sig || !/^\d{9,11}$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { ok: false, reason: "missing" };
  if (kid !== key.keyId) return { ok: false, reason: "key" };
  if (Math.abs(now / 1000 - Number(ts)) > 300) return { ok: false, reason: "stale" };
  const want = Buffer.from("v1=" + createHmac("sha256", key.secret).update(canonical(kid, ts, nonce, method, target, body), "utf8").digest("hex"));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "signature" };
  return { ok: true, nonce };
}
