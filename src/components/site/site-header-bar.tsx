"use client";
/* eslint-disable @next/next/no-img-element -- the visitor's own avatar URL (any host) */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Menu } from "lucide-react";
import { GalaLogo } from "@/components/brand/gala-logo";
import { HREF, SITE_PAGES } from "@/lib/public/site";
import { Sheet } from "./controls";
import { trackPublic } from "./track";

type Account = { initial: string; avatar: string | null } | null;

export function SiteHeaderBar({ account }: { account: Account }) {
  const path = usePathname() ?? "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Leaving the phone/tablet layout closes the menu.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const on = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const nav = (where: string) => (href: string, label: string) => () => trackPublic("public_nav_click", where, label || href);

  const accountLink = account && <Link href="/home" className="c-avatar gp-avatar" aria-label="Your account" onClick={nav("header")("/home", "account")}>
    {account.avatar ? <img src={account.avatar} alt="" width={36} height={36} /> : <span aria-hidden="true">{account.initial}</span>}
  </Link>;

  return <header className={`pub-top gp-header${scrolled ? " is-scrolled" : ""}`}>
    <div className="gp-wrap gp-header-bar">
      <Link href="/" className="c-logo gp-logo" aria-label="Gala Dock home" onClick={nav("header")("/", "logo")}><GalaLogo /></Link>
      <nav className="gp-nav" aria-label="Main">
        <ul>
          {SITE_PAGES.map(p => <li key={p.href}>
            <Link href={p.href} aria-current={active(p.href) ? "page" : undefined} onClick={nav("header")(p.href, p.key)}>
              {p.label}
              {active(p.href) && <motion.span layoutId="gp-nav-current" className="gp-nav-line" aria-hidden="true" transition={{ type: "spring", stiffness: 420, damping: 40 }} />}
            </Link>
          </li>)}
        </ul>
      </nav>
      <div className="gp-header-actions">
        {account ? <>{accountLink}</> : <>
          <Link className="gp-btn gp-btn--ghost gp-btn--sm gp-hide-sm" href={HREF.signIn} onClick={nav("header")(HREF.signIn, "sign_in")}>Sign in</Link>
          <Link className="gp-btn gp-btn--primary gp-btn--sm gp-hide-xs" href={HREF.getStarted} onClick={nav("header")(HREF.getStarted, "get_started")}>Get Started<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></Link>
        </>}
        <button type="button" className="gp-menu-btn" aria-expanded={open} aria-haspopup="dialog" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} aria-hidden="true" /></button>
      </div>
    </div>
    <Sheet open={open} onClose={close} label="Menu" side="right" className="gp-menu-sheet">
      <div className="gp-menu-logo"><GalaLogo className="gd-keep-word" /></div>
      <nav aria-label="Menu">
        <ul className="gp-menu-list">
          {SITE_PAGES.map(p => <li key={p.href}><Link href={p.href} aria-current={active(p.href) ? "page" : undefined} onClick={() => { nav("menu")(p.href, p.key)(); close(); }}>{p.label}<ArrowRight size={18} aria-hidden="true" /></Link></li>)}
          <li><Link href={HREF.events} onClick={() => { nav("menu")(HREF.events, "events")(); close(); }}>Discover events<ArrowRight size={18} aria-hidden="true" /></Link></li>
          <li><Link href={HREF.help} onClick={() => { nav("menu")(HREF.help, "help")(); close(); }}>Help Centre<ArrowRight size={18} aria-hidden="true" /></Link></li>
        </ul>
      </nav>
      <div className="gp-menu-actions">
        {account ? <Link className="gp-btn gp-btn--primary" href="/home" onClick={close}>Open your account</Link> : <>
          <Link className="gp-btn gp-btn--ghost" href={HREF.signIn} onClick={() => { nav("menu")(HREF.signIn, "sign_in")(); close(); }}>Sign in</Link>
          <Link className="gp-btn gp-btn--primary" href={HREF.getStarted} onClick={() => { nav("menu")(HREF.getStarted, "get_started")(); close(); }}>Get Started<ArrowRight size={17} aria-hidden="true" /></Link>
        </>}
      </div>
    </Sheet>
  </header>;
}
