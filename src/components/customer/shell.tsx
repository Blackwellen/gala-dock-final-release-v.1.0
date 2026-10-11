"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Search, MessageSquare, Bell, CircleHelp, ChevronDown, User, Ticket, Heart, CalendarDays, Sparkles, Star, LogOut, Briefcase, Compass, Menu as MenuIcon, X } from "lucide-react";
import { Menu, useAction } from "@/components/kit/client";
import { DensitySwitch } from "@/components/kit/density";
import { markNotificationsRead } from "@/lib/actions/shell";
import { relative } from "@/lib/format";

export const CU_NAV = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/plan", label: "Plan an Event", icon: Sparkles },
  { href: "/account/events", label: "My Events", icon: CalendarDays },
  { href: "/account/tickets", label: "My Tickets", icon: Ticket },
  { href: "/account/saved", label: "Saved", icon: Heart },
] as const;

type Props = { children: ReactNode; user: { name: string; email: string; avatar?: string | null }; unread: number; notifications: { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string }[]; threads: { id: string; title: string; href: string; at: string; unread: boolean }[]; hasWorkspace: boolean };

export function CustomerShell({ children, user, unread, notifications, threads, hasWorkspace }: Props) {
  const pathname = usePathname(); const router = useRouter(); const params = useSearchParams(); const { run } = useAction();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); document.getElementById("cu-search")?.focus(); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/") || (href === "/plan" && pathname.startsWith("/plan"));
  return <div className="k-root c-root">
    <a href="#main" className="k-sr">Skip to content</a>
    <header className="c-top">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Link href="/discover" className="c-logo" aria-label="Gala Dock — Discover"><img src="/brand/gala-dock-logo.png" alt="Gala·Dock" width={178} height={46} /></Link>
      <form className="c-search" role="search" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value.trim(); router.push(`/discover?${new URLSearchParams({ tab: params.get("tab") ?? "events", ...(v ? { q: v } : {}) })}`); }}>
        <Search size={18} aria-hidden /><input id="cu-search" name="q" defaultValue={pathname === "/discover" ? params.get("q") ?? "" : ""} placeholder="Search events, venues, artists, or experiences..." aria-label="Search events, venues and services" /><kbd>⌘ K</kbd>
      </form>
      <nav className="c-nav" aria-label="Main">{CU_NAV.map(n => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>{n.label}</Link>)}</nav>
      <div className="c-icons">
        <Menu label="Messages" width={320} trigger={({ open, toggle, id }) => <button className="c-icon" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Messages"><MessagePulse />{threads.some(t => t.unread) && <i className="o-dot" />}</button>}>
          {close => <><div style={{ padding: "6px 10px" }}><b>Messages</b></div>{threads.length ? threads.map(t => <Link key={t.id} role="menuitem" href={t.href} className="k-menu-item" onClick={close}><MessageSquare size={15} className={t.unread ? "k-blue" : "k-muted"} aria-hidden /><span className="k-grow" style={{ fontWeight: t.unread ? 650 : 500 }}>{t.title}<small>{relative(t.at)}</small></span></Link>) : <p className="k-small" style={{ padding: 10 }}>No conversations yet. Messages with venues and suppliers appear here once you send a request.</p>}</>}
        </Menu>
        <Menu label="Notifications" width={340} trigger={({ open, toggle, id }) => <button className="c-icon" onClick={() => { toggle(); if (!open && unread) void run(() => markNotificationsRead()); }} aria-expanded={open} aria-controls={id} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}><Bell size={21} />{unread > 0 && <i className="o-dot" />}</button>}>
          {close => <><div style={{ padding: "6px 10px" }}><b>Notifications</b></div>{notifications.length ? notifications.map(n => <Link key={n.id} role="menuitem" href={n.link} className="k-menu-item" onClick={close}><Bell size={15} className={n.read_at ? "k-muted" : "k-blue"} aria-hidden /><span className="k-grow"><span style={{ fontWeight: n.read_at ? 500 : 650 }}>{n.title}</span><small>{n.body} · {relative(n.created_at)}</small></span></Link>) : <p className="k-small" style={{ padding: 10 }}>You&apos;re all caught up.</p>}</>}
        </Menu>
        <Link className="c-icon" href="/help" aria-label="Help"><CircleHelp size={21} /></Link>
        <Menu label="Account" width={240} trigger={({ open, toggle, id }) => <button className="c-avatar" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Account menu">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.avatar || "/assets/gd/av-alex-customer.webp"} alt="" /><ChevronDown size={16} aria-hidden /></button>}>
          {close => <><div style={{ padding: "8px 10px" }}><b>{user.name}</b><div className="k-xs k-muted">{user.email}</div></div><div className="k-menu-sep" />
            <DensitySwitch /><div className="k-menu-sep" /><Link role="menuitem" className="k-menu-item" href="/account" onClick={close}><User size={15} aria-hidden />My account</Link>
            <Link role="menuitem" className="k-menu-item" href="/account/events" onClick={close}><CalendarDays size={15} aria-hidden />My events</Link>
            <Link role="menuitem" className="k-menu-item" href="/account/tickets" onClick={close}><Ticket size={15} aria-hidden />My tickets</Link>
            <Link role="menuitem" className="k-menu-item" href="/account/reviews" onClick={close}><Star size={15} aria-hidden />Reviews</Link>
            <div className="k-menu-sep" />
            <Link role="menuitem" className="k-menu-item" href={hasWorkspace ? "/organizer" : "/onboarding/organizer?step=1"} onClick={close}><Briefcase size={15} aria-hidden />{hasWorkspace ? "Organizer workspace" : "Become an organizer"}</Link>
            <form action="/auth/signout" method="post"><button role="menuitem" className="k-menu-item" type="submit"><LogOut size={15} aria-hidden />Sign out</button></form></>}
        </Menu>
        <button className="c-burger k-icon-btn plain" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><MenuIcon size={20} /></button>
      </div>
    </header>
    {open && <div className="c-sheet" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="k-between" style={{ marginBottom: 10 }}><b>Menu</b><button className="k-icon-btn plain" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <form role="search" onSubmit={e => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value; router.push(`/discover?q=${encodeURIComponent(v)}`); }}><div className="k-input-icon"><Search size={15} /><input className="k-input" name="q" placeholder="Search events, venues, services" aria-label="Search" /></div></form>
      {CU_NAV.map(n => <Link key={n.href} href={n.href} className="k-menu-item" aria-current={active(n.href) ? "page" : undefined}><n.icon size={17} aria-hidden />{n.label}</Link>)}
    </div>}
    <main id="main" className="c-main">{children}</main>
    <nav className="c-tabbar" aria-label="Quick navigation">{CU_NAV.map(n => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}><n.icon size={20} aria-hidden /><span>{n.label === "Plan an Event" ? "Plan" : n.label}</span></Link>)}</nav>
  </div>;
}

/** Speech bubble with an activity trace — the messages glyph used in the customer top bar designs. */
function MessagePulse() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12.5V17a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H5A1.5 1.5 0 0 1 3.5 17V6A1.5 1.5 0 0 1 5 4.5h9" /><path d="M7 13l2.2-2.4 2 2 2.3-3 1.5 1.6" /></svg>;
}
