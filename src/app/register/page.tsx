import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { AuthRoute } from "@/components/auth-route";
import { requestSanctioned, SANCTIONS_COPY } from "@/lib/legal/sanctions";
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
  return <AuthRoute screen="register" searchParams={searchParams} />;
}
