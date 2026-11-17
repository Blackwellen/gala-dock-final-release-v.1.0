import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { AuthRoute } from "@/components/auth-route";
import { requestSanctioned, SANCTIONS_COPY } from "@/lib/legal/sanctions";
import { registrationsOpen, REGISTRATIONS_CLOSED_COPY as RC } from "@/lib/registrations";
import "@/styles/kit.css";

export const metadata: Metadata = { title: "Register · Gala Dock", robots: { index: false } };

export default async function Page({ searchParams }: PageProps<"/register">) {
  // Q74 (D4): no sign-up from a comprehensively sanctioned country/region (edge geolocation). Support can review mistakes.
  const hit = requestSanctioned(await headers());
  if (hit) return <main className="k-root" style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px" }}>
    <h1 style={{ fontSize: 24, marginBottom: 12 }}>{SANCTIONS_COPY.title}</h1>
    <p role="alert">{SANCTIONS_COPY.signUp(hit.name)}</p>
    <p><Link href={SANCTIONS_COPY.helpPath}>Where Gala Dock is available</Link> · <a href="mailto:support@galadock.com">support@galadock.com</a></p>
  </main>;
  // Registrations feature flag: closed unless REGISTRATIONS_OPEN=true. Existing users sign in as normal.
  if (!registrationsOpen()) return <main className="k-root" style={{ maxWidth: 560, margin: "64px auto", padding: "0 16px" }}>
    <section className="k-card" style={{ padding: 28 }} aria-labelledby="reg-closed">
      <h1 id="reg-closed" style={{ fontSize: 24, marginBottom: 12 }}>{RC.title}</h1>
      <p style={{ marginBottom: 20 }}>{RC.body}</p>
      <p style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Link className="k-btn primary" href="/login">{RC.signIn}</Link>
        <a href={`mailto:${RC.contact}`}>{RC.contact}</a>
      </p>
    </section>
  </main>;
  return <AuthRoute screen="register" searchParams={searchParams} />;
}
