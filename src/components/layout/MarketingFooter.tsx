import Image from "next/image";
import Link from "next/link";

const FOOTER_LINKS = {
  Product: [
    { label: "Features",  href: "/features" },
    { label: "Product",   href: "/product" },
    { label: "Pricing",   href: "/pricing" },
    { label: "Demo",      href: "/demo" },
    { label: "Changelog", href: "/help" },
  ],
  "Use Cases": [
    { label: "Event Planners",  href: "/use-cases/event-planners" },
    { label: "Venues",          href: "/use-cases/venues" },
    { label: "Agencies",        href: "/use-cases/agencies" },
    { label: "Corporate Events",href: "/use-cases/corporate-events" },
    { label: "Weddings",        href: "/use-cases/weddings" },
    { label: "Suppliers",       href: "/use-cases/suppliers" },
  ],
  Company: [
    { label: "Security",  href: "/security" },
    { label: "Affiliate", href: "/affiliate" },
    { label: "Contact",   href: "/contact" },
    { label: "Book Demo", href: "/book-demo" },
    { label: "Status",    href: "/status" },
  ],
  Legal: [
    { label: "Privacy Policy",     href: "/legal/privacy" },
    { label: "Terms of Service",   href: "/legal/terms" },
    { label: "Cookie Policy",      href: "/legal/cookies" },
    { label: "Acceptable Use",     href: "/legal/acceptable-use" },
    { label: "Refund Policy",      href: "/legal/refund-policy" },
    { label: "Data Processing",    href: "/legal/data-processing" },
    { label: "Subprocessors",      href: "/legal/subprocessors" },
    { label: "Affiliate Terms",    href: "/legal/affiliate-terms" },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="bg-surface-900 text-surface-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {/* Top: logo + links */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Image src="/gala-dock-logo.png" alt="Gala Dock" width={120} height={30} className="brightness-0 invert" />
            <p className="mt-3 text-sm text-surface-400 leading-relaxed">
              The Event Delivery OS for planners, agencies, venues and event teams.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">
                {section}
              </h4>
              <ul className="space-y-2">
                {links.map(({ label, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-surface-400 hover:text-white transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="border-t border-surface-700 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-surface-500">
          <p>© {new Date().getFullYear()} Gala Dock. All rights reserved.</p>
          <p>Built for event professionals. 🇬🇧</p>
        </div>
      </div>
    </footer>
  );
}
