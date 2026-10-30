import Link from "next/link";

/** Unknown or expired payment reference: stays inside the token chrome (logo-only bar + legal footer), no site navigation. */
export default function PaymentNotFound() {
  return <main className="k-root" style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px", textAlign: "center" }}>
    <h1 style={{ fontSize: 24, margin: 0 }}>Payment not found</h1>
    <p className="k-muted" style={{ margin: "10px 0 18px" }}>This payment link is invalid or has expired. Ask the sender for a new link, or contact support.</p>
    <Link className="k-btn outline" href="/help#contact">Contact support</Link>
  </main>;
}
