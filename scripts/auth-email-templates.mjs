// Branded Supabase Auth emails (sign-up, reset, magic link, invites, security notices) using the shared Gala Dock layout.
//   node --env-file=.env --env-file=.env.local scripts/auth-email-templates.mjs            write previews to artifacts/email-preview (no changes)
//   node --env-file=.env --env-file=.env.local scripts/auth-email-templates.mjs --apply    update the project's templates and subjects
//   ... --apply --smtp    also send auth mail through Resend SMTP (only once galadock.com is verified in Resend — otherwise sign-up mail stops)
// Go template variables ({{ .ConfirmationURL }} etc.) are passed through untouched. Secrets are never printed.
import fs from "node:fs";
import path from "node:path";
import { emailHtml } from "../src/lib/email/layout.ts";

const apply = process.argv.includes("--apply"), smtp = process.argv.includes("--smtp");
const SEC = "You’re receiving this because it concerns your Gala Dock account’s security.";
const p = (...xs) => xs.map(x => `<p style="margin:0 0 12px">${x}</p>`).join("");
const help = `If this wasn’t you, <a href="https://www.galadock.com/forgot-password" style="color:#0038fd">reset your password</a> and contact <a href="mailto:support@galadock.com" style="color:#0038fd">support@galadock.com</a> straight away.`;

const T = {
  confirmation: { subject: "Confirm your email to finish joining Gala Dock", eyebrow: "Welcome to Gala Dock", heading: "Confirm your email address",
    body: p("Thanks for signing up. Confirm this is your email address and we’ll take you straight into Gala Dock."), cta: ["Confirm email address", "{{ .ConfirmationURL }}"],
    note: "This link expires in 1 hour. If you didn’t create a Gala Dock account, you can ignore this email." },
  invite: { subject: "You’ve been invited to Gala Dock", eyebrow: "Invitation", heading: "You’re invited to Gala Dock",
    body: p("You’ve been invited to join Gala Dock, where events, bookings, tickets and teams come together. Accept the invitation to set up your account."), cta: ["Accept invitation", "{{ .ConfirmationURL }}"],
    note: "If you weren’t expecting this invitation, you can ignore this email." },
  magic_link: { subject: "Your Gala Dock sign-in link", eyebrow: "Sign in", heading: "Sign in to Gala Dock",
    body: p("Use the button below to sign in. The link works once and expires shortly."), cta: ["Sign in", "{{ .ConfirmationURL }}"], note: help },
  recovery: { subject: "Reset your Gala Dock password", eyebrow: "Account security", heading: "Reset your password",
    body: p("We received a request to reset the password for {{ .Email }}. Choose a new password using the button below."), cta: ["Choose a new password", "{{ .ConfirmationURL }}"],
    note: "This link expires in 1 hour and can only be used once. If you didn’t ask to reset your password, you can ignore this email — your password won’t change." },
  email_change: { subject: "Confirm your new email address", eyebrow: "Account security", heading: "Confirm your new email address",
    body: p("Confirm <b>{{ .NewEmail }}</b> as the new email address for your Gala Dock account."), cta: ["Confirm new email", "{{ .ConfirmationURL }}"],
    note: "If you didn’t request this change, ignore this email and your address stays the same." },
  reauthentication: { subject: "{{ .Token }} is your Gala Dock verification code", eyebrow: "Account security", heading: "Your verification code",
    body: p("Enter this code in Gala Dock to confirm it’s you."), code: "{{ .Token }}", note: `The code expires in a few minutes. ${help}` },
  password_changed_notification: { subject: "Your Gala Dock password was changed", eyebrow: "Security alert", heading: "Your password was changed",
    body: p("The password for your Gala Dock account ({{ .Email }}) was just changed."), note: help },
  email_changed_notification: { subject: "Your Gala Dock email address was changed", eyebrow: "Security alert", heading: "Your email address was changed",
    body: p("The email address for your Gala Dock account was changed from <b>{{ .OldEmail }}</b> to <b>{{ .Email }}</b>."), note: help },
  phone_changed_notification: { subject: "Your Gala Dock phone number was changed", eyebrow: "Security alert", heading: "Your phone number was changed",
    body: p("The phone number on your Gala Dock account was changed from {{ .OldPhone }} to {{ .Phone }}."), note: help },
  mfa_factor_enrolled_notification: { subject: "A sign-in verification method was added", eyebrow: "Security alert", heading: "New verification method added",
    body: p("A new sign-in verification method ({{ .FactorType }}) was added to your Gala Dock account."), note: help },
  mfa_factor_unenrolled_notification: { subject: "A sign-in verification method was removed", eyebrow: "Security alert", heading: "Verification method removed",
    body: p("A sign-in verification method ({{ .FactorType }}) was removed from your Gala Dock account."), note: help },
  identity_linked_notification: { subject: "A new sign-in method was linked", eyebrow: "Security alert", heading: "New sign-in method linked",
    body: p("Your {{ .Provider }} account was linked as a way to sign in to Gala Dock as {{ .Email }}."), note: help },
  identity_unlinked_notification: { subject: "A sign-in method was removed", eyebrow: "Security alert", heading: "Sign-in method removed",
    body: p("Your {{ .Provider }} account can no longer be used to sign in to Gala Dock as {{ .Email }}."), note: help },
};

const patch = {};
const out = path.resolve(import.meta.dirname, "../artifacts/email-preview");
fs.mkdirSync(out, { recursive: true });
for (const [k, t] of Object.entries(T)) {
  const html = emailHtml({ rawUrls: true, preheader: t.heading, eyebrow: t.eyebrow, heading: t.heading, bodyHtml: t.body, cta: t.cta ? { label: t.cta[0], url: t.cta[1] } : null,
    code: t.code ?? null, note: t.note, footerNote: SEC });
  patch[`mailer_templates_${k}_content`] = html;
  patch[`mailer_subjects_${k}`] = t.subject;
  fs.writeFileSync(path.join(out, `auth-${k}.html`), html.replaceAll("{{ .ConfirmationURL }}", "https://www.galadock.com/auth/confirm?token_hash=example").replaceAll("{{ .Token }}", "482913")
    .replaceAll("{{ .Email }}", "alex@example.com").replaceAll("{{ .NewEmail }}", "alex.new@example.com").replaceAll("{{ .OldEmail }}", "alex@example.com").replaceAll("{{ .FactorType }}", "authenticator app").replaceAll("{{ .Provider }}", "Google"));
}
if (smtp) {
  const key = process.env.RESEND_API_KEY || process.env.RESEND_API;
  if (!key) { console.error("No Resend key in env."); process.exit(1); }
  Object.assign(patch, { smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_pass: key, smtp_admin_email: "no-reply@galadock.com", smtp_sender_name: "Gala Dock", smtp_max_frequency: 30, rate_limit_email_sent: 100 });
}
console.log(`${Object.keys(T).length} templates rendered → ${out}`);
if (!apply) { console.log("Dry run. Add --apply to update Supabase Auth (and --smtp to switch auth mail to Resend once the domain is verified)."); process.exit(0); }
const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/config/auth`, { method: "PATCH", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(patch) });
const t = await r.text();
if (!r.ok) { console.error(`HTTP ${r.status}: ${t.replace(/"smtp_pass":"[^"]*"/g, '"smtp_pass":"<redacted>"').slice(0, 400)}`); process.exit(1); }
const j = JSON.parse(t);
console.log("Applied.", JSON.stringify({ smtp_host: j.smtp_host, sender: j.smtp_admin_email, subjects: Object.keys(T).length }));
