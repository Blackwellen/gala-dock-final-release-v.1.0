"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Menu, Search, X } from "lucide-react";
import { Logo } from "@/components/ui";

type Item = { href: string; label: string; note?: string };
const solutions: Item[] = [
  { href: "#roles", label: "For individuals", note: "Plan a celebration or private event" },
  { href: "#professionals", label: "For event organizers", note: "Portfolios, teams, tickets and finances" },
  { href: "#marketplace", label: "For venues & providers", note: "Profiles, enquiries and availability" },
  { href: "#how-it-works", label: "How it works", note: "From the first idea to the final guest" },
];
const resources: Item[] = [
  { href: "/help", label: "Help Centre", note: "Guides for every part of Gala Dock" },
  { href: "/help/buying-tickets", label: "Buying tickets" },
  { href: "/help/payment-protection", label: "Payment protection" },
  { href: "/help#contact", label: "Contact support" },
  { href: "/terms", label: "Terms & policies" },
];
const START_HREF = "/register?next=/plan";

function Dropdown({ label, items, open, onToggle, onClose }: { label: string; items: Item[]; open: boolean; onToggle: () => void; onClose: () => void }) {
  const id = `lp-menu-${label.toLowerCase()}`;
  return (
    <li className={`lp-dd${open ? " is-open" : ""}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>{label}<ChevronDown size={16} aria-hidden="true" /></button>
      <div className="lp-dd-panel" id={id} hidden={!open}>
        {items.map(i => {
          const body = <><b>{i.label}</b>{i.note && <small>{i.note}</small>}</>;
          return i.href.startsWith("#") ? <a key={i.href} href={i.href} onClick={onClose}>{body}</a> : <Link key={i.href} href={i.href} onClick={onClose}>{body}</Link>;
        })}
      </div>
    </li>
  );
}

/** Sticky marketing header (design: Solutions ▾ · Pricing · Developers · Resources ▾ · search · Log in · Start Planning). */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setMenu(null); } };
    const onClick = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null); };
    const onResize = () => { if (window.innerWidth >= 1024) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); window.removeEventListener("resize", onResize); };
  }, []);

  const close = () => { setOpen(false); setMenu(null); };
  const toggle = (m: string) => setMenu(v => (v === m ? null : m));

  return (
    <header className={`lp-header${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="lp-container lp-header-bar">
        <Logo />
        <nav className="lp-nav" aria-label="Primary" ref={navRef}>
          <ul>
            <Dropdown label="Solutions" items={solutions} open={menu === "solutions"} onToggle={() => toggle("solutions")} onClose={close} />
            <li><a href="#pricing">Pricing</a></li>
            <li><Link href="/help/developers-api">Developers</Link></li>
            <Dropdown label="Resources" items={resources} open={menu === "resources"} onToggle={() => toggle("resources")} onClose={close} />
          </ul>
        </nav>
        <div className="lp-header-actions">
          <Link className="lp-icon-btn lp-hide-sm" href="/discover" aria-label="Search events, venues and services"><Search size={20} aria-hidden="true" /></Link>
          <Link className="lp-btn lp-btn-secondary lp-hide-sm" href="/login">Log in</Link>
          <Link className="lp-btn lp-btn-primary lp-hide-xs" href={START_HREF}>Start Planning<ArrowRight size={16} aria-hidden="true" /></Link>
          <button type="button" className="lp-menu-toggle" aria-expanded={open} aria-controls="lp-mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(v => !v)}>
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div id="lp-mobile-menu" className="lp-mobile-menu" hidden={!open}>
        <nav className="lp-container" aria-label="Mobile">
          <ul>
            {[...solutions, { href: "#pricing", label: "Pricing" }, { href: "/help/developers-api", label: "Developers" }, { href: "/help", label: "Help Centre" }, { href: "/discover", label: "Search" }].map(item => (
              <li key={item.href}>{item.href.startsWith("#") ? <a href={item.href} onClick={close}>{item.label}<ArrowRight size={16} aria-hidden="true" /></a> : <Link href={item.href} onClick={close}>{item.label}<ArrowRight size={16} aria-hidden="true" /></Link>}</li>
            ))}
          </ul>
          <div className="lp-mobile-actions">
            <Link className="lp-btn lp-btn-secondary" href="/login" onClick={close}>Log in</Link>
            <Link className="lp-btn lp-btn-primary" href={START_HREF} onClick={close}>Start Planning</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
