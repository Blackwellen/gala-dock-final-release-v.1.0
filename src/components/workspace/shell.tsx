"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { promoFor } from "./promo-copy";
import { MobileNav, type NavEntry } from "@/components/pwa/mobile-nav";
import { GlobalSearch } from "@/components/search/global-search";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  House, Trophy, CalendarCheck, Calendar, Store, Users, Wallet, Sparkles, Settings, Bell, MessageSquareText, Plus,
  ChevronDown, CircleHelp, Mail, SquareCheckBig, PanelsTopLeft, Ticket, Landmark, Headset, Shield, Headphones, Network,
  ChartColumn, ArrowRight, Building2, LayoutGrid, Wrench, Package, Menu, X, LogOut, Check, type LucideIcon,
  Palette,
} from "lucide-react";
import { Suspense } from "react";
import { DesignScale, DensityPicker } from "./design-scale";
import { DesignOverlay } from "./design-overlay";

const DEV = process.env.NODE_ENV === "development";

/** Official Gala Dock lockup from /public/brand. The PNG carries transparent padding; it is offset so the artwork sits on the design's 174 px footprint. */
export function BrandLogo({ href = "/" }: { href?: string }) {
  return <Link href={href} className="ws-logo" aria-label="Gala Dock home">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/brand/gala-dock-logo.png" alt="Gala·Dock" width={202} height={52} />
  </Link>;
}
function ShellTools() {
  return <><DesignScale />{DEV && <Suspense><DesignOverlay /></Suspense>}</>;
}

/* ───────────────────────── shared primitives ───────────────────────── */

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number; badgeTone?: "red" | "grey"; exact?: boolean; children?: NavItem[]; match?: RegExp;
  /** Group starts expanded on any route except those matching `collapseOn` (the designs keep the catalogue open while managing team, money and settings). */ defaultOpen?: boolean; collapseOn?: RegExp };

function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

