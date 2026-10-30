import Link from "next/link";
import { GalaLogo } from "@/components/brand/gala-logo";
import type { ReactNode } from "react";
import { ChevronDown, MessageSquareText, Bell, CircleHelp, LogOut, Plus, type LucideIcon } from "lucide-react";
import "@/styles/portal-shell.css";
import { PortalSearch, NavToggle } from "./client";

/* Shared shell for the external portals (client share link, promoter, partner). Deliberately separate from the
   provider/admin workspace shells: no workspace switcher, no create menu, only what an outside party may see. */

export type PortalNavItem = { href: string; label: string; icon: LucideIcon; active?: boolean; badge?: number };

export function PortalAvatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="pt-avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="pt-avatar initials" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{letters}</span>;
}

export function PortalShell({ portal, context, nav, user, links, searchPlaceholder, sideFooter, create, children }: {
  portal: { title: string; subtitle: string; thumb: string };
  context: { label: string; thumb: string; menu?: { href: string; label: string; active?: boolean }[] };
  nav: PortalNavItem[];
  user: { name: string; detail: string; avatar?: string | null; signOut: boolean };
  links: { messages: string; messagesUnread?: number; notifications: string; notificationsUnread?: number; help: string };
  searchPlaceholder: string;
  sideFooter?: ReactNode;
  /** Quick actions under the topbar "Create" menu (portal-specific, e.g. message the organiser). */
  create?: { href: string; label: string; external?: boolean }[];
  children: ReactNode;
}) {
  return <div className="pt-app">
    <header className="pt-top">
      <NavToggle />
      <div className="pt-brand">
        <Link href="/" className="pt-logo" aria-label="Gala Dock home">
          <GalaLogo />
        </Link>
      </div>
      {context.menu && context.menu.length > 1
        ? <details className="pt-context pt-pop"><summary aria-label="Switch campaign">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={context.thumb} alt="" width={28} height={28} /><span>{context.label}</span><ChevronDown aria-hidden="true" /></summary>
            <div className="pt-pop-panel left" role="menu">{context.menu.map(m => <Link key={m.href} href={m.href} role="menuitemradio" aria-checked={!!m.active}>{m.label}</Link>)}</div></details>
        : <div className="pt-context">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={context.thumb} alt="" width={28} height={28} /><span>{context.label}</span><ChevronDown aria-hidden="true" /></div>}
      <PortalSearch placeholder={searchPlaceholder} />
      {!!create?.length && <details className="pt-create pt-pop"><summary className="pt-btn primary"><Plus aria-hidden="true" />Create<ChevronDown aria-hidden="true" /></summary>
        <div className="pt-pop-panel left" role="menu">{create.map(c => c.external ? <a key={c.label} href={c.href} role="menuitem" download>{c.label}</a> : <Link key={c.label} href={c.href} role="menuitem">{c.label}</Link>)}</div></details>}
      <nav className="pt-actions" aria-label="Portal shortcuts">
        <Link href={links.messages} className="pt-act" aria-label="Messages"><span className="pt-act-ic"><MessageSquareText aria-hidden="true" />{!!links.messagesUnread && <i className="pt-dot num">{links.messagesUnread}</i>}</span><span className="pt-act-l">Messages</span></Link>
        <Link href={links.notifications} className="pt-act" aria-label="Notifications"><span className="pt-act-ic"><Bell aria-hidden="true" />{!!links.notificationsUnread && <i className="pt-dot" />}</span><span className="pt-act-l">Notifications</span></Link>
        <Link href={links.help} className="pt-act" aria-label="Help"><span className="pt-act-ic"><CircleHelp aria-hidden="true" /></span><span className="pt-act-l">Help</span></Link>
        <details className="pt-account pt-pop">
          <summary aria-label="Account"><PortalAvatar src={user.avatar} name={user.name} /><ChevronDown className="chev" aria-hidden="true" /></summary>
          <div className="pt-pop-panel right" role="menu">
            <div className="pt-pop-head"><b>{user.name}</b><small>{user.detail}</small></div>
            {user.signOut && <form action="/auth/signout" method="post"><button type="submit" role="menuitem"><LogOut aria-hidden="true" />Sign out</button></form>}
          </div>
        </details>
      </nav>
    </header>
    <aside className="pt-side" aria-label={`${portal.title} navigation`}>
      <div className="pt-side-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portal.thumb} alt="" width={36} height={36} />
        <div><b>{portal.title}</b><small>{portal.subtitle}</small></div>
      </div>
      <ul className="pt-nav">{nav.map(n => {
        const Icon = n.icon;
        return <li key={n.label}><Link href={n.href} className={n.active ? "active" : ""} aria-current={n.active ? "page" : undefined} scroll={false}>
          <Icon aria-hidden="true" /><span>{n.label}</span>{!!n.badge && <b className="pt-badge">{n.badge}</b>}</Link></li>;
      })}</ul>
      {sideFooter}
    </aside>
    <main className="pt-main" id="main">{children}</main>
  </div>;
}

/* ── Small shared presentational pieces ── */
export function PortalPanel({ title, action, className = "", id, children, extra }: { title?: ReactNode; action?: { href: string; label: string }; className?: string; id?: string; children: ReactNode; extra?: ReactNode }) {
  return <section className={`pt-panel ${className}`} id={id} data-q-group="">
    {(title || action) && <div className="pt-panel-head"><h2>{title}</h2>{extra}{action && <Link className="pt-link" href={action.href} scroll={false}>{action.label} <ArrowGlyph /></Link>}</div>}
    {children}
  </section>;
}
export function ArrowGlyph() {
  return <svg className="pt-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export type ChipTone = "green" | "blue" | "amber" | "red" | "grey" | "purple";
export function PortalChip({ tone, children, dot }: { tone: ChipTone; children: ReactNode; dot?: boolean }) {
  return <span className={`pt-chip ${tone} ${dot ? "pt-chip-dot" : ""}`}>{children}</span>;
}
export function DeltaLine({ value, suffix = "vs last 30 days" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="pt-delta flat"><small>No prior period</small></span>;
  return <span className="pt-delta"><b className={value >= 0 ? "up" : "down"}>{value >= 0 ? "↑" : "↓"} {Math.abs(value)}%</b><small>{suffix}</small></span>;
}
