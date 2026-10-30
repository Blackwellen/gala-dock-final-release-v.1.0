import Link from "next/link";

/** Same answer for a wrong, expired or revoked link — never says which. */
export default function RsvpNotFound() {
  return <section className="gf-card gf-narrow" role="status"><h1 className="gf-h1">This RSVP link isn&apos;t valid</h1>
    <p className="gf-sub">It may have been replaced or mistyped. Ask the host to send your invitation link again.</p>
    <Link className="k-btn outline" href="/discover">Discover events</Link></section>;
}
