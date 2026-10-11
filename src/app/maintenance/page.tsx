import Link from "next/link";
import { maintenanceState } from "@/lib/maintenance";

export const metadata = { title: "Maintenance · Gala Dock", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Shown (with HTTP 503) by the proxy when a page is unavailable under maintenance (release spec §9 M2/M4/M5). */
export default async function MaintenancePage({ searchParams }: PageProps<"/maintenance">) {
  const sp = await searchParams;
  const ws = await maintenanceState();
  const w = ws.find(x => x.id === sp.w) ?? [...ws].sort((a, b) => b.level - a.level)[0];
  const lockdown = (w?.level ?? 0) >= 5;
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16, background: "#f4f7fd", color: "#090a52", fontFamily: "Inter, system-ui, sans-serif" }}>
    <section style={{ maxWidth: 520, width: "100%", background: "#fff", borderRadius: 16, padding: "32px 24px", boxShadow: "0 18px 40px -18px rgba(20,30,90,.25)", display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: lockdown ? "#c4142b" : "#0038fd" }}>{lockdown ? "Temporarily unavailable" : "Scheduled maintenance"}</p>
      <h1 style={{ margin: 0, fontSize: 24 }}>{w?.title ?? "We’ll be right back"}</h1>
      <p style={{ margin: 0, lineHeight: 1.6, color: "#4a50a6" }}>{w?.message || "This part of Gala Dock is briefly unavailable while we carry out maintenance. Your data is safe."}</p>
      {w?.expected_restore && <p style={{ margin: 0, color: "#4a50a6" }}>Expected back: <b>{new Date(w.expected_restore).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</b> (UK time)</p>}
      <p style={{ margin: 0, color: "#4a50a6", fontSize: 13 }}>Tickets already in your wallet still work, and event check-in remains available.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {w?.status_url && <a href={w.status_url} style={{ color: "#0038fd", fontWeight: 700 }}>Status updates</a>}
        <Link href="/account/tickets" style={{ color: "#0038fd", fontWeight: 700 }}>My tickets</Link>
      </div>
      {w?.reference && <p style={{ margin: 0, fontSize: 12, color: "#8a90c0" }}>Reference {w.reference}</p>}
    </section>
  </main>;
}
