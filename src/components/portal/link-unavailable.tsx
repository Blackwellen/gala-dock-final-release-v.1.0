import Link from "next/link";
import "@/styles/kit.css";

/** W09: one uniform screen for every bad, unknown, expired or revoked token link (no hint which case applies). */
export function LinkUnavailable({ what }: { what: string }) {
  return <div className="k-root" style={{ padding: "64px 16px", minHeight: "100dvh" }}>
    <main className="k-card" style={{ maxWidth: 520, margin: "0 auto", padding: 28, textAlign: "center" }}>
      <p className="k-small k-muted" style={{ margin: 0 }}>Gala Dock</p>
      <h1 style={{ fontSize: 22, margin: "8px 0" }}>This {what} link isn’t available</h1>
      <p className="k-small" style={{ margin: "0 0 18px" }}>It may have expired, been replaced or been switched off. Ask the person who shared it with you for a new link.</p>
      <Link className="k-btn ghost" href="/">Go to Gala Dock</Link>
    </main>
  </div>;
}
