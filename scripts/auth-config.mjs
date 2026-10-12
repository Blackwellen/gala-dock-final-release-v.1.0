// Applies Gala Dock's Supabase Auth settings through the Management API. Dry-run by default; pass --apply to change the project.
//   node --env-file=.env --env-file=.env.local scripts/auth-config.mjs [--apply]
// Always: passkeys (WebAuthn) for galadock.com + factor-change notification emails.
// When present in env: TURNSTILE_SECRET_KEY → bot protection (Turnstile); GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET → Google sign-in.
// Secrets are never printed.
const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY, apply = process.argv.includes("--apply");
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY."); process.exit(1); }
const gId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID, gSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");
const host = new URL(site).hostname.replace(/^www\./, "");
const patch = {
  passkey_enabled: true,
  webauthn_rp_id: host,
  webauthn_rp_display_name: "Gala Dock",
  webauthn_rp_origins: [...new Set([`https://${host}`, `https://www.${host}`, site])].join(","),
  mailer_notifications_mfa_factor_enrolled_enabled: true,
  mailer_notifications_mfa_factor_unenrolled_enabled: true,
};
if (process.env.TURNSTILE_SECRET_KEY) Object.assign(patch, { security_captcha_enabled: true, security_captcha_provider: "turnstile", security_captcha_secret: process.env.TURNSTILE_SECRET_KEY });
if (gId && gSecret) Object.assign(patch, { external_google_enabled: true, external_google_client_id: gId, external_google_secret: gSecret });
const shown = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, /secret/i.test(k) ? "<set>" : v]));
console.log(apply ? "Applying:" : "Dry run (add --apply to change the project):", JSON.stringify(shown, null, 2));
if (!process.env.TURNSTILE_SECRET_KEY) console.log("· Bot protection skipped: set NEXT_PUBLIC_TURNSTILE_SITE_KEY (Vercel) and TURNSTILE_SECRET_KEY (here).");
if (!gId) console.log("· Google sign-in skipped: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.");
if (!apply) process.exit(0);
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { method: "PATCH", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify(patch) });
const t = await r.text();
if (!r.ok) { console.error(`HTTP ${r.status}: ${t.replace(/"[^"]*secret[^"]*":"[^"]*"/gi, "<redacted>").slice(0, 400)}`); process.exit(1); }
const j = JSON.parse(t);
console.log("Applied. Now:", JSON.stringify({ passkey_enabled: j.passkey_enabled, webauthn_rp_id: j.webauthn_rp_id, webauthn_rp_origins: j.webauthn_rp_origins, captcha: j.security_captcha_enabled, google: j.external_google_enabled }));
