import "@/styles/token-chrome.css";
import Link from "next/link";
import { GalaLogo } from "@/components/brand/gala-logo";
import { LEGAL } from "@/lib/legal";

/**
 * Minimal chrome for token portals (guest, proposal, contract) and checkout: the logo only (no navigation, no account context, so
 * nothing about the visitor or the token leaks), and a slim legal footer. Public pages use PublicHeader + SiteFooter instead.
 */
export function BrandBar() {
  return <header className="gd-brandbar"><Link href="/" aria-label="Gala Dock home" className="gd-brandbar-logo"><GalaLogo /></Link></header>;
}
export function LegalFooter() {
  return <footer className="gd-legal-footer" aria-label="Legal">
    <span>© {new Date().getFullYear()} Gala Dock · a trading name of {LEGAL.entity.name}</span>
    <nav aria-label="Legal links"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><Link href="/help">Help</Link></nav>
  </footer>;
}
