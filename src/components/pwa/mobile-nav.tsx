"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronLeft, ChevronDown, Menu, Search, X, Plus, MessageSquare, User, LogOut, type LucideIcon } from "lucide-react";
import { GlobalSearch } from "@/components/search/global-search";
import "@/styles/pwa-nav.css";

/** `titleOnly` (optional): names the page in the top bar when active but is not repeated in the menu grid (e.g. an entry the shared account section already links). */
export type NavEntry = { href: string; label: string; icon: LucideIcon; badge?: string | number | null; match?: string | RegExp; exact?: boolean; titleOnly?: boolean };
export type MobileNotice = { id: string; title: string; body?: string; link?: string; read_at?: string | null };
type Props = {
  menu: NavEntry[]; tabs: NavEntry[]; title?: string; right?: ReactNode; home?: string;
  search?: { seat?: string | null; placeholder?: string };
  create?: { href: string; label: string; icon?: LucideIcon }[];
  workspaceSwitcher?: ReactNode; messagesHref?: string; unreadMessages?: boolean;
  notifications?: MobileNotice[]; unread?: number; onReadNotifications?: () => void;
};

const BACK_ICON = "a:has(> svg.lucide-arrow-left), a:has(> svg.lucide-chevron-left), button:has(> svg.lucide-arrow-left)";
/** True when the page renders its own visible back control (a `*-back` / `back-link` class or an arrow-left link) outside the PWA chrome and footers. */
function hasPageBack() {
  const els = document.querySelectorAll<HTMLElement>(`[class*="back"], ${BACK_ICON}`);
  for (const el of els) {
    if (el.closest(".pwa-top, .pwa-back, .pwa-tabs, .pwa-sheet, footer, [class*='foot'], dialog, [role=dialog], [role=menu]")) continue;
    const named = [...el.classList].some(c => c === "back-link" || c.endsWith("-back"));
    if (!named && !el.matches(BACK_ICON)) continue;
    if (!/back/i.test(el.textContent ?? "") && !el.getAttribute("aria-label")?.match(/back/i)) continue;
    if (el.getClientRects().length && getComputedStyle(el).visibility !== "hidden") return true;
  }
  return false;
}

