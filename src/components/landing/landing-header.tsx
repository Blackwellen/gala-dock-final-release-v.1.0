"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui";

const landingNav = [
  { href: "#platform", label: "Platform" },
  { href: "#organizers", label: "Organizers" },
  { href: "#providers", label: "Providers" },
  { href: "#agent", label: "Gala Agent" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
];

/** Sticky marketing header with a collapsible menu below 1024px. */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onResize = () => { if (window.innerWidth >= 1024) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={`lp-header${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="lp-container lp-header-bar">
        <Logo />
        <nav className="lp-nav" aria-label="Primary">
          <ul>{landingNav.map(item => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ul>
        </nav>
        <div className="lp-header-actions">
          <Link className="lp-btn lp-btn-ghost lp-hide-sm" href="/login">Log in</Link>
          <Link className="lp-btn lp-btn-primary lp-hide-xs" href="/register">Get started</Link>
          <button
            type="button"
            className="lp-menu-toggle"
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(v => !v)}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div id="lp-mobile-menu" className="lp-mobile-menu" hidden={!open}>
        <nav className="lp-container" aria-label="Mobile">
          <ul>
            {landingNav.map(item => (
              <li key={item.href}><a href={item.href} onClick={close}>{item.label}<ArrowRight size={16} aria-hidden="true" /></a></li>
            ))}
          </ul>
          <div className="lp-mobile-actions">
            <Link className="lp-btn lp-btn-secondary" href="/login" onClick={close}>Log in</Link>
            <Link className="lp-btn lp-btn-primary" href="/register" onClick={close}>Get started</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
