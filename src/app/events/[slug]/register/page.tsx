import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { clientIp, rateLimit } from "@/lib/security";
import { RegistrationForm, type Field } from "./registration-form";
import "@/styles/cu-guest-forms.css";
import { requestTime } from "@/lib/workspace/format";

export const metadata: Metadata = { title: "Register", robots: { index: false, follow: true }, referrer: "strict-origin-when-cross-origin" };
export const dynamic = "force-dynamic";

/**
 * Q18 public registration page for a public event's published registration form. The event is read with the visitor's own
 * client (RLS: only published/on-sale/live public events), so private and children's events never resolve here. The published
 * form (immutable per version) is read with the service client after a per-IP limit; submission goes through the rate-limited
 * `submitRegistration` → service-only `submit_registration`, which re-validates every answer, capacity, window and per-email
 * limit. Sensitive answers are stored apart from the organiser-visible ones.
 */
export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) notFound();
  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!(await rateLimit(`reg:view:${ip}`, 120, 600))) throw new Error("Too many requests. Please try again shortly.");
  const sb = await createClient();
  const isId = /^[0-9a-f-]{36}$/i.test(slug);
  const { data: ev } = await sb.from("events_public").select("id,name,slug,starts_at,ends_at,timezone,cover_image,location,city,event_type,status,visibility").eq(isId ? "id" : "slug", slug).maybeSingle();
  if (!ev || ev.visibility !== "public" || !["published", "on_sale", "live"].includes(ev.status) || ev.event_type === "childrens_party") notFound();
  const db = untyped(createAdminClient() as never);
  const { data: form } = await db.from("registration_forms").select("id,title,fields,capacity,approval_required,waitlist,opens_at,closes_at,version").eq("event_id", ev.id).eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: { user } } = await sb.auth.getUser();
  const tz = ev.timezone || "Europe/London";
  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const f = form as { id: string; title: string; fields: Field[]; capacity: number | null; approval_required: boolean; waitlist: boolean; opens_at: string | null; closes_at: string | null } | null;
  const now = requestTime();
  const win = !f ? "none" : f.opens_at && Date.parse(f.opens_at) > now ? "not_open" : f.closes_at && Date.parse(f.closes_at) < now ? "closed" : "open";
  const back = `/events/${ev.slug ?? ev.id}`;

  return <div className="gf">
    <Link className="gf-back" href={back}><ArrowLeft size={15} aria-hidden />Back to event</Link>
    <section className="gf-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ev.cover_image || "/assets/gd/hero-discover.webp"} alt="" />
      <div><span className="gf-chip"><Users size={12} aria-hidden />Registration</span><h1>{ev.name}</h1>
        <p>{ev.starts_at && <><span><CalendarDays size={16} aria-hidden />{day(ev.starts_at)}</span><span><Clock size={16} aria-hidden />{time(ev.starts_at)}{ev.ends_at ? ` – ${time(ev.ends_at)}` : ""}</span></>}{(ev.location || ev.city) && <span><MapPin size={16} aria-hidden />{ev.location || ev.city}</span>}</p></div>
    </section>
    <div className="gf-grid">
      <section className="gf-card">
        <h2 className="gf-h1">{f?.title || "Register"}</h2>
        {win === "none" ? <><p className="gf-sub">This event doesn&apos;t take registrations.</p><Link className="k-btn outline" href={back}>See tickets and details</Link></>
          : win === "not_open" ? <p className="gf-msg" role="status">Registration opens {day(f!.opens_at!)} at {time(f!.opens_at!)}.</p>
          : win === "closed" ? <p className="gf-msg bad" role="status">Registration has closed.</p>
          : <><p className="gf-sub">{f!.approval_required ? "The organiser reviews each registration and will confirm your place by email." : "Your place is confirmed when you submit, while spaces last."}{f!.waitlist ? " If it's full, you'll join the waiting list." : ""}</p>
            <RegistrationForm formId={f!.id} fields={Array.isArray(f!.fields) ? f!.fields : []} defaults={{ email: user?.email ?? "" }} /></>}
      </section>
      <aside className="gf-card gf-side">
        <h2>How your details are used</h2>
        <ul><li>The organiser of this event sees your name, email and answers.</li><li>Answers marked <em>private</em> are kept separately and shown only to the organiser&apos;s owners and managers.</li><li>You can register {user ? "with your account" : "without an account"}; we&apos;ll email your confirmation.</li></ul>
        <Link className="k-link" href="/privacy">Privacy notice</Link>
      </aside>
    </div>
  </div>;
}
