import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { channelOf, PARTNER_COOKIE, partnerCookieOptions } from "@/lib/partners/referral";
import { safeNext } from "@/lib/redirects";
import { CONSENT_COOKIE, consentCookieOptions, mergeConsent } from "@/lib/consent/cookie";
import "@/styles/legal.css";

export const metadata: Metadata = { title: "Referral cookie · Gala Dock", robots: { index: false } };

const ok = (code: string) => /^[A-Za-z0-9_-]{2,32}$/.test(code);

/** Q27 partner links: records the visitor's choice (gd_consent, 12 months) and only sets gd_partner on "yes" (PECR reg. 6). */
async function choose(code: string, channel: string, next: string, yes: boolean) {
  "use server";
  const dest = safeNext(next);
  if (!ok(code)) redirect(dest);
  const jar = await cookies(), secure = process.env.NODE_ENV === "production";
  // Merge, never overwrite: keeps the visitor's other choices (e.g. analytics).
  jar.set(CONSENT_COOKIE, mergeConsent(jar.get(CONSENT_COOKIE)?.value, "referral", yes), consentCookieOptions(secure));
  if (yes) jar.set(PARTNER_COOKIE, `${code}:${channelOf(channel)}`, partnerCookieOptions(secure));
  else jar.delete(PARTNER_COOKIE);
  redirect(dest);
}

export default async function PartnerReferralConsent(props: PageProps<"/ref/[code]">) {
  const { code } = await props.params, sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/"), channel = typeof sp.c === "string" ? sp.c : "link";
  if (!ok(code)) redirect(next);
  return <div className="lg"><div className="lg-body" style={{ gridTemplateColumns: "1fr", maxWidth: 560 }}>
    <main className="lg-doc" id="main">
      <h1 style={{ fontSize: 24 }}>Credit the partner who referred you?</h1>
      <p>You followed a Gala Dock partner’s link. If you agree, we’ll store a small cookie for 30 days so that, if you create an account and subscribe, the partner who referred you gets credit. It doesn’t change what you pay, and it isn’t used for advertising.</p>
      <p>We’ll remember your choice on this device for 12 months. See our <Link href="/cookies">Cookie Policy</Link>.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <form action={choose.bind(null, code, channel, next, true)}><button type="submit" style={{ height: 42, padding: "0 18px", borderRadius: 10, background: "#0b08f8", color: "#fff", border: 0, fontWeight: 600, cursor: "pointer" }}>Continue and credit the partner</button></form>
        <form action={choose.bind(null, code, channel, next, false)}><button type="submit" style={{ height: 42, padding: "0 18px", borderRadius: 10, background: "#fff", color: "#03035f", border: "1px solid #c9d3ee", fontWeight: 600, cursor: "pointer" }}>Continue without</button></form>
      </div>
    </main></div></div>;
}
