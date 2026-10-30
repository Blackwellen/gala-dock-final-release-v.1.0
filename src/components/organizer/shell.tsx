"use client";
import Link from "next/link";
import { GalaLogo } from "@/components/brand/gala-logo";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { House, CalendarDays, Calendar, ChartNoAxesColumnIncreasing, MessageCircle, Store, Ticket, Users, Wallet, Sparkles, Settings, Plus, ChevronDown, Bell, CircleHelp, Menu as MenuIcon, X, ArrowRight, FileText, UserPlus, Megaphone, Receipt, Send, LogOut, User, Building2, Check, Store as StoreIcon, Palette } from "lucide-react";
import { Menu, useAction } from "@/components/kit/client";
import { DensitySwitch } from "@/components/kit/density";
import { switchWorkspace, markNotificationsRead } from "@/lib/actions/shell";
import { relative } from "@/lib/format";
import { MobileNav } from "@/components/pwa/mobile-nav";
import { GlobalSearch } from "@/components/search/global-search";
import { RecentMessages } from "@/components/messaging/avatar";
import type { RecentConversation } from "@/lib/messaging/recent";

export type ShellWorkspace = { id: string; name: string; kind: string; role: string; cover_image?: string | null };
export type ShellNote = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string };
type Props = { children: ReactNode; user: { name: string; email: string; avatar?: string | null }; workspace: ShellWorkspace; workspaces: ShellWorkspace[]; unread: number; notifications: ShellNote[]; threads: RecentConversation[] };

export const ORG_NAV = [
  { href: "/organizer", label: "Home", icon: House, exact: true },
  { href: "/organizer/events", label: "Events", icon: CalendarDays },
  { href: "/organizer/calendar", label: "Calendar", icon: Calendar },
  { href: "/organizer/sales", label: "Sales", icon: ChartNoAxesColumnIncreasing, also: ["/organizer/proposals"] },
  { href: "/organizer/marketplace", label: "Marketplace", icon: Store },
  { href: "/organizer/tickets", label: "Tickets & Promotion", icon: Ticket },
  { href: "/organizer/media", label: "Media Studio", icon: Palette },
  { href: "/organizer/team", label: "Team", icon: Users },
  { href: "/organizer/money", label: "Money", icon: Wallet },
  { href: "/organizer/agent", label: "Gala Agent", icon: Sparkles, beta: true },
  { href: "/organizer/settings", label: "Settings", icon: Settings },
] as const;

const CREATE = [
  { href: "/organizer/events/new?step=1", label: "New event", sub: "Plan a professional event", icon: CalendarDays },
  { href: "/organizer/sales?new=lead", label: "Add lead", sub: "Capture an enquiry", icon: UserPlus },
  { href: "/organizer/proposals/new?step=1", label: "Create proposal", sub: "Send a priced offer", icon: FileText },
  { href: "/organizer/marketplace/requests/new?step=1", label: "Marketplace request", sub: "RFQ venues & suppliers", icon: StoreIcon },
  { href: "/organizer/money/invoices/new?step=1", label: "Create invoice", sub: "Bill a client", icon: Receipt },
  { href: "/organizer/team?invite=1", label: "Invite people", sub: "Members or external crew", icon: Send },
];

export function isActive(pathname: string, item: { href: string; exact?: boolean; also?: readonly string[] }) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/") || !!item.also?.some(a => pathname.startsWith(a));
}

