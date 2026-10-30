// Q38 pass 2 helpers: signed-in demo clients (anon key + password from the git-ignored .env.local, exactly like a browser session),
// the platform-admin demo stepped up to aal2 with its demo TOTP factor, the service client for fixtures, and a generated placeholder
// PDF (never a real document). Credentials and keys are never printed.
import { createClient } from "@supabase/supabase-js";
import { totp } from "../totp.mjs";

export const PASSWORDS = {
  "alex.events@example.com": "DEMO_ORGANIZER_PASSWORD", "alex.thompson@example.com": "DEMO_CUSTOMER_PASSWORD", "provider.demo@example.com": "DEMO_PROVIDER_PASSWORD",
  "james.carter@example.com": "DEMO_CREW_PASSWORD", "admin.demo@example.com": "DEMO_ADMIN_PASSWORD", "ops.lead.demo@example.com": "DEMO_OPS_LEAD_PASSWORD",
  "solo.supplier.demo@example.com": "DEMO_SOLO_SUPPLIER_PASSWORD", "agency.demo@example.com": "DEMO_AGENCY_OWNER_PASSWORD",
  "agency.staff.demo@example.com": "DEMO_AGENCY_STAFF_PASSWORD", "ava.thompson@example.com": "DEMO_CREW_AVA_PASSWORD",
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);

const open = new Map();
/** A signed-in client for a demo identity (cached for the run; call closeAll() at the end). */
export async function signIn(email) {
  if (open.has(email)) return open.get(email);
  const pw = process.env[PASSWORDS[email]];
  if (!pw) throw new Error(`no password configured for ${email}`);
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw new Error(`sign-in ${email}: ${s.error.message}`);
  c.uid = s.data.user.id;
  if (email === "admin.demo@example.com") {
    const f = (await c.auth.mfa.listFactors()).data?.totp?.find(x => x.status === "verified");
    if (!f || !process.env.DEMO_ADMIN_TOTP_SECRET) throw new Error("admin demo TOTP not available");
    const v = await c.auth.mfa.challengeAndVerify({ factorId: f.id, code: totp(process.env.DEMO_ADMIN_TOTP_SECRET) });
    if (v.error) throw new Error(`admin step-up: ${v.error.message}`);
  }
  open.set(email, c);
  return c;
}
export async function closeAll() { for (const c of open.values()) await c.auth.signOut().catch(() => {}); open.clear(); }

/** rpc that throws with the function name on error. */
export async function call(c, fn, args) {
  const r = await c.rpc(fn, args);
  if (r.error) throw new Error(`${fn}: ${r.error.message}`);
  return r.data;
}

/** A tiny, valid one-page PDF that says it is a demo placeholder (no personal data). */
export function placeholderPdf(title, lines) {
  const esc = s => String(s).replace(/[\\()]/g, m => `\\${m}`).replace(/[^\x20-\x7e]/g, "-");
  const text = ["BT /F1 18 Tf 60 760 Td", `(${esc(title)}) Tj`, "/F1 11 Tf",
    ...["", "DEMO PLACEHOLDER - not a real document. Gala Dock demo data (example.com).", ...lines].map(l => `0 -18 Td (${esc(l)}) Tj`), "ET"].join("\n");
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
