import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

/** W13 (agency staff): create wizards the member can't save. Same rule as the server refusal (ctx.can.manage = owner/manager). */
export function ManagerOnly({ title, back }: { title: string; back: { href: string; label: string } }) {
  return <div className="wz">
    <Link href={back.href} className="ws-back wz-back"><ArrowLeft aria-hidden="true" />{back.label}</Link>
    <header className="wz-head"><h1>{title}</h1><p>Only workspace owners and managers can create or edit listings, packages and bookings.</p></header>
    <section className="ws-panel" style={{ padding: 20, maxWidth: 640, display: "flex", gap: 12, alignItems: "flex-start" }} role="status">
      <Lock aria-hidden="true" /><p>Ask an owner or manager in this workspace to make this change, or to change your role in Settings › Team.</p>
    </section>
  </div>;
}
