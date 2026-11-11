// Waits for mail.galadock.com to verify in Resend, then sends branded test emails (one real welcome + previews of key templates).
import fs from "node:fs";
import { emailHtml, escapeHtml } from "../../src/lib/email/layout.ts";
const to = "jamahlthomas1996@gmail.com", from = "Gala Dock <no-reply@mail.galadock.com>", key = process.env.RESEND_API_KEY || process.env.RESEND_API;
const para = t => `<p style="margin:0">${escapeHtml(t).replace(/\n{2,}/g, '</p><p style="margin:14px 0 0">').replace(/\n/g, "<br>")}</p>`;
const footerPrefs = `You can change which emails you get in your <a href="https://www.galadock.com/account?tab=notifications" style="color:#7a80b8;text-decoration:underline">notification settings</a>.`;
const mails = [
  { subject: "Your Gala Dock emails are working", html: emailHtml({ eyebrow: "Gala Dock", heading: "Your Gala Dock emails are working", preheader: "Resend is connected for mail.galadock.com",
    bodyHtml: para("This is a test from Gala Dock, sent through Resend from no-reply@mail.galadock.com.\n\nEvery Gala Dock email now uses this design: our logo, a clear button, a backup link, and our company and VAT details in the footer. The next few emails show the main templates."),
    cta: { label: "Open Gala Dock", url: "https://www.galadock.com" }, footerNote: "You’re receiving this test because you asked for one." }) },
  { subject: "[Preview] You’re going to Summer Sessions 2026", html: emailHtml({ eyebrow: "Tickets", heading: "You’re going to Summer Sessions 2026",
    bodyHtml: para("Your tickets for Summer Sessions 2026 are confirmed.\n\nSaturday 15 August 2026 · 7:00pm\nThe Grand Hall, London\n\n2 × General Admission"), cta: { label: "View tickets", url: "https://www.galadock.com/account/tickets" }, footerNote: footerPrefs }) },
  { subject: "[Preview] New sign-in to your account", html: emailHtml({ eyebrow: "Account security", heading: "New sign-in to your account",
    bodyHtml: para("From 82.13.3.250 · Chrome on Windows. If this wasn’t you, sign out other sessions and change your password."), cta: { label: "Review your account", url: "https://www.galadock.com/account?tab=security#sessions" },
    footerNote: "You’re receiving this because it concerns your account’s security or payments." }) },
  { subject: "[Preview] Payment received for your booking", html: emailHtml({ eyebrow: "Payments", heading: "Payment received",
    bodyHtml: para("We’ve received your £1,250.00 deposit for Riverside Arena (Main Hall). It’s protected until your event has taken place.\n\nBooking admin fee: £31.25 (incl. £5.21 VAT)"),
    cta: { label: "View payment details", url: "https://www.galadock.com/account" }, footerNote: "You’re receiving this because it concerns your account’s security or payments." }) },
];
for (const f of ["auth-confirmation", "auth-recovery"]) mails.push({ subject: `[Preview] ${f === "auth-confirmation" ? "Confirm your email to finish joining Gala Dock" : "Reset your Gala Dock password"}`, html: fs.readFileSync(`artifacts/email-preview/${f}.html`, "utf8") });
const send = m => fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from, to: [to], reply_to: "support@galadock.com", subject: m.subject, html: m.html }) });
for (let i = 0; i < 45; i++) {
  const r = await send(mails[0]); const t = await r.text();
  if (r.ok) {
    console.log(new Date().toISOString(), "VERIFIED — sent", mails[0].subject, t);
    for (const m of mails.slice(1)) { const x = await send(m); console.log(x.status, m.subject); await new Promise(s => setTimeout(s, 700)); }
    process.exit(0);
  }
  if (!/not verified/.test(t)) { console.log("Stopped:", r.status, t.slice(0, 200)); process.exit(1); }
  if (i % 5 === 0) console.log(new Date().toISOString(), "still not verified");
  await new Promise(s => setTimeout(s, 60_000));
}
console.log("Gave up after 45 minutes: domain still not verified."); process.exit(2);