/** Four role-specific primary links and one Menu. Native dialogs supply modal inertness and focus containment. */
export function MobileNav({ menu, tabs, title, right, home = "/", search, create = [], workspaceSwitcher, messagesHref, unreadMessages, notifications = [], unread = 0, onReadNotifications, topLevel }: Props & { /** Paths (exact) that are top-level destinations: no Back link, as in the PWA mocks. */ topLevel?: readonly string[] }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  const [panel, setPanel] = useState<"menu" | "notifications" | null>(null), [finding, setFinding] = useState(false);
  const searchRow = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null), drag = useRef<number | null>(null);
  const active = (e: NavEntry) => e.match ? new RegExp(e.match).test(pathname) : e.exact ? pathname === e.href : pathname === e.href.split("?")[0] || pathname.startsWith(`${e.href.split("?")[0]}/`);
  const current = [...menu, ...tabs].filter(active).sort((a, b) => b.href.length - a.href.length)[0];
  const primary = tabs.slice(0, 4);
  const remaining = menu.filter(m => !m.titleOnly && !primary.some(p => p.href === m.href));
  const routeKey = pathname + "?" + params.toString();
  useEffect(() => { queueMicrotask(() => { setPanel(null); setFinding(false); }); }, [routeKey]);
  // Pages with their own visible back link ("← Back to events") keep it and the bar's Back hides, so a phone never shows two.
  // Wizard footers' previous-step buttons are a different action and don't count.
  const [pageBack, setPageBack] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => { frame = 0; setPageBack(hasPageBack()); };
    const queue = () => { if (!frame) frame = requestAnimationFrame(check); };
    queue();
    const watch = new MutationObserver(queue);
    watch.observe(document.body, { childList: true, subtree: true });
    addEventListener("resize", queue);
    return () => { watch.disconnect(); removeEventListener("resize", queue); cancelAnimationFrame(frame); };
  }, [routeKey]);
  useEffect(() => {
    if (!finding) return;
    searchRow.current?.querySelector("input")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setFinding(false); };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, [finding]);
  useEffect(() => {
    const el = sheet.current;
    if (!panel || !el) return;
    const previousOverflow = document.body.style.overflow;
    el.showModal(); document.body.style.overflow = "hidden";
    const breakpoint = matchMedia("(min-width:1280px)");
    const resized = () => { if (breakpoint.matches) setPanel(null); };
    breakpoint.addEventListener("change", resized);
    return () => { el.close(); document.body.style.overflow = previousOverflow; breakpoint.removeEventListener("change", resized); opener.current?.focus(); };
  }, [panel]);
  const openPanel = (next: "menu" | "notifications", trigger: HTMLElement) => {
    opener.current = trigger; setPanel(next); setFinding(false);
    if (next === "notifications") onReadNotifications?.();
  };

  return <>
    <header className="pwa-top">
      <Link href={home} className="pwa-mark" aria-label="Gala Dock home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/favicon-48.png" alt="" width={32} height={32} /></Link>
      <div className="pwa-top-c">{workspaceSwitcher ? <button type="button" className="pwa-title-button" aria-label="Switch workspace" aria-haspopup="dialog" onClick={e=>openPanel("menu",e.currentTarget)}><span className="pwa-title">{title}<small>{home==='/provider'?'Provider':'Organizer'}</small></span><ChevronDown size={15} aria-hidden="true" /></button> : <span className="pwa-title">{title ?? current?.label ?? "Gala Dock"}</span>}</div>
      <div className="pwa-top-r">
        {search && <button type="button" className="pwa-icon" aria-label={finding ? "Close search" : "Search"} aria-expanded={finding} aria-controls="pwa-search" onClick={() => setFinding(f => !f)}>{finding ? <X size={21} /> : <Search size={21} />}</button>}
        {messagesHref && <Link href={messagesHref} className="pwa-icon" aria-label={unreadMessages ? "Messages, unread" : "Messages"}><MessageSquare size={21} aria-hidden="true" />{unreadMessages && <i className="pwa-dot" />}</Link>}
        <button type="button" className="pwa-icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={e => openPanel("notifications", e.currentTarget)}><Bell size={21} aria-hidden="true" />{unread > 0 && <i className="pwa-dot" />}</button>
        {right}
      </div>
    </header>
    {pathname !== home && !topLevel?.includes(pathname) && !pageBack && <button type="button" className="pwa-back" onClick={() => history.length > 1 ? router.back() : router.push(home)}><ChevronLeft size={17} aria-hidden="true" />Back</button>}
    {search && finding && <div className="pwa-search" id="pwa-search" ref={searchRow}><GlobalSearch seat={search.seat ?? null} placeholder={search.placeholder} /></div>}
    <nav className="pwa-tabs" aria-label="Primary">{primary.map(t => <Link key={t.href} href={t.href} className={active(t) ? "on" : ""} aria-current={active(t) ? "page" : undefined}>
      <t.icon size={21} aria-hidden="true" /><span>{t.label}</span>{t.badge ? <i>{t.badge}</i> : null}</Link>)}
      <button type="button" aria-label="Menu" aria-haspopup="dialog" aria-expanded={panel === "menu"} aria-controls="pwa-sheet" onClick={e => openPanel("menu", e.currentTarget)} className={!primary.some(active) && remaining.some(active) ? "on" : ""}><Menu size={21} aria-hidden="true" /><span>Menu</span></button>
    </nav>
    <dialog id="pwa-sheet" ref={sheet} className="pwa-sheet" aria-labelledby="pwa-sheet-title" onCancel={() => setPanel(null)} onClick={e => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setPanel(null);
    }}>
      <div className="pwa-grip" onTouchStart={e => { drag.current = e.touches[0]?.clientY ?? null; }} onTouchEnd={e => { if (drag.current !== null && (e.changedTouches[0]?.clientY ?? 0) - drag.current > 80) setPanel(null); drag.current = null; }}><div className="pwa-handle" aria-hidden="true" /></div>
      <div className="pwa-sheet-head"><h2 id="pwa-sheet-title">{panel === "notifications" ? "Notifications" : "Menu"}</h2><button type="button" autoFocus className="pwa-icon" aria-label={`Close ${panel ?? "menu"}`} onClick={() => setPanel(null)}><X size={20} /></button></div>
      {panel === "menu" ? <>
        <nav aria-label="App menu"><ul className="pwa-grid"><li><button type="button" onClick={() => { setPanel("notifications"); onReadNotifications?.(); }}><span className="pwa-ico"><Bell size={22} aria-hidden="true" /></span><span className="pwa-lbl">Notifications</span></button></li>{remaining.map(m => <li key={m.href}><Link href={m.href} onClick={() => setPanel(null)} className={active(m) ? "on" : ""} aria-current={active(m) ? "page" : undefined}>
          <span className="pwa-ico"><m.icon size={22} aria-hidden="true" /></span><span className="pwa-lbl">{m.label}</span>{m.badge ? <i className="pwa-badge">{m.badge}</i> : null}</Link></li>)}</ul></nav>
        {create.length > 0 && <section className="pwa-section" aria-label="Create"><h3>Create</h3><div className="pwa-create">{create.map(c => { const Icon = c.icon ?? Plus; return <Link key={c.href} href={c.href} onClick={() => setPanel(null)}><Icon size={20} aria-hidden="true" /><span>{c.label}</span></Link>; })}</div></section>}
        {workspaceSwitcher && <section className="pwa-section"><h3>Switch workspace</h3>{workspaceSwitcher}</section>}
        <section className="pwa-section pwa-account">{/* W12/W13: skip when the role menu already lists them (Help appeared twice; Account and My account both) */}
          {!menu.some(m => m.href === "/account" || /^(my )?account$/i.test(m.label)) && <Link href="/account" onClick={() => setPanel(null)}><User size={19} aria-hidden="true" />My account</Link>}
          {!menu.some(m => /^help$/i.test(m.label)) && <Link href="/help" onClick={() => setPanel(null)}>Help</Link>}<form action="/auth/signout" method="post"><button type="submit"><LogOut size={19} aria-hidden="true" />Sign out</button></form></section>
      </> : <div className="pwa-notices">{notifications.length ? notifications.map(n => <Link key={n.id} href={n.link || home} onClick={() => setPanel(null)}><b>{n.title}</b>{n.body && <span>{n.body}</span>}</Link>) : <p>You’re all caught up.</p>}</div>}
    </dialog>
  </>;
}
