/** Provider sidebar Gala Agent card: copy per section, as written in the PROV designs. First match wins. */
export type PromoCopy = { title: string; text: string; cta?: "Open" | "Use" | "Upgrade"; href?: string };

type Rule = [RegExp, PromoCopy | ((q: URLSearchParams) => PromoCopy)];
const step = (q: URLSearchParams) => Number(q.get("step")) || 1;

const RULES: Rule[] = [
  [/^\/provider\/opportunities\/[^/]+\/quote/, { title: "help you win more", text: "Get AI-powered suggestions for pricing, packages and responses based on your listings, calendar and market data.", cta: "Use" as const }],
  [/^\/provider\/(opportunities|quotes)(\/|$)/, { title: "find more business", text: "Get AI-powered opportunities, automated responses and smart availability management." }],
  [/^\/provider\/bookings\/[^/]+/, { title: "handle the admin", text: "Get AI-powered confirmations, run sheets, team assignments and more." }],
  [/^\/provider\/calendar/, { title: "handle the admin", text: "Get AI-powered scheduling, availability optimisation and conflict detection." }],
  [/^\/provider\/listings/, { title: "grow your listings", text: "Get AI-powered descriptions, image suggestions, pricing insights and more." }],
  [/^\/provider\/venues\/new/, q => [
    { title: "build your venue listing", text: "Get AI-powered suggestions, structure your description and optimise your visibility." },
    { title: "build your venue", text: "Get AI-powered suggestions for spaces, layouts and capacities based on your venue type.", cta: "Use" as const },
    { title: "optimise your venue setup", text: "Get AI-powered recommendations for pricing, booking rules and policies based on your venue type and market.", cta: "Use" as const },
  ][step(q) - 1] ?? { title: "complete your setup", text: "Get AI-powered recommendations for venue operations, compliance and marketplace readiness.", cta: "Use" as const } as PromoCopy],
  [/^\/provider\/venues\/[^/]+\/spaces\/new/, { title: "create your space", text: "Get AI-powered suggestions for layouts, capacity and features based on your venue type.", cta: "Use" as const }],
  [/^\/provider\/venues\/[^/]+\/spaces\/[^/]+/, q => q.get("tab") === "availability"
    ? { title: "optimise your space", text: "Get AI-powered recommendations for availability, pricing and rules based on demand.", cta: "Use" as const }
    : { title: "grow your spaces", text: "Get AI-powered layout suggestions, pricing insights, and availability optimisation." }],
  [/^\/provider\/venues\/[^/]+/, q => q.get("tab") === "spaces"
    ? { title: "build your venue", text: "Get AI-powered suggestions for spaces, layouts and capacities based on your venue type.", cta: "Use" as const }
    : { title: "grow your venue", text: "Get AI-powered insights, recommendations, and automated content updates." }],
  [/^\/provider\/services\/new/, q => [
    { title: "create your service", text: "Get AI-powered suggestions for categories, descriptions, pricing and coverage based on your business type.", cta: "Use" as const },
    { title: "optimise your service", text: "Get AI-powered suggestions for pricing, packages and requirements based on your market and event type.", cta: "Use" as const },
  ][step(q) - 1] ?? { title: "optimise your service", text: "Get AI-powered recommendations for availability, pricing and marketplace readiness.", cta: "Use" as const } as PromoCopy],
  [/^\/provider\/services\/[^/]+/, { title: "grow your services", text: "Get AI-powered descriptions, pricing insights, and performance recommendations." }],
  [/^\/provider\/packages\/new/, q => step(q) === 1
    ? { title: "create your package", text: "Get AI-powered suggestions for bundles, pricing, inclusions and descriptions based on your venue and services.", cta: "Use" as const }
    : { title: "optimise your packages", text: "Get AI-powered recommendations for pricing, availability and market positioning.", cta: "Use" as const }],
  [/^\/provider\/packages\/[^/]+/, { title: "grow your packages", text: "Get AI-powered package ideas, pricing suggestions, and market insights." }],
  [/^\/provider\/team/, { title: "grow your team", text: "Get AI-powered staff suggestions, availability checks and automated assignments." }],
  [/^\/provider\/money/, { title: "grow your earnings", text: "Get AI-powered pricing insights, payout forecasts and plan recommendations." }],
  [/^\/provider\/agent/, { title: "work for you", text: "Automate responses, manage availability, optimise pricing and keep events on track.", cta: "Upgrade", href: "/provider/settings?tab=billing" }],
  [/^\/provider\/settings/, { title: "optimise your setup", text: "Get AI-powered recommendations to improve your listings, pricing and availability." }],
];
const DEFAULT: PromoCopy = { title: "handle the admin", text: "Get AI-powered confirmations, reminders, team assignments and more." };

export function promoFor(pathname: string, query: URLSearchParams): PromoCopy {
  for (const [re, copy] of RULES) if (re.test(pathname)) return typeof copy === "function" ? copy(query) : copy;
  return DEFAULT;
}
