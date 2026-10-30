import type { Metadata } from "next";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { calendar, cityLabel, type CalendarRange } from "@/lib/public/directory";
import { EventCard } from "@/components/public/directory-view";

export const metadata: Metadata = { title: "Events calendar", description: "What's on today, this weekend and this month — public events on Gala Dock by day.", alternates: { canonical: "/events/calendar" } };
const TZ = "Europe/London";
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Calendar (Q23 calendar_window / calendar_events): one day, the weekend (Fri 17:00 → Mon 00:00 UK time) or a month, grouped by local day. */
export default async function EventsCalendar({ searchParams }: PageProps<"/events/calendar">) {
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const range = (["today", "weekend", "month"].includes(sp.range ?? "") ? sp.range : "weekend") as CalendarRange;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : ymd(new Date());
  const city = /^[a-z0-9][a-z0-9 -]{0,60}$/.test(sp.city ?? "") ? sp.city! : null;
  const sb = (await createClient()) as unknown as SupabaseClient;
  const c = await calendar(sb, range, date, city ? "city" : "all", city, 100);
  const step = range === "today" ? 1 : range === "weekend" ? 7 : 0;
  const prev = range === "month" ? addMonths(date, -1) : addDays(date, -step), next = range === "month" ? addMonths(date, 1) : addDays(date, step);
  const href = (o: Record<string, string>) => `/events/calendar?${new URLSearchParams({ range, date, ...(city ? { city } : {}), ...o })}`;
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, ...o });
  const title = !c ? "Calendar" : range === "today" ? fmt(c.from, { weekday: "long", day: "numeric", month: "long" }) : range === "weekend" ? `Weekend of ${fmt(c.from, { day: "numeric", month: "long" })}` : fmt(c.from, { month: "long", year: "numeric" });
  return <div className="dir dir-calpage">
    <section className="dir-hero slim"><div className="dir-hero-in"><span className="dir-eyebrow"><CalendarDays size={12} aria-hidden />What&apos;s on{city ? ` in ${cityLabel(city)}` : ""}</span><h1>{title}</h1>
      <p>{c ? `${c.total} public event${c.total === 1 ? "" : "s"}${range === "weekend" ? " from Friday 5pm to Sunday night" : ""} (UK time).` : "The calendar is unavailable right now."}</p></div></section>
    <div className="dir-calbar">
      <div className="dir-chips" role="group" aria-label="Range">{(["today", "weekend", "month"] as const).map(r => <Link key={r} href={href({ range: r })} aria-current={range === r ? "page" : undefined}>{r === "today" ? "Day" : r === "weekend" ? "Weekend" : "Month"}</Link>)}</div>
      <span className="dir-calnav"><Link className="k-btn outline sm" href={href({ date: prev })}><ChevronLeft size={15} aria-hidden />Earlier</Link><Link className="k-btn outline sm" href={href({ date: ymd(new Date()) })}>Today</Link><Link className="k-btn outline sm" href={href({ date: next })}>Later<ChevronRight size={15} aria-hidden /></Link></span>
      {city ? <Link className="dir-citytag" href={`/events/calendar?${new URLSearchParams({ range, date })}`} aria-label={`Remove the ${cityLabel(city)} filter`}><MapPin size={13} aria-hidden />{cityLabel(city)}<X size={13} aria-hidden /></Link> : null}
    </div>
    {c && c.days.length ? c.days.map(d => <section key={d.date} className="dir-sec dir-daysec" aria-label={fmt(`${d.date}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })}>
      <h2>{fmt(`${d.date}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })} <span>({d.events.length})</span></h2>
      <div className="dir-cards">{d.events.map(e => <EventCard key={e.id} e={e} />)}</div></section>)
      : <div className="dir-empty"><CalendarDays size={26} aria-hidden /><b>Nothing listed for these dates</b><p>Try the next weekend or the whole month.</p><Link className="k-btn outline" href={href({ range: "month" })}>See this month</Link></div>}
  </div>;
}
