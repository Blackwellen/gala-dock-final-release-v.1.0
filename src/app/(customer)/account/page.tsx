import Link from "next/link";
import { MfaCard } from "@/components/security/mfa-card";
import { SessionsCard } from "@/components/security/sessions-card";
import { PasskeysCard } from "@/components/security/passkeys-card";
import { PrivacyCard } from "@/components/security/privacy-card";
import { User, CreditCard, Bell, ShieldCheck, CalendarDays, Bookmark, Sparkles, Crown, ArrowRight, ChevronRight, CheckCircle2, CalendarCheck, Ticket, MessageSquare, Megaphone, FileText, Clock4 } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { savedCards } from "@/lib/payments";
import { ProfileDetails, AvatarButton, CardsPanel, IdentityList, NotificationPrefs, QuickActions, PasswordCard, DeletionCard } from "@/components/customer/account-client";
import { CalendarConnectSection } from "@/components/shared/calendar-connect-section";

export const metadata = { title: "My Account" };
const COUNTRIES: Record<string, string> = { GB: "United Kingdom", IE: "Ireland", US: "United States", FR: "France", DE: "Germany", ES: "Spain", IT: "Italy", NL: "Netherlands", PT: "Portugal", AE: "United Arab Emirates" };
const LANGS: Record<string, string> = { en: "English", fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", pt: "Português", nl: "Nederlands", pl: "Polski", ar: "العربية", zh: "中文" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer();
  const tab = (["payments", "notifications", "security"].includes(sp.tab ?? "") ? sp.tab : "profile") as "profile" | "payments" | "notifications" | "security";
  const now = new Date().toISOString();
  const [{ data: p }, { count: upcoming }, { count: past }, { count: saved }, { count: reviews }, { count: tickets }, cards] = await Promise.all([
    ctx.supabase.from("profiles").select("full_name,phone,country,language,bio,date_of_birth,notifications,avatar_url,created_at,identity_verified,deletion_requested_at,marketing_opt_in").eq("id", ctx.user.id).single(),
    ctx.supabase.from("events").select("id", { count: "exact", head: true }).eq("owner_id", ctx.user.id).gte("starts_at", now).neq("status", "cancelled"),
    ctx.supabase.from("events").select("id", { count: "exact", head: true }).eq("owner_id", ctx.user.id).lt("starts_at", now),
    ctx.supabase.from("saved_items").select("item_key", { count: "exact", head: true }).eq("user_id", ctx.user.id).not("item_key", "like", "notify:%"),
    ctx.supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id),
    ctx.supabase.from("tickets").select("id", { count: "exact", head: true }).eq("holder_id", ctx.user.id).eq("status", "valid"),
    savedCards(ctx),
  ]);
  const n = (p?.notifications ?? {}) as Record<string, boolean>;
  const prefs = { event_updates: n.event_updates ?? true, tickets: n.tickets ?? true, messages: n.messages ?? true, marketing: n.marketing ?? !!p?.marketing_opt_in, reminders: n.reminders ?? true, quotes: n.quotes ?? true };
  const identities = (ctx.user.identities ?? []).map(i => ({ id: i.identity_id ?? i.id, provider: i.provider, email: String((i.identity_data as { email?: string } | undefined)?.email ?? ctx.user.email ?? "") }));
  const verified = !!ctx.user.email_confirmed_at;
  const profile = { full_name: p?.full_name || ctx.name, phone: p?.phone ?? "", country: p?.country ?? "GB", language: p?.language ?? "en", bio: p?.bio ?? "", date_of_birth: p?.date_of_birth ?? "" };
  const tabs = [["profile", User, "Profile"], ["payments", CreditCard, "Payments"], ["notifications", Bell, "Notifications"], ["security", ShieldCheck, "Privacy & Security"]] as const;
  const notifRows = [["event_updates", CalendarCheck, "Event updates", "Changes to your events and bookings"], ["tickets", Ticket, "Ticket notifications", "Upcoming events, ticket sales and entry information"], ["messages", MessageSquare, "Messages", "New messages from venues and suppliers"], ["marketing", Megaphone, "Marketing updates", "News, offers and personalised recommendations"]] as const;
  const extraRows = [["quotes", FileText, "Quotes & responses", "When providers reply, quote or a deadline is near"], ["reminders", Clock4, "Reminders", "Payment due dates, tasks and event countdowns"]] as const;

  const profileCard = <section className="ce-card ac-card ac-me">
    <div className="ac-cover">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/gd/hero-wedding-compact.webp" alt="" /></div>
    <AvatarButton url={p?.avatar_url ?? null} name={profile.full_name} />
    <div className="ac-me-name"><span className="k-grow"><b>{profile.full_name}</b><small>{ctx.user.email}</small></span>{verified && <span className="ac-verified"><CheckCircle2 size={15} />Verified</span>}<Link href="/account?tab=security" aria-label="Account security"><ChevronRight size={18} /></Link></div>
    <dl className="ac-stats">{([[CalendarDays, "Member since", new Date(p?.created_at ?? ctx.user.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), "/account/events"], [CalendarDays, "Upcoming events", upcoming ?? 0, "/account/events"], [CalendarDays, "Past events", past ?? 0, "/account/events?tab=past"], [Ticket, "Active tickets", tickets ?? 0, "/account/tickets"], [Bookmark, "Saved items", saved ?? 0, "/account/saved"], [Sparkles, "Reviews written", reviews ?? 0, "/account/reviews?tab=submitted"]] as const).map(([I, l, v, h]) => <div key={l}><dt><I size={17} /><Link href={h}>{l}</Link></dt><dd>{v}</dd></div>)}</dl>
    <div className="ac-more"><Crown size={22} className="ac-crown" /><div><b>Get more from Gala Dock</b><p>Create and organise your own events, sell tickets and access exclusive member benefits.</p></div><Link className="k-btn outline ac-plan" href="/plan">Plan an Event <ArrowRight size={16} /></Link></div>
  </section>;

  return <div className="ac">
    <h1>My Account</h1><p className="ac-sub">Manage your details, payments, notifications and security preferences.</p>
    <nav className="ce-card ac-tabs" aria-label="Account sections">{tabs.map(([k, I, l]) => <Link key={k} href={k === "profile" ? "/account" : `/account?tab=${k}`} aria-current={tab === k ? "page" : undefined}><I size={20} />{l}</Link>)}</nav>
    {p?.deletion_requested_at && <div className="k-notice red ac-del"><ShieldCheck size={16} />Your account is scheduled for deletion on {new Date(new Date(p.deletion_requested_at).getTime() + 30 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. <DeletionCard scheduled inline /></div>}
    {tab === "profile" && <div className="ac-grid">
      {profileCard}
      <div className="ac-col">
        <ProfileDetails profile={profile} email={ctx.user.email ?? ""} verified={verified} countries={COUNTRIES} langs={LANGS} />
        <CardsPanel cards={cards} compact />
      </div>
      <div className="ac-col">
        <section className="ce-card ac-card"><h2>Connected accounts &amp; calendar</h2><p className="ac-hint">Link your calendar and other accounts to make planning easier.</p><CalendarConnectSection returnTo="/account?tab=profile" /><h3 className="ac-h3">Connected accounts</h3><IdentityList identities={identities} /></section>
        <NotificationPrefs prefs={prefs} rows={notifRows.map(([k, , t, d]) => ({ key: k, title: t, desc: d }))} />
        <QuickActions />
      </div>
    </div>}
    {tab === "payments" && <div className="ac-grid two">{profileCard}<div className="ac-col"><CardsPanel cards={cards} /><section className="ce-card ac-card"><h2>Payment history</h2><p className="ac-hint">Deposits, balances and ticket orders are listed in each event&apos;s Money tab and in My Tickets.</p><div className="k-row" style={{ gap: 10 }}><Link className="k-btn outline" href="/account/events">Event payments</Link><Link className="k-btn outline" href="/account/tickets">Ticket orders</Link></div></section></div></div>}
    {tab === "notifications" && <div className="ac-grid two">{profileCard}<div className="ac-col"><NotificationPrefs prefs={prefs} rows={[...notifRows, ...extraRows].map(([k, , t, d]) => ({ key: k, title: t, desc: d }))} editable /></div></div>}
    {tab === "security" && <div className="ac-grid two">{profileCard}<div className="ac-col"><MfaCard required={sp.mfa === "required" ? (typeof sp.ws === "string" ? sp.ws.slice(0, 80) : "Your workspace") : null} /><PasswordCard /><PasskeysCard /><SessionsCard /><PrivacyCard /><section className="ce-card ac-card"><h2>Sign-in methods</h2><p className="ac-hint">Accounts you can use to sign in to Gala Dock.</p><IdentityList identities={identities} /></section><section className="ce-card ac-card"><h2>Your data</h2><p className="ac-hint">Download a copy of your profile, events, tickets, reviews and messages.</p><a className="k-btn outline" href="/api/account/export" download>Download my data</a></section><DeletionCard scheduled={!!p?.deletion_requested_at} /></div></div>}
  </div>;
}
