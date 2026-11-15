import Link from "next/link";
import type { PendingDoc } from "@/lib/legal/published";
import "@/styles/legal.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** In-app notice of changed legal documents (R3) for the workspace and customer shells. Renders nothing when nothing is pending. */
export function LegalUpdateBanner({ pending, next }: { pending: PendingDoc[]; next: string }) {
  if (!pending.length) return null;
  const later = pending.filter(p => !p.required).map(p => p.effective_at).sort()[0];
  const when = pending.some(p => p.required) ? "They apply now." : later ? `They take effect for your business on ${day(later)}.` : "";
  return <div className="lg-banner" role="status" data-legal-banner>
    <span><b>We&apos;ve updated our terms.</b> {pending.length === 1 ? pending[0]!.title : `${pending.length} documents`} changed. {when}</span>
    <Link href={`/legal/updates?next=${encodeURIComponent(next)}`}>Review and accept</Link>
  </div>;
}
