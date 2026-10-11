/**
 * Guided tour content (release spec §86). Each tour applies to a route pattern; steps anchor to stable selectors (navigation links by
 * href, labelled regions). A step whose target isn't on screen is shown centred instead of being skipped silently.
 */
export type TourStep = { target?: string; title: string; body: string; placement?: "right" | "bottom" | "left" | "top" };
export type Tour = { key: string; title: string; match: RegExp; steps: TourStep[] };
const nav = (portal: string, href: string) => `nav[aria-label="${portal}"] a[href="${href}"]`;

export const TOURS: Tour[] = [
  { key: "organizer-home", title: "Welcome to your Organizer workspace", match: /^\/organizer\/?$/, steps: [
    { title: "Hi, I’m your Gala Dock guide", body: "I’ll show you around in under a minute. You can skip any time, and restart from the Help menu." },
    { target: nav("Organizer", "/organizer/events"), title: "Events", body: "Every event lives here: plans, budgets, suppliers, tickets, run sheets and live mode.", placement: "right" },
    { target: nav("Organizer", "/organizer/marketplace"), title: "Marketplace", body: "Find venues and suppliers, request quotes, place holds and line up backups — payments are protected until delivery.", placement: "right" },
    { target: nav("Organizer", "/organizer/tickets"), title: "Tickets & Promotion", body: "Set up ticket tiers, sales windows, resale rules and promoter links. Scan tickets at the door from the event page.", placement: "right" },
    { target: nav("Organizer", "/organizer/media"), title: "Media Studio", body: "Design posters, social posts and screens. Event details and ticket QR codes stay in sync automatically.", placement: "right" },
    { target: nav("Organizer", "/organizer/money"), title: "Money", body: "Payouts, invoices, supplier payments and settlement — all reconciled with Stripe.", placement: "right" },
    { target: nav("Organizer", "/organizer/agent"), title: "Gala Agent", body: "Ask questions or hand off tasks. Anything that commits money or contacts people waits for your approval.", placement: "right" },
    { target: nav("Organizer", "/organizer/settings"), title: "Settings", body: "Team roles, two-step verification, API keys and Agent limits live here.", placement: "right" },
  ] },
  { key: "provider-home", title: "Welcome to your Provider workspace", match: /^\/provider\/?$/, steps: [
    { title: "Hi, I’m your Gala Dock guide", body: "Here’s where the work comes in and how you get paid." },
    { target: nav("Provider workspace", "/provider/opportunities"), title: "Opportunities", body: "New requests from organisers and customers. Respond before the deadline to keep your reliability score high.", placement: "right" },
    { target: nav("Provider workspace", "/provider/bookings"), title: "Bookings", body: "Confirmed work, event orders and day-of check-in. Payments are released to you after delivery.", placement: "right" },
    { target: nav("Provider workspace", "/provider/calendar"), title: "Calendar", body: "Availability, holds and blocks across all your spaces and team — conflicts are flagged automatically.", placement: "right" },
    { target: nav("Provider workspace", "/provider/listings"), title: "Listings", body: "Your venues, spaces, services and packages — what customers see in the marketplace.", placement: "right" },
    { target: nav("Provider workspace", "/provider/money"), title: "Money", body: "Payouts, commission and invoices. Finish Stripe payout setup to receive transfers.", placement: "right" },
    { target: nav("Provider workspace", "/provider/agent"), title: "Gala Agent", body: "Let the Agent draft quotes, check availability and summarise opportunities — you approve anything binding.", placement: "right" },
  ] },
  { key: "customer-discover", title: "Welcome to Gala Dock", match: /^\/discover\/?$/, steps: [
    { title: "Welcome!", body: "Find events, buy tickets and plan your own celebrations — all in one place." },
    { target: nav("Main", "/discover"), title: "Discover", body: "Browse events, venues and suppliers near you.", placement: "bottom" },
    { target: nav("Main", "/plan"), title: "Plan", body: "Planning a party or wedding? Build it step by step and get quotes from trusted suppliers.", placement: "bottom" },
    { target: nav("Main", "/account/tickets"), title: "My tickets", body: "Your tickets live here. The QR code refreshes on screen so screenshots can’t be reused.", placement: "bottom" },
  ] },
  { key: "organizer-events", title: "Events", match: /^\/organizer\/events\/?$/, steps: [
    { target: 'a[href^="/organizer/events/new"]', title: "Create an event", body: "Start from scratch or a template. You can publish a page and sell tickets when you’re ready.", placement: "bottom" },
    { target: "main table, main [role=table], main ul", title: "Your events", body: "Open any event to manage its plan, suppliers, tickets and live operations.", placement: "top" },
  ] },
  { key: "media-studio", title: "Media Studio", match: /^\/(organizer|provider)\/media\/?$/, steps: [
    { target: 'nav[aria-label="Library"]', title: "Your library", body: "Your designs, your workspace’s templates and the community gallery.", placement: "bottom" },
    { title: "Start a design", body: "Use New design to pick a size — or start from your event poster, which fills in the name, date, venue and ticket QR for you." },
  ] },
  { key: "agent", title: "Gala Agent", match: /^\/(organizer|provider)\/agent\/?$/, steps: [
    { title: "Your operations assistant", body: "Ask about your events, or describe a task. The Agent plans it, runs the safe parts and asks you before anything binding." },
    { title: "Credits and limits", body: "AI work uses credits from your plan. Owners can set daily and per-task limits in Settings → Agent." },
  ] },
];
export const tourFor = (path: string) => TOURS.find(t => t.match.test(path)) ?? null;
