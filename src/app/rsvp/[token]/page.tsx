import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Clock, Lock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { clientIp, hashToken, isTokenFormat, rateLimit } from "@/lib/security";
import { RsvpForm } from "./rsvp-form";
import { requestTime } from "@/lib/workspace/format";

export const metadata: Metadata = { title: "Your RSVP", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Guest = { id: string; name: string; status: string; plus_one: boolean; tickets: number; rsvp_responded_at: string | null; is_child: boolean;
  event: { name: string; starts_at: string | null; ends_at: string | null; timezone: string | null; status: string; cover_image: string | null; location: string | null; city: string | null; event_type: string | null } };

/**
 * Q18 personal RSVP link (`/rsvp/<token>`, no account). The token is hashed here; only the hash is looked up, with the service
 * client and after a per-IP limit (W09). The page shows the invited guest's first name and the event basics only — no other
 * guests, no host contact details, no care data (dietary/access answers are write-only from here). Answers go through
 * `respondRsvp` → service-only `guest_rsvp` (rate-limited per IP and per token; plus-ones within the allowance; closed once the
 * event starts).
 */
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTokenFormat(token)) notFound();
  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!(await rateLimit(`rsvp:view:${ip}`, 60, 600))) throw new Error("Too many requests. Please try again shortly.");
  const db = untyped(createAdminClient() as never);
  const { data } = await db.from("guests")
    .select("id,name,status,plus_one,tickets,rsvp_responded_at,is_child,event:events!inner(name,starts_at,ends_at,timezone,status,cover_image,location,city,event_type)")
    .eq("rsvp_token_hash", hashToken(token)).is("plus_one_of", null).maybeSingle();
  if (!data) notFound();
  const g = data as unknown as Guest, e = g.event;
  const { count: plusOnes } = await db.from("guests").select("id", { count: "exact", head: true }).eq("plus_one_of", g.id);
  const tz = e.timezone || "Europe/London";
  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const closed = ["cancelled", "completed", "closed", "archived"].includes(e.status) ? "This event is no longer taking RSVPs." : e.starts_at && Date.parse(e.starts_at) < requestTime() ? "RSVPs closed when the event started." : null;
  const allowed = g.plus_one ? Math.max(Number(g.tickets) - 1, 1) : 0;
  const first = g.name.split(" ")[0] || "there";

  return <div className="gf">
    <section className="gf-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={e.cover_image || "/assets/gd/hero-discover.webp"} alt="" />
      <div><span className="gf-chip"><Lock size={12} aria-hidden />Private invitation</span><h1>{e.name}</h1>
        <p>{e.starts_at && <><span><CalendarDays size={16} aria-hidden />{day(e.starts_at)}</span><span><Clock size={16} aria-hidden />{time(e.starts_at)}{e.ends_at ? ` – ${time(e.ends_at)}` : ""}</span></>}{(e.location || e.city) && <span><MapPin size={16} aria-hidden />{e.location || e.city}</span>}</p></div>
    </section>
    <div className="gf-grid">
      <section className="gf-card">
        <h2 className="gf-h1">Hi {first}, will you be there?</h2>
        <p className="gf-sub">{g.rsvp_responded_at ? `You answered “${g.status === "confirmed" ? "Yes" : g.status === "declined" ? "No" : "Maybe"}”. You can change your answer until the event starts.` : "Let the host know if you can make it."}</p>
        {closed ? <p className="gf-msg bad" role="status">{closed}</p>
          : <RsvpForm token={token} current={g.rsvp_responded_at ? g.status : null} allowed={allowed} existingPlusOnes={plusOnes ?? 0} child={g.is_child} />}
      </section>
      <aside className="gf-card gf-side">
        <h2>About your answer</h2>
        <ul><li>Only the host sees your reply.</li><li>Dietary and access needs go to the host and, as counts only, to their caterer.</li>{allowed > 0 && <li>You can bring up to {allowed} guest{allowed === 1 ? "" : "s"}.</li>}<li>No account needed. Keep this link private — it&apos;s personal to you.</li></ul>
      </aside>
    </div>
  </div>;
}
