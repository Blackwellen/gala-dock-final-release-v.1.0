import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { CONSENT_COOKIE, consentCookieOptions, mergeConsent } from "@/lib/consent/cookie";
import "@/styles/legal.css";

export const metadata: Metadata = { title: "Referral cookie · Gala Dock", robots: { index: false } };

const ok = (code: string, slug: string) => /^[A-Za-z0-9_-]{2,32}$/.test(code) && /^[a-z0-9][a-z0-9-]{0,120}$/.test(slug);

/** Records the visitor's choice (gd_consent, 12 months, strictly necessary to remember it) and only sets gd_ref on "yes" (PECR reg. 6). */
async function choose(code: string, slug: string, channel: string, yes: boolean) {
  "use server";
  if (!ok(code, slug)) redirect("/events");
  const jar = await cookies(), secure = process.env.NODE_ENV === "production";
  // Merge, never overwrite: keeps the visitor's other choices (e.g. analytics).
  jar.set(CONSENT_COOKIE, mergeConsent(jar.get(CONSENT_COOKIE)?.value, "referral", yes), consentCookieOptions(secure));
  const ch = /^(link|qr|instagram|tiktok|facebook|x|whatsapp|email|other)$/.test(channel) ? channel : "link";
  if (yes) jar.set("gd_ref", `${code}:${slug}:${ch}`, { httpOnly: true, sameSite: "lax", secure, maxAge: 30 * 86400, path: "/" });
  else jar.delete("gd_ref");
  redirect(`/events/${encodeURIComponent(slug)}?ref=${encodeURIComponent(code)}`);
}

export default async function ReferralConsent(props: PageProps<"/r/[code]/consent">) {
  const { code } = await props.params, sp = await props.searchParams;
  const slug = typeof sp.event === "string" ? sp.event : "", channel = typeof sp.c === "string" ? sp.c : "link";
  if (!ok(code, slug)) redirect("/events");
  const { data: ev } = await untyped(await createClient()).from("events_public").select("name").eq("slug", slug).maybeSingle();
  return <div className="lg"><div className="lg-body" style={{ gridTemplateColumns: "1fr", maxWidth: 560 }}>
    <main className="lg-doc" id="main">
      <h1 style={{ fontSize: 24 }}>Credit the person who shared this?</h1>
      <p>You followed a promoter’s link{ev?.name ? <> to <b>{ev.name}</b></> : null}. If you agree, we’ll store a small cookie for 30 days so that, if you buy tickets for this event, the promoter who shared the link gets credit for the sale. It doesn’t change the price you pay, and it isn’t used for advertising.</p>
      <p>We’ll remember your choice on this device for 12 months. See our <Link href="/cookies">Cookie Policy</Link>.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <form action={choose.bind(null, code, slug, channel, true)}><button type="submit" className="ws-btn primary" style={{ height: 42, padding: "0 18px", borderRadius: 10, background: "#0b08f8", color: "#fff", border: 0, fontWeight: 600, cursor: "pointer" }}>Continue and credit the promoter</button></form>
        <form action={choose.bind(null, code, slug, channel, false)}><button type="submit" style={{ height: 42, padding: "0 18px", borderRadius: 10, background: "#fff", color: "#03035f", border: "1px solid #c9d3ee", fontWeight: 600, cursor: "pointer" }}>Continue without</button></form>
      </div>
    </main></div></div>;
}