function Popover({ label, trigger, children, className = "", align = "right" }: { label: string; trigger: ReactNode; children: ReactNode; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  return <div className={`ws-pop ${className}`} ref={ref}>
    <button type="button" className="ws-pop-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>{trigger}</button>
    {open && <div className={`ws-pop-panel ${align}`} role="menu" onClick={e => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</div>}
  </div>;
}

function isActive(pathname: string, item: NavItem) {
  if (item.match?.test(pathname)) return true;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [openGroup, setOpenGroup] = useState<string | null>(() => (items.find(i => i.children?.some(c => isActive(pathname, c)) || (i.children && isActive(pathname, i)))
    ?? items.find(i => i.children && i.defaultOpen && !i.collapseOn?.test(pathname)))?.href ?? null);
  return <ul className="ws-nav">{items.map(item => {
    const Icon = item.icon;
    const active = isActive(pathname, item) || !!item.children?.some(c => isActive(pathname, c));
    const expanded = openGroup === item.href;
    return <li key={item.href} className={item.children ? `group ${expanded ? "expanded" : ""}` : ""}>
      <div className={`ws-nav-item ${active ? "active" : ""}`}>
        <Link href={item.href} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{item.label}</span>
          {!!item.badge && <b className={`ws-nav-badge ${item.badgeTone ?? "grey"}`}>{item.badge}</b>}</Link>
        {item.children && <button type="button" className="ws-nav-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`} aria-expanded={expanded}
          onClick={() => setOpenGroup(expanded ? null : item.href)}><ChevronDown aria-hidden="true" /></button>}
      </div>
      {item.children && expanded && <ul className="ws-subnav">{item.children.map(child => {
        const ChildIcon = child.icon;
        const childActive = isActive(pathname, child);
        return <li key={child.href}><Link href={child.href} className={childActive ? "active" : ""} aria-current={childActive ? "page" : undefined}><ChildIcon aria-hidden="true" />{child.label}</Link></li>;
      })}</ul>}
    </li>;
  })}</ul>;
}

function PromoCard({ title, text, href, cta = "Open" }: { title: ReactNode; text: string; href: string; cta?: "Open" | "Use" | "Upgrade" }) {
  return <aside className="ws-promo" aria-label="Gala Agent">
    <span className="ws-promo-icon"><Sparkles aria-hidden="true" /></span>
    <h2>{title}</h2><p>{text}</p>
    <Link className="ws-btn primary block" href={href}>{cta === "Upgrade" ? "Upgrade Agent" : `${cta} Gala Agent`} <ArrowRight aria-hidden="true" /></Link>
  </aside>;
}

/** Provider card copy follows the section the user is in (see promo-copy.ts). */
function ProviderPromo({ pathname }: { pathname: string }) {
  const q = useSearchParams();
  const c = promoFor(pathname, new URLSearchParams(q.toString()));
  return <PromoCard title={<>Let Gala Agent<br />{c.title}</>} text={c.text} cta={c.cta} href={c.href ?? "/provider/agent"} />;
}

function Avatar({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="ws-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="ws-avatar initials" style={{ width: size, height: size }} aria-hidden="true">{letters}</span>;
}


function AccountMenu({ name, subtitle, avatar, links, showLabel }: { name: string; subtitle: string; avatar: string; links: { href: string; label: string }[]; showLabel?: boolean }) {
  return <Popover label="Account menu" className="ws-account" trigger={<><Avatar src={avatar} name={name} />{showLabel && <span className="ws-account-label"><b>{name}</b><small>{subtitle}</small></span>}<ChevronDown className="chev" aria-hidden="true" /></>}>
    <div className="ws-pop-head"><b>{name}</b><small>{subtitle}</small></div>
    {links.map(l => <Link key={l.href} href={l.href} role="menuitem">{l.label}</Link>)}
    <DensityPicker />
    <form action="/auth/signout" method="post"><button type="submit" role="menuitem"><LogOut aria-hidden="true" />Sign out</button></form>
  </Popover>;
}

type Notice = { id: string; title: string; body: string; href: string; unread: boolean };
function NoticeList({ items, empty, footer }: { items: Notice[]; empty: string; footer?: { href: string; label: string } }) {
  return <>{items.length ? items.map(n => <Link key={n.id} href={n.href} className={`ws-notice ${n.unread ? "unread" : ""}`} role="menuitem"><b>{n.title}</b><small>{n.body}</small></Link>)
    : <p className="ws-pop-empty">{empty}</p>}{footer && <Link className="ws-pop-footer" href={footer.href}>{footer.label}</Link>}</>;
}

function MobileToggle({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return <button type="button" className="ws-mobile-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>;
}

/* ───────────────────────── Provider shell ───────────────────────── */

export type ProviderShellProps = {
  children: ReactNode;
  workspace: { name: string; capabilityLabel: string; capabilities: string[]; cover: string };
  user: { name: string; avatar: string };
  counts: { opportunities: number; bookings: number; messages: number; notifications: number };
  messages: Notice[]; notifications: Notice[];
  workspaces: { id: string; name: string }[]; activeId: string;
  switchWorkspace: (id: string) => Promise<{ ok: boolean; error?: string; redirect?: string }>;
};

function WorkspaceOption({ id, name, active, onSwitch }: { id: string; name: string; active: boolean; onSwitch: (id: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" role="menuitemradio" aria-checked={active} disabled={active || pending}
    onClick={() => start(async () => { const r = await onSwitch(id); if (r.ok) { router.push("/provider"); router.refresh(); } })}>
    <Building2 aria-hidden="true" /><span>{name}</span>{active && <Check className="ws-check" aria-hidden="true" />}</button>;
}

export function ProviderShell({ children, workspace, user, counts, messages, notifications, workspaces, activeId, switchWorkspace }: ProviderShellProps) {
  const pathname = usePathname();
  // The drawer belongs to the page it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === pathname;
  const setMobileOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const venue = workspace.capabilities.includes("venue"), service = workspace.capabilities.includes("service");
  const listingChildren: NavItem[] = [
    ...(venue ? [{ href: "/provider/listings/venues", label: "Venues", icon: Building2, match: /^\/provider\/venues(?!\/[^/]+\/spaces)(\/|$)/ }, { href: "/provider/listings/spaces", label: "Spaces", icon: LayoutGrid, match: /^\/provider\/venues\/[^/]+\/spaces(\/|$)/ }] : []),
    ...(service ? [{ href: "/provider/listings/services", label: "Services", icon: Wrench, match: /^\/provider\/services(\/|$)/ }] : []),
    { href: "/provider/listings/packages", label: "Packages", icon: Package, match: /^\/provider\/packages(\/|$)/ },
  ];
  const nav: NavItem[] = [
    { href: "/provider", label: "Home", icon: House, exact: true },
    { href: "/provider/opportunities", label: "Opportunities", icon: Trophy, badge: counts.opportunities, badgeTone: "red" },
    { href: "/provider/bookings", label: "Bookings", icon: CalendarCheck, badge: counts.bookings, badgeTone: "grey" },
    { href: "/provider/calendar", label: "Calendar", icon: Calendar },
    { href: "/provider/listings", label: "Listings", icon: Store, children: listingChildren, defaultOpen: true, collapseOn: /^\/provider(\/(opportunities(?!\/[^/]+\/quote)|quotes|bookings|calendar)(\/|$)|\/?$)/ },
    { href: "/provider/media", label: "Media Studio", icon: Palette },
    { href: "/provider/team", label: "Team", icon: Users },
    { href: "/provider/money", label: "Money", icon: Wallet },
    { href: "/provider/agent", label: "Gala Agent", icon: Sparkles },
    { href: "/provider/settings", label: "Settings", icon: Settings },
  ];
  const create = [
    venue && { href: "/provider/bookings/new?step=1", label: "Venue booking" },
    venue && { href: "/provider/venues/new?step=1", label: "Venue" },
    service && { href: "/provider/services/new?step=1", label: "Service" },
    { href: "/provider/packages/new?step=1", label: "Package" },
    { href: "/provider/calendar?action=block", label: "Availability block" },
  ].filter(Boolean) as { href: string; label: string }[];
  const mobileMenu: NavEntry[] = nav.map(n => ({ href: n.href, label: n.label, icon: n.icon, badge: n.badge || null }));
  return <div className={`ws-app provider ${mobileOpen ? "nav-open" : ""}`}>
    <MobileNav menu={mobileMenu} title={workspace.name} home="/provider" search={{ seat: activeId, placeholder: "Search events, bookings, venues, services…" }} />
    <ShellTools />
    <header className="ws-topbar pwa-hide-desktop-nav">
      <div className="ws-top-l"><MobileToggle open={mobileOpen} setOpen={setMobileOpen} />
      <div className="ws-brand"><BrandLogo href="/provider" /></div></div>
      <div className="ws-gs"><GlobalSearch seat={activeId} placeholder="Search events, bookings, venues, services, or contacts..." /></div>
      <div className="ws-actions">
        <Popover label="Create" className="ws-create" trigger={<span className="ws-btn primary"><Plus aria-hidden="true" />Create<ChevronDown aria-hidden="true" /></span>}>
          {create.map(c => <Link key={c.href} href={c.href} role="menuitem">{c.label}</Link>)}
        </Popover>
        <Popover label={`Messages, ${counts.messages} unread`} className="ws-icon-pop" trigger={<><MessageSquareText aria-hidden="true" />{counts.messages > 0 && <b className="ws-count">{counts.messages}</b>}</>}>
          <div className="ws-pop-head"><b>Messages</b><small>{counts.messages} unread</small></div>
          <NoticeList items={messages} empty="No conversations yet." footer={{ href: "/provider/inbox", label: "Open inbox" }} />
        </Popover>
        <Popover label={`Notifications, ${counts.notifications} unread`} className="ws-icon-pop" trigger={<><Bell aria-hidden="true" />{counts.notifications > 0 && <i className="ws-dot" />}</>}>
          <div className="ws-pop-head"><b>Notifications</b></div>
          <NoticeList items={notifications} empty="You’re all caught up." />
        </Popover>
        <Link href="/help" className="ws-icon-link" aria-label="Help"><CircleHelp aria-hidden="true" /></Link>
        <AccountMenu name={user.name} subtitle={workspace.name} avatar={user.avatar} links={[{ href: "/provider/settings", label: "Workspace settings" }, { href: "/discover", label: "Switch to Customer" }]} />
      </div>
    </header>
    <nav className="ws-sidebar pwa-hide-desktop-nav" aria-label="Provider workspace">
      <Popover label="Switch workspace" className="ws-switcher" align="left" trigger={<>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {workspace.cover ? <img src={workspace.cover} alt="" width={52} height={52} /> : <span className="ws-switcher-blank"><Building2 aria-hidden="true" /></span>}
        <span><b>{workspace.name}</b><small>{workspace.capabilityLabel}</small></span><ChevronDown aria-hidden="true" /></>}>
        <div className="ws-pop-head"><b>Provider workspaces</b><small>{workspaces.length} available</small></div>
        {workspaces.map(w => <WorkspaceOption key={w.id} id={w.id} name={w.name} active={w.id === activeId} onSwitch={switchWorkspace} />)}
        <Link href="/provider/settings?tab=capabilities" role="menuitem">Manage capabilities</Link>
        <Link href="/onboarding" role="menuitem">Add another workspace</Link>
      </Popover>
      <NavList items={nav} pathname={pathname} />
      <Suspense fallback={<PromoCard title={<>Let Gala Agent<br />handle the admin</>} text="Get AI-powered confirmations, reminders, team assignments and more." href="/provider/agent" />}><ProviderPromo pathname={pathname} /></Suspense>
    </nav>
    <div className="ws-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
    <main className="ws-main" id="main">{children}</main>
  </div>;
}

/* ───────────────────────── Admin shell ───────────────────────── */

export type AdminShellProps = {
  children: ReactNode;
  user: { name: string; title: string; avatar: string };
  permissions: string[];
  counts: { alerts: number; support: number };
  alerts: Notice[]; support: Notice[];
};

export function AdminShell({ children, user, permissions, counts, alerts, support }: AdminShellProps) {
  const pathname = usePathname();
  // The drawer belongs to the page it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === pathname;
  const setMobileOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const all: (NavItem & { perm?: string | string[] })[] = [
    { href: "/admin", label: "Overview", icon: House, exact: true },
    { href: "/admin/users", label: "Users", icon: Users, perm: "users" },
    { href: "/admin/workspaces", label: "Workspaces", icon: PanelsTopLeft, perm: "workspaces" },
    { href: "/admin/events", label: "Events", icon: Calendar, perm: "events" },
    { href: "/admin/marketplace", label: "Marketplace", icon: Store, perm: "marketplace" },
    { href: "/admin/tickets", label: "Tickets", icon: Ticket, perm: "tickets" },
    { href: "/admin/commerce", label: "Commerce", icon: Landmark, perm: "commerce" },
    { href: "/admin/commerce/payouts", label: "Payouts", icon: Mail, perm: "commerce" },
    // One "Disputes" entry as in the AD designs: booking disputes, cancellation reviews and card chargebacks (tabs on /admin/disputes); trust chargeback cases highlight it too.
    { href: "/admin/disputes", label: "Disputes", icon: Headset, perm: ["support", "marketplace", "commerce", "trust"], match: /^\/admin\/(disputes|trust\/disputes)(\/|$)/ },
    { href: "/admin/trust", label: "Trust & Safety", icon: Shield, perm: "trust" },
    { href: "/admin/support", label: "Support", icon: Headphones, perm: "support", match: /^\/admin\/(support|conversations)(\/|$)/ },
    { href: "/admin/partners", label: "Partners", icon: Mail, perm: "partners" },
    { href: "/admin/agent-integrations", label: "Agent & Integrations", icon: Network, perm: "agent_ops" },
    { href: "/admin/analytics", label: "Analytics", icon: ChartColumn, perm: "analytics" },
    { href: "/admin/settings", label: "Settings", icon: Settings, perm: "settings" },
  ];
  // Every destination stays visible so the console reads the same for everyone; restricted ones show a locked state.
  const nav = all.map(({ perm, ...item }) => ({ ...item, label: item.label, locked: perm ? ![perm].flat().some(p => permissions.includes(p)) : false }));
  const activeHref = [...nav].sort((a, b) => b.href.length - a.href.length).find(i => isActive(pathname, i))?.href;
  const mobileMenu: NavEntry[] = nav.filter(n => !n.locked).map(n => ({ href: n.href, label: n.label, icon: n.icon }));
  return <div className={`ws-app admin ${mobileOpen ? "nav-open" : ""}`}>
    <MobileNav menu={mobileMenu} title="Platform Admin" home="/admin" search={{ seat: null, placeholder: "Search users, events, orders, tickets…" }} />
    <ShellTools />
    <header className="ws-topbar pwa-hide-desktop-nav">
      <div className="ws-top-l"><MobileToggle open={mobileOpen} setOpen={setMobileOpen} />
      <div className="ws-brand"><BrandLogo href="/admin" /></div></div>
      <div className="ws-gs"><GlobalSearch seat={null} placeholder="Search users, events, orders, tickets, venues, services, reports..." /></div>
      <div className="ws-actions">
        <Popover label={`Platform alerts, ${counts.alerts}`} className="ws-icon-pop" trigger={<><Bell aria-hidden="true" />{counts.alerts > 0 && <b className="ws-count">{counts.alerts}</b>}</>}>
          <div className="ws-pop-head"><b>Platform alerts</b></div>
          <NoticeList items={alerts} empty="No open platform alerts." footer={{ href: "/admin/trust", label: "Open Trust & Safety" }} />
        </Popover>
        <Popover label={`Support inbox, ${counts.support} open`} className="ws-icon-pop" trigger={<Mail aria-hidden="true" />}>
          <div className="ws-pop-head"><b>Support inbox</b><small>{counts.support} open</small></div>
          <NoticeList items={support} empty="No open support cases." footer={{ href: "/admin/support", label: "Open Support" }} />
        </Popover>
        <Link href="/admin/events?view=calendar" className="ws-icon-link" aria-label="Platform calendar"><Calendar aria-hidden="true" /></Link>
        <Link href="/admin/agent-integrations?tab=approvals" className="ws-icon-link" aria-label="Approvals and tasks"><SquareCheckBig aria-hidden="true" /></Link>
        <Link href="/help" className="ws-icon-link" aria-label="Help"><CircleHelp aria-hidden="true" /></Link>
        <AccountMenu name="Admin" subtitle={user.title} avatar={user.avatar} showLabel links={[{ href: "/admin/settings", label: "Platform settings" }]} />
      </div>
    </header>
    <nav className="ws-sidebar pwa-hide-desktop-nav" aria-label="Platform Admin">
      <ul className="ws-nav">{nav.map(item => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        return <li key={item.href}><div className={`ws-nav-item ${active ? "active" : ""} ${item.locked ? "locked" : ""}`}>
          <Link href={item.href} aria-current={active ? "page" : undefined} title={item.locked ? "You don’t have access to this area" : undefined}><Icon aria-hidden="true" /><span>{item.label}</span></Link>
        </div></li>;
      })}</ul>
      <PromoCard title="Gala Agent" text="Get AI-powered insights, find risks and take action across users and workspaces." href="/admin/agent-integrations" />
    </nav>
    <div className="ws-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
    <main className="ws-main" id="main">{children}</main>
  </div>;
}