export function OrganizerShell({ children, user, workspace, workspaces, unread, notifications, threads }: Props) {
  const pathname = usePathname(); const router = useRouter(); const { run } = useAction();
  const [navOpen, setNavOpen] = useState(false); const [q, setQ] = useState("");
  // Close the mobile menu on navigation (reset-on-change during render, not in an effect).
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) { setNavPath(pathname); setNavOpen(false); }
  const nav = <nav aria-label="Organizer" className="o-nav">{ORG_NAV.map(item => { const active = isActive(pathname, item); const Icon = item.icon; return <Link key={item.href} href={item.href} className="o-nav-item" aria-current={active ? "page" : undefined}><Icon size={21} aria-hidden strokeWidth={1.9} className={item.label === "Gala Agent" ? "o-agent-icon" : undefined} /><span>{item.label}</span>{"beta" in item && item.beta && <span className="k-beta">BETA</span>}</Link>; })}</nav>;
  const agentCard = <form className="o-side-agent" onSubmit={e => { e.preventDefault(); router.push(`/organizer/agent${q ? `?goal=${encodeURIComponent(q)}` : ""}`); }}>
    <div className="k-row" style={{ gap: 8 }}><Sparkles size={22} className="o-agent-icon" aria-hidden /><b>Gala Agent</b><span className="k-beta">BETA</span></div>
    <p>{pathname.startsWith("/organizer/team") ? "Build staffing plans, check availability and assign crew with AI." : pathname.startsWith("/organizer/marketplace") ? "Find the best suppliers for your event with AI." : pathname.startsWith("/organizer/money") ? "Draft invoice reminders, analyse payment risk and track cash flow with AI." : "Get an operational brief, find suppliers or update an event..."}</p>
    <div className="o-side-ask"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask anything..." aria-label="Ask Gala Agent" /><button type="submit" aria-label="Open Gala Agent"><ArrowRight size={16} /></button></div>
  </form>;

  return <div className="k-root o-root">
    <a href="#main" className="k-sr" style={{ position: "absolute" }}>Skip to content</a>
    <MobileNav home="/organizer" title={workspace.name} search={{ seat: workspace.id, placeholder: "Search events, venues, suppliers, clients…" }}
      tabs={ORG_NAV.filter(n => ["Home", "Events", "Calendar", "Marketplace"].includes(n.label))}
      menu={[...ORG_NAV.filter(n => n.label !== "Money" || ["owner", "manager", "finance"].includes(workspace.role)), { href: "/organizer/inbox", label: "Messages", icon: MessageCircle }, { href: "/organizer/help", label: "Help", icon: CircleHelp }]}
      create={[...CREATE.filter(c => ["owner", "manager"].includes(workspace.role) || (workspace.role === "finance" && c.label === "Create invoice")), ...(["owner","manager","member"].includes(workspace.role) ? [{ href: "/organizer/media?create=1", label: "New design", icon: Palette }] : []), ...(["owner","manager","member","finance"].includes(workspace.role) ? [{ href: "/organizer/agent#compose", label: "Agent run", icon: Sparkles }] : [])]}
      messagesHref="/organizer/inbox" unreadMessages={threads.some(t => t.unread)} notifications={notifications} unread={unread} onReadNotifications={() => { if (unread) void run(() => markNotificationsRead()); }}
      workspaceSwitcher={<>{workspaces.map(w => <button key={w.id} type="button" disabled={w.id === workspace.id} onClick={async () => { await run(() => switchWorkspace(w.id)); }}><Building2 size={18} aria-hidden /><span>{w.name} · {w.kind} · {w.role}</span>{w.id === workspace.id && <Check size={16} aria-hidden />}</button>)}<Link href="/discover">Customer app</Link></>} />
    <header className="o-top pwa-hide-desktop-nav">
      <div className="o-top-l">
      <button className="o-burger k-icon-btn plain" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><MenuIcon size={20} /></button>
      <Link href="/organizer" className="o-logo" aria-label="Gala Dock — Organizer home"><GalaLogo /></Link>
      <Menu label="Switch workspace" align="left" width={280} trigger={({ open, toggle, id }) => <button className="o-ws" onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={workspace.cover_image || "/assets/gd/oe-neon.webp"} alt="" /><span className="k-ellipsis">{workspace.name}</span><ChevronDown size={16} aria-hidden /></button>}>
        {close => <>
          <div className="k-xs k-muted" style={{ padding: "6px 10px" }}>Your workspaces</div>
          {workspaces.map(w => <button key={w.id} role="menuitem" className="k-menu-item" onClick={async () => { close(); if (w.id !== workspace.id) await run(() => switchWorkspace(w.id)); }}>
            <Building2 size={16} aria-hidden /><span className="k-grow">{w.name}<small>{w.kind === "organizer" ? "Organizer" : w.kind === "provider" ? "Provider" : w.kind} · {w.role}</small></span>{w.id === workspace.id && <Check size={15} className="k-blue" aria-hidden />}</button>)}
          <div className="k-menu-sep" />
          <Link role="menuitem" className="k-menu-item" href="/discover" onClick={close}><User size={16} aria-hidden />Customer app</Link>
          <Link role="menuitem" className="k-menu-item" href="/onboarding" onClick={close}><Plus size={16} aria-hidden />Create a workspace</Link>
        </>}
      </Menu></div>
      <div className="o-search o-gs"><GlobalSearch seat={workspace.id} placeholder="Search events, venues, suppliers, clients, or anything..." /></div>
      <div className="o-top-r">
      <Menu label="Create" width={260} trigger={({ open, toggle, id }) => <div className="k-split o-create"><Link href="/organizer/events/new?step=1" className="k-btn primary"><Plus size={17} aria-hidden />Create</Link><button className="k-btn primary" onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu" aria-label="More create options"><ChevronDown size={16} /></button></div>}>
        {close => CREATE.map(c => <Link key={c.href} role="menuitem" href={c.href} className="k-menu-item" onClick={close}><c.icon size={16} className="k-blue" aria-hidden /><span>{c.label}<small>{c.sub}</small></span></Link>)}
      </Menu>
      <Menu label="Messages" width={330} trigger={({ open, toggle, id }) => <button className="o-top-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Messages"><span className="o-badge-wrap"><MessageCircle size={21} aria-hidden />{threads.some(t => t.unread) && <i className="o-dot" />}</span><span className="o-top-lbl">Messages</span></button>}>
        {close => <><div className="k-between" style={{ padding: "6px 10px" }}><b>Messages</b></div>
          <RecentMessages items={threads} inbox="/organizer/inbox" onPick={close} empty="No conversations yet. Message suppliers, clients and your team from the inbox." />
        </>}
      </Menu>
      <Menu label="Notifications" width={340} trigger={({ open, toggle, id }) => <button className="o-top-btn" aria-label="Notifications" onClick={() => { toggle(); if (!open && unread) void run(() => markNotificationsRead(), { refresh: true }); }} aria-expanded={open} aria-controls={id}><span className="o-badge-wrap"><Bell size={20} aria-hidden />{unread > 0 && <i className="o-dot" aria-label={`${unread} unread`} />}</span><span className="o-top-lbl">Notifications</span></button>}>
        {close => <><div style={{ padding: "6px 10px" }}><b>Notifications</b></div>
          {notifications.length ? notifications.map(n => <Link key={n.id} role="menuitem" href={n.link} className="k-menu-item" onClick={close}><Bell size={15} aria-hidden className={n.read_at ? "k-muted" : "k-blue"} /><span className="k-grow"><span style={{ fontWeight: n.read_at ? 500 : 650 }}>{n.title}</span><small>{n.body} · {relative(n.created_at)}</small></span></Link>) : <p className="k-small" style={{ padding: 10 }}>You&apos;re all caught up.</p>}
        </>}
      </Menu>
      <Link href="/help?from=organizer" className="o-top-btn o-top-help" aria-label="Help"><CircleHelp size={20} aria-hidden /><span className="o-top-lbl">Help</span></Link>
      <Menu label="Account" width={240} trigger={({ open, toggle, id }) => <button className="o-avatar" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="Account menu">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.avatar || "/assets/gd/av-alex-organizer.webp"} alt="" /><ChevronDown size={16} aria-hidden /></button>}>
        {close => <><div style={{ padding: "8px 10px" }}><b>{user.name}</b><div className="k-xs k-muted">{user.email}</div></div><div className="k-menu-sep" />
          <DensitySwitch /><div className="k-menu-sep" /><Link role="menuitem" className="k-menu-item" href="/organizer/settings" onClick={close}><Settings size={15} aria-hidden />Workspace settings</Link>
          <Link role="menuitem" className="k-menu-item" href="/account" onClick={close}><User size={15} aria-hidden />My account</Link>
          <Link role="menuitem" className="k-menu-item" href="/discover" onClick={close}><Ticket size={15} aria-hidden />Customer app</Link>
          <div className="k-menu-sep" />
          <form action="/auth/signout" method="post"><button role="menuitem" className="k-menu-item" type="submit"><LogOut size={15} aria-hidden />Sign out</button></form></>}
      </Menu></div>
    </header>
    <aside className={`o-side pwa-hide-desktop-nav ${navOpen ? "open" : ""}`} aria-label="Workspace navigation">
      <div className="o-side-mobile-head"><b>{workspace.name}</b><button className="k-icon-btn plain" aria-label="Close navigation" onClick={() => setNavOpen(false)}><X size={18} /></button></div>
      {nav}{agentCard}
    </aside>
    {navOpen && <div className="o-scrim" onClick={() => setNavOpen(false)} aria-hidden />}
    <main id="main" className="o-main">{children}</main>
    <nav className="o-tabbar pwa-hide-desktop-nav" aria-label="Quick navigation">
      {ORG_NAV.filter(i => ["Home", "Events", "Calendar", "Gala Agent"].includes(i.label)).map(i => <Link key={i.href} href={i.href} aria-current={isActive(pathname, i) ? "page" : undefined}><i.icon size={20} aria-hidden /><span>{i.label === "Gala Agent" ? "Agent" : i.label}</span></Link>)}
      <button onClick={() => setNavOpen(true)} aria-label="More navigation"><MenuIcon size={20} aria-hidden /><span>More</span></button>
    </nav>
  </div>;
}
// Megaphone kept for promotion entry points elsewhere
export const PromoIcon = Megaphone;
