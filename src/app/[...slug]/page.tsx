import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AuthRoute } from "@/components/auth-route";
import { OnboardingRoute } from "@/components/onboarding-route";
import { authScreens, onboardingRoutes, publicRoutes, type AuthScreen } from "@/lib/routes";
import { previewsEnabled } from "@/lib/preview-data";

const legacyAuth: Record<string, string> = { "secure-access": "/access", invite: "/onboarding" };
const legacyOnboarding: Record<string, string> = {
  experience: "/onboarding", preferences: "/onboarding/customer?step=1",
  "organizer/business": "/onboarding/organizer?step=1", "organizer/events": "/onboarding/organizer?step=2", "organizer/brand": "/onboarding/organizer?step=3", "organizer/team": "/onboarding/organizer?step=4",
  "provider/business": "/onboarding/provider?step=1", "provider/listing": "/onboarding/provider?step=2", "provider/rules": "/onboarding/provider?step=3", "provider/publish": "/onboarding/provider?step=4",
};

export default async function Page({ params, searchParams }: PageProps<"/[...slug]">) {
  const { slug } = await params;
  const path = slug.join("/");
  const query = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v : v ? [v] : []).map(x => [k, x]))).toString();

  // Pre-phase-1 URLs keep working.
  if (slug[0] === "auth" && slug.length === 2) {
    const target = legacyAuth[slug[1]] ?? (authScreens.includes(slug[1] as AuthScreen) ? `/${slug[1]}` : null);
    if (target) permanentRedirect(`${target}${query ? `${target.includes("?") ? "&" : "?"}${query}` : ""}`);
  }
  if (slug[0] === "onboarding" && legacyOnboarding[slug.slice(1).join("/")]) permanentRedirect(legacyOnboarding[slug.slice(1).join("/")]);
  if (slug[0] === "app" && ["customer", "organizer", "provider", "admin"].includes(slug[1])) permanentRedirect(slug[1] === "customer" ? "/discover" : `/${slug[1]}`);

  // Design QA previews with deterministic data. Never available in production builds.
  if (slug[0] === "preview" && previewsEnabled()) {
    const rest = slug.slice(1);
    if (rest.length === 1 && authScreens.includes(rest[0] as AuthScreen)) return <AuthRoute screen={rest[0] as AuthScreen} searchParams={searchParams} preview />;
    if (rest[0] === "onboarding" && rest.length === 1) return <OnboardingRoute flow="experience" searchParams={searchParams} preview />;
    if (rest[0] === "onboarding" && ["customer", "organizer", "provider"].includes(rest[1]) && rest.length === 2) return <OnboardingRoute flow={rest[1] as "customer"} searchParams={searchParams} preview />;
  }
  if (path === "designs" && previewsEnabled()) {
    return <main className="retained-previews">
      <h1>Auth and onboarding previews</h1>
      <section><h2>Authentication</h2><div>{authScreens.map(screen => <Link key={screen} href={`/preview/${screen}`}>{screen.replaceAll("-", " ")}</Link>)}</div></section>
      <section><h2>Onboarding</h2><div>{onboardingRoutes.map(r => <Link key={`${r.flow}-${r.step}`} href={`/preview/onboarding${r.flow === "experience" ? "" : `/${r.flow}?step=${r.step}`}`}>{r.title}</Link>)}</div></section>
    </main>;
  }
  if (publicRoutes.some(route => route.path === `/${path}`) || ["help", "privacy", "terms", "checkout"].includes(path)) {
    return <main className="blank-page" aria-label="Blank page" />;
  }
  notFound();
}
