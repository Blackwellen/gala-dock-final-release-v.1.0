import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ticket entry credentials (§51, §73 of the media spec). The QR never contains a guessable ticket id on its own:
 *  - Wallet:  GD2.<ticketId>.<window>.<sig>  — rotates every 30s; sig = HMAC(secret, "w|id|nonce|window"). Accepts ±2 windows of clock skew.
 *  - Print:   GD2P.<ticketId>.<sig>          — static for PDFs/print/barcode; sig = HMAC(secret, "p|id|nonce") (print_epoch 0) or
 *             HMAC(secret, "p|id|nonce|e<epoch>"). Only issued when the event allows printing. Bumping print_epoch
 *             (reissue_ticket_credentials scope 'print') kills printed copies without touching the wallet code.
 *  - Badge:   GD2B.<passId>.<sig>            — access pass / badge (Q18); sig = HMAC(secret, "b|id|nonce"). Revoking a pass rotates its nonce.
 * Wallet and print are bound to the ticket's current qr_nonce, which the database rotates on every refund, transfer, resale,
 * cancellation and holder change (tickets_credential_rotate) — so every older credential dies. Signing domains (w|, p|, b|, s|)
 * never overlap, so one kind of credential can't be replayed as another.
 * Legacy "GD1:<code>:<nonce>" payloads from earlier wallets are still accepted (the nonce check applies).
 */
const WINDOW_SECONDS = 30;
const SKEW = 2;
const b64 = (b: Buffer) => b.toString("base64url");
const uuidToB64 = (id: string) => b64(Buffer.from(id.replace(/-/g, ""), "hex"));
const b64ToUuid = (s: string) => { const h = Buffer.from(s, "base64url").toString("hex"); return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : null; };

function secret() {
  const s = process.env.TICKET_QR_SECRET;
  if (!s || s.length < 32) throw new Error("ticket_secret_not_configured");
  return s;
}
const sign = (msg: string) => b64(createHmac("sha256", secret()).update(msg).digest().subarray(0, 16));
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const currentWindow = (now = Date.now()) => Math.floor(now / 1000 / WINDOW_SECONDS);

export function walletCredential(ticketId: string, nonce: string, now = Date.now()) {
  const w = currentWindow(now);
  return { payload: `GD2.${uuidToB64(ticketId)}.${w.toString(36)}.${sign(`w|${ticketId}|${nonce}|${w}`)}`, expiresInMs: (w + 1) * WINDOW_SECONDS * 1000 - now };
}
const printMsg = (ticketId: string, nonce: string, epoch: number) => epoch > 0 ? `p|${ticketId}|${nonce}|e${epoch}` : `p|${ticketId}|${nonce}`;
export function printCredential(ticketId: string, nonce: string, epoch = 0) {
  return `GD2P.${uuidToB64(ticketId)}.${sign(printMsg(ticketId, nonce, epoch))}`;
}
export function badgeCredential(passId: string, nonce: string) {
  return `GD2B.${uuidToB64(passId)}.${sign(`b|${passId}|${nonce}`)}`;
}
/** Offline check for printed codes: a scanner holding the snapshot compares SHA-256(sig) prefixes; the signature itself never ships. */
export function printFingerprint(ticketId: string, nonce: string, epoch = 0) {
  return createHash("sha256").update(sign(printMsg(ticketId, nonce, epoch))).digest("base64url").slice(0, 16);
}
/** Offline allow-list snapshot signature (separate domain). */
export function signSnapshot(canonical: string) { return b64(createHmac("sha256", secret()).update(`s|${canonical}`).digest()); }
export function verifySnapshot(canonical: string, signature: string) { return same(signature, signSnapshot(canonical)); }

export type Parsed =
  | { kind: "wallet"; ticketId: string; window: number; sig: string }
  | { kind: "print"; ticketId: string; sig: string }
  | { kind: "badge"; passId: string; sig: string }
  | { kind: "legacy"; code: string; nonce: string }
  | { kind: "manual"; code: string }
  | { kind: "garbage" };

export function parseCredential(raw: string): Parsed {
  const v = raw.trim().slice(0, 300);
  let m = /^GD2\.([A-Za-z0-9_-]{22})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{22})$/.exec(v);
  if (m) { const id = b64ToUuid(m[1]!); return id ? { kind: "wallet", ticketId: id, window: parseInt(m[2]!, 36), sig: m[3]! } : { kind: "garbage" }; }
  m = /^GD2P\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(v);
  if (m) { const id = b64ToUuid(m[1]!); return id ? { kind: "print", ticketId: id, sig: m[2]! } : { kind: "garbage" }; }
  m = /^GD2B\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(v);
  if (m) { const id = b64ToUuid(m[1]!); return id ? { kind: "badge", passId: id, sig: m[2]! } : { kind: "garbage" }; }
  m = /^GD1:([A-Z0-9-]{6,40}):([a-f0-9]{32})$/i.exec(v);
  if (m) return { kind: "legacy", code: m[1]!.toUpperCase(), nonce: m[2]!.toLowerCase() };
  if (/^[A-Z0-9-]{6,40}$/i.test(v)) return { kind: "manual", code: v.toUpperCase() };   // ticket code or GDP- pass code
  return { kind: "garbage" };
}

/** Checks a wallet/print signature against the ticket's current nonce. Returns false for stale, forged or expired credentials. */
export function verifySignature(p: Extract<Parsed, { kind: "wallet" | "print" | "badge" }>, nonce: string, now = Date.now(), printEpoch = 0) {
  if (p.kind === "print") return same(p.sig, sign(printMsg(p.ticketId, nonce, printEpoch)));
  if (p.kind === "badge") return same(p.sig, sign(`b|${p.passId}|${nonce}`));
  const w = currentWindow(now);
  if (Math.abs(p.window - w) > SKEW) return false;
  return same(p.sig, sign(`w|${p.ticketId}|${nonce}|${p.window}`));
}
