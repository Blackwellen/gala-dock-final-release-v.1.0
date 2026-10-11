import neonClientHero from "./media/neon-client-hero.webp";
import neonPromoterHero from "./media/neon-promoter-hero.webp";
import partnerProgramHero from "./media/partner-program-hero.webp";

/**
 * Built-in portal banners (wide crops prepared for the 910×188 hero slot). Events without one fall back to their
 * own hero/cover image, so this is presentation only — no event data lives here.
 */
const EVENT_HEROES: Record<string, { client: string; promoter: string }> = {
  "neon-nights": { client: neonClientHero.src, promoter: neonPromoterHero.src },
};
export function eventHero(slug: string | null | undefined, kind: "client" | "promoter", fallback: string) {
  const own = slug ? EVENT_HEROES[slug]?.[kind] : undefined;
  // Built-in banners already carry a dark left edge for the overlay copy; fallbacks get a legibility gradient.
  return { src: own || fallback, className: own ? "pt-hero built-in" : "pt-hero" };
}
export const partnerHero = partnerProgramHero.src;
