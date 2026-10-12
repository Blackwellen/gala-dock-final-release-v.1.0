"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, LayoutGrid, Search, X, type LucideIcon } from "lucide-react";
import { GlobalSearch } from "@/components/search/global-search";
import "@/styles/pwa-nav.css";

export type NavEntry = { href: string; label: string; icon: LucideIcon; badge?: string | number | null; match?: string };

/**
 * Mobile / installed-PWA app shell (media spec §60–67). Replaces the desktop sidebar below 900px:
 *  - compact top bar with the canonical Gala Dock mark (not the wordmark), contextual back, title and a right-side slot;
 *  - primary navigation in a bottom sheet (drag handle, backdrop, Esc, swipe-down, focus trap, safe areas);
 *  - optional bottom tab bar for the most-used destinations (Customer);
 *  - optional search button that opens the same global search as the desktop top bar, full width under the header.
 * Shells render this alongside their desktop sidebar; CSS shows exactly one of them per breakpoint.
 */
export function MobileNav({ menu, tabs, title, right, home = "/", search }: { menu: NavEntry[]; tabs?: NavEntry[]; title?: string; right?: ReactNode; home?: string; search?: { seat?: string | null; placeholder?: string } }) {
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false), [finding, setFinding] = useState(false);
  const searchRow = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement>(null), drag = useRef<{ y: number; dy: number } | null>(null);
  const active = (e: NavEntry) => e.match ? new RegExp(e.match).test(pathname) : pathname === e.href || pathname.startsWith(`${e.href}/`);
  const depth = pathname.split("/").filter(Boolean).length;
  const current = [...menu, ...(tabs ?? [])].filter(active).sort((a, b) => b.href.length - a.href.length)[0];

  useEffect(() => { queueMicrotask(() => { setOpen(false); setFinding(false); }); }, [pathname]);
  useEffect(() => {
    if (!finding) return;
    searchRow.current?.querySelector("input")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFinding(false); };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, [finding]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => sheet.current?.querySelector<HTMLElement>("a,button")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && sheet.current) {
        const f = [...sheet.current.querySelectorAll<HTMLElement>("a,button")]; if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1)!.focus(); } else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0]!.focus(); }
      }
    };
    addEventListener("keydown", onKey);
    return () => { removeEventListener("keydown", onKey); document.body.style.overflow = ""; (prev ?? opener.current)?.focus?.(); };
  }, [open]);

  return <>
    <header className="pwa-top" role="banner">
      <div className="pwa-top-l">{depth > 1
        ? <button type="button" className="pwa-icon" aria-label="Back" onClick={() => (history.length > 1 ? router.back() : router.push(home))}><ChevronLeft size={22} /></button>
        : <Link href={home} className="pwa-mark" aria-label="Gala Dock home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/favicon-48.png" alt="" width={28} height={28} /></Link>}</div>
      <div className="pwa-top-c">{depth > 1 ? <span className="pwa-title">{title ?? current?.label ?? ""}</span>
        : <span className="pwa-title">{title ?? "Gala Dock"}</span>}</div>
      <div className="pwa-top-r">{search && <button type="button" className="pwa-icon" aria-label={finding ? "Close search" : "Search"} aria-expanded={finding} aria-controls="pwa-search" onClick={() => setFinding(f => !f)}>{finding ? <X size={21} /> : <Search size={21} />}</button>}{right}<button ref={opener} type="button" className="pwa-icon" aria-label="Open menu" aria-expanded={open} aria-controls="pwa-sheet" onClick={() => setOpen(true)}><LayoutGrid size={21} /></button></div>
    </header>
    {search && finding && <div className="pwa-search" id="pwa-search" ref={searchRow}><GlobalSearch seat={search.seat ?? null} placeholder={search.placeholder} /></div>}

    {tabs?.length ? <nav className="pwa-tabs" aria-label="Primary">{tabs.map(t => <Link key={t.href} href={t.href} className={active(t) ? "on" : ""} aria-current={active(t) ? "page" : undefined}>
      <t.icon size={21} aria-hidden="true" /><span>{t.label}</span>{t.badge ? <i>{t.badge}</i> : null}</Link>)}</nav> : null}

    <div className={`pwa-backdrop${open ? " on" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
    <div id="pwa-sheet" ref={sheet} className={`pwa-sheet${open ? " on" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" hidden={!open}
      onTouchStart={e => { drag.current = { y: e.touches[0]!.clientY, dy: 0 }; }}
      onTouchMove={e => { if (!drag.current || !sheet.current) return; drag.current.dy = Math.max(0, e.touches[0]!.clientY - drag.current.y); sheet.current.style.transform = `translateY(${drag.current.dy}px)`; }}
      onTouchEnd={() => { if (sheet.current) sheet.current.style.transform = ""; if ((drag.current?.dy ?? 0) > 90) setOpen(false); drag.current = null; }}>
      <div className="pwa-handle" aria-hidden="true" />
      <div className="pwa-sheet-head"><b>Menu</b><button type="button" className="pwa-icon" aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <nav aria-label="App menu"><ul className="pwa-grid">{menu.map(m => <li key={m.href}><Link href={m.href} className={active(m) ? "on" : ""} aria-current={active(m) ? "page" : undefined}>
        <span className="pwa-ico"><m.icon size={22} aria-hidden="true" /></span><span className="pwa-lbl">{m.label}</span>{m.badge ? <i className="pwa-badge">{m.badge}</i> : null}</Link></li>)}</ul></nav>
    </div>
  </>;
}
