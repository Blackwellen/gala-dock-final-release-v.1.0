// Enrols a TOTP factor for the demo admin accounts so automated browser checks can reach /admin (which requires aal2).
// Usage: node --env-file=.env --env-file=.env.local scripts/demo-admin-mfa.mjs
// Secrets are written only to .env.local (git-ignored). Demo accounts only.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import { totp } from "./totp.mjs";

if (process.env.NODE_ENV === "production") { console.error("Refusing to run in production."); process.exit(1); }
const accounts = [
  { email: "admin.demo@example.com", pass: "DEMO_ADMIN_PASSWORD", secret: "DEMO_ADMIN_TOTP_SECRET" },
  { email: "support.demo@example.com", pass: "DEMO_SUPPORT_ADMIN_PASSWORD", secret: "DEMO_SUPPORT_ADMIN_TOTP_SECRET" },
];
let env = await fs.readFile(".env.local", "utf8");
for (const a of accounts) {
  if (process.env[a.secret]) { console.log(`${a.email}: already enrolled`); continue; }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await sb.auth.signInWithPassword({ email: a.email, password: process.env[a.pass] });
  if (signInError) { console.error(`${a.email}: sign-in failed (${signInError.message})`); process.exitCode = 1; continue; }
  const { data: existing } = await sb.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Demo automation" });
  if (error) { console.error(`${a.email}: enroll failed (${error.message})`); process.exitCode = 1; continue; }
  const { error: verifyError } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) });
  if (verifyError) { console.error(`${a.email}: verify failed (${verifyError.message})`); process.exitCode = 1; continue; }
  env += `${env.endsWith("\n") ? "" : "\n"}${a.secret}=${data.totp.secret}\n`;
  console.log(`${a.email}: TOTP enrolled`);
}
await fs.writeFile(".env.local", env);
