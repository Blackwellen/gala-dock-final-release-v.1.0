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
  { key: "organizer-team", title: "Team", match: /^\/organizer\/team\/?$/, steps: [
    { title: "Your team and crew", body: "Staff, freelancers and crew in one place: who’s available, who’s assigned where, and what’s not covered yet." },
    { target: ".tm-people", title: "Team members & crew", body: "Everyone in your workspace and crew pool, with skills and contact details. Search to find someone fast.", placement: "right" },
    { target: ".tm-board", title: "Availability & assignments", body: "Week by week: who’s free, booked or on leave. Assign people to event shifts from here.", placement: "top" },
    { target: ".tm-conf", title: "Conflicts & gaps", body: "Double bookings, travel clashes, missing qualifications and unfilled shifts are flagged here before they become problems.", placement: "left" },
    { target: ".tm-shifts", title: "Upcoming shifts", body: "The next shifts across all events. Use Invite people (top right) to add teammates; roles live in Settings → Team & Access.", placement: "left" },
  ] },
  { key: "organizer-money", title: "Money", match: /^\/organizer\/money\/?$/, steps: [
    { title: "Your money, reconciled", body: "Ticket income, supplier payments, invoices and payouts — all matched to Stripe, per event." },
    { target: "main .mn-c", title: "Revenue vs costs", body: "How each event is tracking against its budget, with profit and loss as the figures come in.", placement: "bottom" },
    { target: 'a[href="/organizer/money/invoices/new"]', title: "Invoices", body: "Raise an invoice for a client. Gala Dock tracks payment and sends reminders.", placement: "bottom" },
    { target: 'a[href="/api/export/transactions"]', title: "Export", body: "Download every transaction as CSV for your accountant.", placement: "bottom" },
    { title: "Payouts", body: "Ticket proceeds are paid out to your connected Stripe account. Supplier payments stay protected until the service is delivered." },
  ] },
  { key: "provider-money", title: "Money", match: /^\/provider\/money\/?$/, steps: [
    { title: "How you get paid", body: "Customers pay through Gala Dock. Your share is held safely and released to you after you deliver." },
    { target: ".pm-chartbox", title: "Earnings overview", body: "Gross, fees and net earnings over time.", placement: "bottom" },
    { target: ".pm-pay", title: "Upcoming payouts", body: "What’s protected, what’s releasing and when it reaches your bank.", placement: "left" },
    { target: ".pm-break", title: "Earnings breakdown", body: "Where your money comes from — venue hire, services, packages and add-ons — and the commission on each.", placement: "left" },
    { target: ".pm-tx", title: "Statements", body: "Monthly statements and every transaction, ready for your accountant.", placement: "top" },
  ] },
  { key: "provider-listings", title: "Listings", match: /^\/provider\/listings(\/[a-z-]+)?\/?$/, steps: [
    { title: "What customers see", body: "Your venues, spaces, services and packages — each listing is a page in the marketplace." },
    { target: 'nav[aria-label="Listing types"]', title: "Listing types", body: "Switch between venues, spaces, services and packages.", placement: "bottom" },
    { target: 'nav[aria-label="Status"]', title: "Status", body: "Filter by published, draft and paused. New listings are reviewed before they appear in the marketplace.", placement: "bottom" },
    { target: ".pl-check", title: "Listing quality", body: "What’s missing from each listing. Complete listings with good photos get more requests.", placement: "left" },
    { target: ".pl-quick", title: "Quick actions", body: "Add a listing, update availability or pause one while you’re fully booked.", placement: "left" },
  ] },
  { key: "venue-map", title: "Venue map", match: /^\/organizer\/events\/[^/]+\/map\/?$/, steps: [
    { title: "Lay out your event", body: "Start from the venue’s floor plan, then add stages, bars, tables and seating. Buyers pick seats from this map at checkout." },
    { target: '[aria-label="Plan tools"]', title: "Tools", body: "Draw rooms and walls, add text, measure distances, rotate and duplicate. Press ? for keyboard shortcuts.", placement: "bottom" },
    { target: 'button[title="Assets library (A)"]', title: "Assets library", body: "Tables, chairs, stages, bars, screens and more — drag them onto the plan.", placement: "bottom" },
    { target: 'button[title="Upload floor plan or layout drawing"]', title: "Upload a floor plan", body: "Trace over a drawing or aerial photo. Calibrate it with two points and a known distance so everything is to scale.", placement: "bottom" },
    { target: '[aria-label="Ticket tiers"]', title: "Seats and ticket tiers", body: "Assign seats and areas to ticket tiers. Save a draft while you work, then Publish to put the map on sale.", placement: "bottom" },
  ] },
  { key: "agent", title: "Gala Agent", match: /^\/(organizer|provider)\/agent\/?$/, steps: [
    { title: "Your operations assistant", body: "Ask about your events, or describe a task. The Agent plans it, runs the safe parts and asks you before anything binding." },
    { title: "Credits and limits", body: "AI work uses credits from your plan. Owners can set daily and per-task limits in Settings → Agent." },
  ] },
];
export const tourFor = (path: string) => TOURS.find(t => t.match.test(path)) ?? null;
