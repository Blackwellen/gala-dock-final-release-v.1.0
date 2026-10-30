import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, hashToken, isTokenFormat, rateLimit } from "@/lib/security";

// Private event guest page (Q14 / W02 finding): a revocable, expiring link the host shares instead of the owner-only event URL.
// The token is hashed here and resolved by the service-only `event_guest_view`, which returns one event's guest-safe fields only.
export const metadata: Metadata = { title: "You're invited · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type View = {
  link: { label: string; expires_at: string }; host: string;
  event: { id: string; name: string; event_type: string; status: string; starts_at: string | null; ends_at: string | null; timezone: string; description: string;
    cover_image: string; venue_name: string; location: string; city: string; online: boolean };
  programme: { title: string; detail: string; area: string; starts_at: string; duration_minutes: number; segment: string | null }[];
};

export default async function GuestEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTokenFormat(token)) notFound();
  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!(await rateLimit(`guest:ip:${ip}`, 120, 3600))) throw new Error("Too many requests. Please try again shortly.");
  const { data, error } = await createAdminClient().rpc("event_guest_view" as never, { p_token_hash: hashToken(token) } as never);
  if (error?.message.includes("rate_limited")) throw new Error("This link is receiving too many requests. Please try again shortly.");
  if (error || !data) notFound();
  const v = data as unknown as View, e = v.event, tz = e.timezone || "Europe/London";
  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const place = [e.venue_name, e.location || e.city].filter(Boolean).join(" · ");
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px", fontFamily: "inherit", color: "var(--k-text, #14142b)" }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--k-muted, #6b7280)" }}>{v.host} invites you{v.link.label ? ` · ${v.link.label}` : ""}</p>
      <h1 style={{ margin: "6px 0 12px", fontSize: 30, lineHeight: 1.2 }}>{e.name}</h1>
      {e.status === "cancelled" && <p role="status" style={{ padding: "10px 12px", borderRadius: 8, background: "#fdecec", color: "#9b1c1c" }}>This event has been cancelled.</p>}
      {e.status === "postponed" && <p role="status" style={{ padding: "10px 12px", borderRadius: 8, background: "#fff7e6", color: "#8a5300" }}>This event has been postponed. Your host will share the new date.</p>}
      {e.cover_image && /^(\/|https:\/\/)/.test(e.cover_image) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.cover_image} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12, margin: "8px 0 16px" }} />
      )}
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: "0 0 20px" }}>
        {e.starts_at && <><dt style={{ fontWeight: 600 }}>When</dt><dd style={{ margin: 0 }}>{day(e.starts_at)}, {time(e.starts_at)}{e.ends_at ? `–${time(e.ends_at)}` : ""} <small style={{ color: "var(--k-muted, #6b7280)" }}>({tz})</small></dd></>}
        {(place || e.online) && <><dt style={{ fontWeight: 600 }}>Where</dt><dd style={{ margin: 0 }}>{place || "Online — your host will send the joining link."}</dd></>}
      </dl>
      {e.description && <p style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}>{e.description}</p>}
      {v.programme.length > 0 && <section aria-labelledby="gp-programme" style={{ marginTop: 28 }}>
        <h2 id="gp-programme" style={{ fontSize: 20, margin: "0 0 10px" }}>Programme</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {v.programme.map((p, i) => <li key={i} style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, padding: "10px 0", borderTop: "1px solid var(--k-border, #e5e7eb)" }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{time(p.starts_at)}</span>
            <span><b>{p.title}</b>{p.area ? <small style={{ color: "var(--k-muted, #6b7280)" }}> · {p.area}</small> : null}{p.detail ? <><br /><small>{p.detail}</small></> : null}</span>
          </li>)}
        </ol>
      </section>}
      <p style={{ marginTop: 32, fontSize: 12, color: "var(--k-muted, #6b7280)" }}>This private link was shared with you by the host and stops working on {new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(v.link.expires_at))} or if the host revokes it. Please don&apos;t post it publicly.</p>
    </main>
  );
}
