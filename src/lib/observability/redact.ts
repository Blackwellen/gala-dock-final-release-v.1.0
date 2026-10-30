// Q34 (domains 213 Logging, 215 Tracing): PII / secret redaction for logs, error reports and operational evidence.
// Pure and dependency-free (importable from server code, workers, edge code and API-level tests). Two layers:
//   1. keys: any field whose name looks like a secret, credential, contact detail or guest-care field is replaced wholesale;
//   2. values: free text is scrubbed of emails, bearer/JWT tokens, provider keys, card-like numbers, phone numbers and IPs.
// Nothing here is reversible: no hashes of emails or tokens are emitted (a hash of a low-entropy value is still personal data).

export const REDACTED = "[redacted]";

/** Field names that are always dropped (matched case-insensitively against the key, `_`/`-` ignored). */
const SECRET_KEY = /(pass(word|phrase)?|secret|token|api_?key|apikey|authori[sz]ation|cookie|session|credential|private_?key|signature|dsn|jwt|bearer|otp|totp|recovery_?code|service_?role|client_?secret|webhook_?secret|card_?(number|no)|cvc|cvv|iban|sort_?code|account_?number)/i;
/** Personal / guest-care fields (UK GDPR special category or contact data): never logged. */
const PERSONAL_KEY = /(^|_)(e_?mail|emails|to_email|phone|mobile|tel|address|postcode|post_code|zip|dob|date_of_birth|birth|ip|ip_address|user_agent|ua|full_?name|first_?name|last_?name|legal_?name|guest_?name|attendee_?name|dietary|diet|allerg(y|ies|ens)?|medical|medication|health|disabilit(y|ies)|access(ibility)?_?needs|care_?notes?|welfare|emergency_?contact|next_?of_?kin|notes?|message_?body|body_text|religion|ethnicity|gender|passport|national_?insurance|nino|licen[cs]e_?number|geo|lat|lng|latitude|longitude)($|_)/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
// Stripe (sk_/rk_/pk_/whsec_/acct secrets are not ids; acct_ and pi_ ids are fine), Gala API keys, Resend, GitHub, AWS-style, Azure-style hex keys.
const PROVIDER_KEY = /\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\bpk_(live|test)_[A-Za-z0-9]{8,}|\bgd_(live|test)_[A-Za-z0-9_]{8,}|\bre_[A-Za-z0-9]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|\b[a-f0-9]{32,}\b/g;
const URL_SECRET = /([?&](?:token|key|secret|signature|sig|code|access_token|refresh_token|apikey|api_key|password|X-Amz-Signature|X-Amz-Credential)=)[^&\s#"]+/gi;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const PHONE = /(?:\+?44\s?|\b0)(?:\d[\s-]?){9,10}\b|\+\d{1,3}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){2,4}/g;
const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const IPV6 = /\b(?:[A-F0-9]{1,4}:){4,7}[A-F0-9]{1,4}\b/gi;

const normaliseKey = (k: string) => k.replace(/[-\s]/g, "_");
export const isSensitiveKey = (key: string) => { const k = normaliseKey(key); return SECRET_KEY.test(k) || PERSONAL_KEY.test(k); };

/** Scrubs secrets and personal data out of free text. */
export function redactText(input: string, max = 2000): string {
  let s = String(input);
  if (s.length > max * 4) s = s.slice(0, max * 4);
  s = s.replace(URL_SECRET, `$1${REDACTED}`)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(PROVIDER_KEY, REDACTED)
    .replace(EMAIL, "[email]")
    .replace(CARD, m => (m.replace(/\D/g, "").length >= 13 ? "[number]" : m))
    .replace(PHONE, "[phone]")
    .replace(IPV4, "[ip]")
    .replace(IPV6, "[ip]");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export type RedactOptions = { maxDepth?: number; maxString?: number; maxKeys?: number; maxArray?: number };

/** Deep-redacts a value for logging. Sensitive keys are replaced, strings scrubbed, depth/size bounded (log budget). */
export function redact(value: unknown, o: RedactOptions = {}, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  const { maxDepth = 6, maxString = 2000, maxKeys = 60, maxArray = 50 } = o;
  if (value == null) return value;
  if (typeof value === "string") return redactText(value, maxString);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: redactText(value.message, maxString) };
  if (typeof value !== "object") return String(value);
  if (seen.has(value as object)) return "[circular]";
  if (depth >= maxDepth) return "[truncated]";
  seen.add(value as object);
  if (Array.isArray(value)) {
    const out = value.slice(0, maxArray).map(v => redact(v, o, depth + 1, seen));
    if (value.length > maxArray) out.push(`[+${value.length - maxArray} more]`);
    return out;
  }
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    // Header values are never logged; names are enough to diagnose.
    return { header_names: [...value.keys()].filter(k => !isSensitiveKey(k)).slice(0, maxKeys) };
  }
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (n++ >= maxKeys) { out["…"] = `[+${Object.keys(value as object).length - maxKeys} keys]`; break; }
    const nk = normaliseKey(k);
    // A flag or a small count under a credential-like name (has_token: true, tokens: 1200) is not itself a secret; personal fields always go.
    const harmless = typeof v === "boolean" || (typeof v === "number" && Math.abs(v) < 1e9);
    out[k] = PERSONAL_KEY.test(nk) ? REDACTED : SECRET_KEY.test(nk) ? (harmless ? v : REDACTED) : redact(v, o, depth + 1, seen);
  }
  return out;
}

/** True when the serialised value still contains something that looks like a secret or personal data (used by tests and guards). */
export function containsSensitive(serialised: string): boolean {
  const probes = [EMAIL, BEARER, JWT, PROVIDER_KEY, IPV4];
  return probes.some(re => { re.lastIndex = 0; const hit = re.test(serialised); re.lastIndex = 0; return hit; });
}
