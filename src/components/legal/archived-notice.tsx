import Link from "next/link";

/** Header for a previous version kept for reference (published 12 October 2026). Business users who haven't yet moved to the new
 *  version stay on the previous Terms of Service until the new version applies to them (15 days' notice). */
export function ArchivedNotice({ current }: { current: string }) {
  return <>
    <p className="lg-meta"><span className="lg-ver">Version 2026-10</span> Previous version · published 12 October 2026 · replaced by version 3.0</p>
    <p className="lg-note" role="note">You&apos;re reading a previous version, kept for reference. It still applies to bookings, tickets and payments made while it was in force, and to existing business users until the new version applies to them. <Link href={current}>Read the current version</Link>.</p>
  </>;
}
