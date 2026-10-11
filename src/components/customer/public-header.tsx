import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/** Header for public pages: same look as the customer top bar; signed-in visitors get their avatar, others sign in. */
export async function PublicHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = user ? await supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle() : { data: null };
  const name = p?.full_name || user?.email?.split("@")[0] || "";
  return <header className="c-top pub-top">
    <Link href={user ? "/home" : "/"} className="c-logo" aria-label="Gala Dock"><img src="/brand/gala-dock-logo.png" alt="Gala·Dock" width={178} height={46} /></Link>
    <form className="c-search" action="/discover" role="search"><Search size={18} aria-hidden /><input name="q" placeholder="Search events, venues, artists, or experiences..." aria-label="Search" /></form>
    <nav className="c-nav" aria-label="Main"><Link href="/discover">Discover</Link><Link href="/plan">Plan an Event</Link>{user && <><Link href="/account/events">My Events</Link><Link href="/account/tickets">My Tickets</Link><Link href="/account/saved">Saved</Link></>}</nav>
    <div className="c-icons pub-right">{user ? <Link href="/home" className="c-avatar" aria-label="Your account">{p?.avatar_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatar_url} alt="" /> : <span className="c-initials">{name.slice(0, 1).toUpperCase()}</span>}</Link>
      : <><Link className="k-btn ghost" href="/login">Sign in</Link><Link className="k-btn primary" href="/register">Get started</Link></>}</div>
  </header>;
}
