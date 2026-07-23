import Link from "next/link";
import Image from "next/image";
import { requireCustomer } from "@/lib/customer";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { customer } = await requireCustomer();

  const links = [
    { href: "/discover", label: "Discover" },
    { href: "/account/tickets", label: "My Tickets" },
    { href: "/account/events", label: "Orders" },
    { href: "/account/saved", label: "Saved" },
    { href: "/account/settings", label: "Account" },
  ];

  return (
    <div className="min-h-screen bg-surface-50">
      <header className="bg-white border-b border-surface-200">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <Image src="/gala-dock-logo.png" alt="Gala Dock" width={120} height={30} />
          </Link>
          <p className="text-sm text-surface-500">{customer.email}</p>
        </div>
        <nav className="mx-auto max-w-4xl px-6 flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2.5 text-sm font-medium text-surface-600 hover:text-surface-900 border-b-2 border-transparent hover:border-surface-300 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
