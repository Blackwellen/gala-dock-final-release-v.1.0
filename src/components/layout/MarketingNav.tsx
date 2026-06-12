"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Product",  href: "/product" },
  { label: "Features", href: "/features" },
  { label: "Pricing",  href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "Affiliate",href: "/affiliate" },
];

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-surface-200">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <Image src="/gala-dock-logo.png" alt="Gala Dock" width={130} height={34} priority />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-2 text-sm text-surface-600 hover:text-surface-900 hover:bg-surface-50 rounded-lg transition-colors font-medium"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-surface-700 hover:text-surface-900 hover:bg-surface-50 rounded-lg transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden ml-auto p-2 rounded-lg text-surface-600 hover:bg-surface-100 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-surface-200 bg-white px-4 py-4 space-y-1">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 rounded-lg transition-colors"
            >
              {label}
            </Link>
          ))}
          <div className="pt-3 mt-3 border-t border-surface-200 flex flex-col gap-2">
            <Link href="/login" className="block w-full text-center px-4 py-2.5 text-sm font-medium border border-surface-200 rounded-lg text-surface-700 hover:bg-surface-50 transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="block w-full text-center px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
