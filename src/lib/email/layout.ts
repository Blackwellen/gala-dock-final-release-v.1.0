// Gala Dock email layout (release spec §76–77): one branded, email-client-safe shell shared by transactional mail (send.ts) and the
// Supabase Auth templates (scripts/auth-email-templates.mjs). Table layout + inline styles (Gmail, Outlook, Apple Mail), hosted PNG logo
// (SVG isn't supported by most clients), hidden preheader, bulletproof button with a plain-link fallback, legal footer.
// No imports or path aliases, so Node can load it directly from scripts.

export const BRAND = {
  site: "https://www.galadock.com",
  logo: "https://www.galadock.com/brand/gala-dock-logo-trim.png",   // 431×115 — shown at 160×43 (2.7× for retina)
  mark: "https://www.galadock.com/brand/gala-dock-mark-trim.png",
  ink: "#090a52", body: "#3a3f86", muted: "#7a80b8", blue: "#0038fd", line: "#e6ecf8", bg: "#eef2fb",
  company: "Blackwellen Limited · Registered in England and Wales No. 16482166 · 61 Bridge Street, Kington, HR5 3DJ · VAT No. GB508480488",
};

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailParts = {
  /** Shown in the inbox list after the subject; never visible in the body. */
  preheader?: string;
  eyebrow?: string;
  heading: string;
  /** Trusted HTML (already escaped by the caller). */
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  /** One-time code shown large (e.g. reauthentication). */
  code?: string | null;
  /** Small print under the button (e.g. "This link expires in 1 hour"). */
  note?: string | null;
  /** Why they're getting it / how to change preferences. */
  footerNote: string;
  /** Raw URL template vars (Supabase) must not be escaped, so callers pass them through as-is. */
  rawUrls?: boolean;
};

export function emailHtml(p: EmailParts) {
  const u = (s: string) => (p.rawUrls ? s : escapeHtml(s));
  const b = BRAND, font = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const button = p.cta ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px"><tr>
<td align="center" bgcolor="${b.blue}" style="border-radius:10px;background:${b.blue}">
<a href="${u(p.cta.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${font};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(p.cta.label)}&nbsp;&rarr;</a>
</td></tr></table>
<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${b.muted}">Button not working? Copy this link into your browser:<br><a href="${u(p.cta.url)}" style="color:${b.blue};word-break:break-all">${u(p.cta.url)}</a></p>` : "";
  const code = p.code ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px"><tr>
<td style="background:#f3f6ff;border:1px solid ${b.line};border-radius:12px;padding:16px 26px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${b.ink}">${p.rawUrls ? p.code : escapeHtml(p.code)}</td>
</tr></table>` : "";
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(p.heading)}</title>
<style>@media (max-width:620px){.gd-card{padding:28px 22px!important}.gd-h1{font-size:22px!important}}a{color:${b.blue}}</style>
</head>
<body style="margin:0;padding:0;background:${b.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(p.preheader ?? p.heading)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${b.bg}" style="background:${b.bg}"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 6px 18px"><a href="${b.site}" target="_blank" style="text-decoration:none"><img src="${b.logo}" width="160" height="43" alt="Gala Dock" style="display:block;border:0;outline:none;height:43px;width:160px"></a></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px;border:1px solid ${b.line};overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="5" bgcolor="${b.blue}" style="height:5px;line-height:5px;font-size:0;background:${b.blue};background-image:linear-gradient(90deg,#0038fd,#5b4dff 60%,#9b5cff)">&nbsp;</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="gd-card" style="padding:36px 40px 34px;font-family:${font};color:${b.ink}">
${p.eyebrow ? `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${b.blue}">${escapeHtml(p.eyebrow)}</p>` : ""}
<h1 class="gd-h1" style="margin:0 0 14px;font-size:25px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:${b.ink}">${escapeHtml(p.heading)}</h1>
<div style="font-size:15px;line-height:1.7;color:${b.body};word-break:break-word;overflow-wrap:anywhere">${p.bodyHtml}</div>
${code}${button}
${p.note ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${b.line};font-size:13px;line-height:1.6;color:${b.muted}">${p.note}</p>` : ""}
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 10px 6px;font-family:${font};font-size:12px;line-height:1.7;color:${b.muted};text-align:center">
<img src="${b.mark}" width="22" height="22" alt="" style="display:inline-block;border:0;height:22px;width:22px;margin-bottom:8px"><br>
${p.footerNote}<br>
<a href="${b.site}/help" style="color:${b.muted};text-decoration:underline">Help centre</a> &nbsp;·&nbsp; <a href="${b.site}/privacy" style="color:${b.muted};text-decoration:underline">Privacy</a> &nbsp;·&nbsp; <a href="${b.site}/terms" style="color:${b.muted};text-decoration:underline">Terms</a><br>
<span style="font-size:11px;color:#9aa0cc">Gala Dock is a trading name of ${b.company}</span>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
