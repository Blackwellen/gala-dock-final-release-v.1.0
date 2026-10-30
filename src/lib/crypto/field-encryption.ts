import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field / token encryption contract (backend domains 210, 267, 268). Server-side only (node:crypto).
 *
 * Key ring: FIELD_ENCRYPTION_KEYS = "<kid>:<32-byte key as base64 or 64 hex chars>[,<kid>:<key>...]".
 * Active key: FIELD_ENCRYPTION_ACTIVE_KEY = "<kid>" (defaults to the LAST key listed). Older kids stay listed so existing
 * ciphertext keeps decrypting while it is re-sealed under the active key (rotation without downtime). Removing a kid retires it.
 *
 * Format: "gd2.<kid>.<iv>.<tag>.<ciphertext>" (base64url), AES-256-GCM with a 96-bit random IV. The caller's `context`
 * (e.g. "calendar_tokens") is bound as additional authenticated data, so a ciphertext cannot be replayed into another field.
 *
 * External KMS: KMS_PROVIDER + KMS_KEY_ID declare an envelope-encryption KMS. No KMS adapter is configured for Gala Dock yet,
 * so a declared provider reports BLOCKED_EXTERNAL rather than pretending keys are KMS-wrapped.
 */

export type KeyringStatus = {
  status: "ready" | "not_configured" | "misconfigured";
  activeKid: string | null;
  kids: string[];
  kms: "not_declared" | "blocked_external";
  problems: string[];
};

type Ring = { keys: Map<string, Buffer>; active: string | null; problems: string[] };
const KID = /^[a-z0-9_-]{1,24}$/i;
const PREFIX = "gd2";

function parseKey(raw: string): Buffer | null {
  const v = raw.trim();
  const b = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  return b.length === 32 ? b : null;
}

/** Parses the key ring from an environment map. Never returns or logs key material outside the Map. */
export function parseKeyring(env: Record<string, string | undefined> = process.env): Ring {
  const keys = new Map<string, Buffer>(); const problems: string[] = [];
  const spec = (env.FIELD_ENCRYPTION_KEYS ?? "").trim();
  if (spec) for (const part of spec.split(",")) {
    const i = part.indexOf(":"); const kid = part.slice(0, i).trim(); const key = i > 0 ? parseKey(part.slice(i + 1)) : null;
    if (!KID.test(kid)) { problems.push("A key id is missing or invalid."); continue; }
    if (!key) { problems.push(`Key "${kid}" is not 32 bytes (base64 or 64 hex characters).`); continue; }
    if (keys.has(kid)) { problems.push(`Key "${kid}" is listed twice.`); continue; }
    keys.set(kid, key);
  }
  const wanted = (env.FIELD_ENCRYPTION_ACTIVE_KEY ?? "").trim();
  const active = wanted ? (keys.has(wanted) ? wanted : null) : ([...keys.keys()].at(-1) ?? null);
  if (wanted && !keys.has(wanted)) problems.push(`FIELD_ENCRYPTION_ACTIVE_KEY "${wanted}" is not in the key ring.`);
  return { keys, active, problems };
}

export function keyringStatus(env: Record<string, string | undefined> = process.env): KeyringStatus {
  const ring = parseKeyring(env);
  const kms = (env.KMS_PROVIDER ?? "").trim() ? "blocked_external" as const : "not_declared" as const;
  const status = ring.problems.length ? "misconfigured" : ring.active ? "ready" : "not_configured";
  return { status, activeKid: ring.active, kids: [...ring.keys.keys()], kms, problems: ring.problems };
}

export const isSealed = (value: string) => value.startsWith(`${PREFIX}.`);

export function seal(plaintext: string, context: string, env: Record<string, string | undefined> = process.env): string {
  const ring = parseKeyring(env);
  if (ring.problems.length || !ring.active) throw new Error("field_encryption_not_configured");
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", ring.keys.get(ring.active)!, iv);
  c.setAAD(Buffer.from(`gala-dock:${context}`, "utf8"));
  const data = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return [PREFIX, ring.active, iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function open(sealed: string, context: string, env: Record<string, string | undefined> = process.env): string {
  const [p, kid, iv, tag, data] = sealed.split(".");
  if (p !== PREFIX || !kid || !iv || !tag || data === undefined) throw new Error("bad_ciphertext");
  const key = parseKeyring(env).keys.get(kid);
  if (!key) throw new Error("unknown_key_id");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(`gala-dock:${context}`, "utf8")); d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** True when the value was sealed under a key other than the active one (re-seal it on next write). */
export function needsRotation(sealed: string, env: Record<string, string | undefined> = process.env) {
  const kid = sealed.split(".")[1]; const active = parseKeyring(env).active;
  return !!active && isSealed(sealed) && kid !== active;
}

/** Re-seals under the active key. Returns the input unchanged when it is already current. */
export function rotate(sealed: string, context: string, env: Record<string, string | undefined> = process.env) {
  return needsRotation(sealed, env) ? seal(open(sealed, context, env), context, env) : sealed;
}
