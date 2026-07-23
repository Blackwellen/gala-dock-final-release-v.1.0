# Public event commerce — reference image map

Source folder: `working_imagesS_public_marketplace_pages/` (7 ChatGPT-generated PNGs, generic
filenames — mapped below by visible content, not filename).

| # | File | Maps to | Route / component group |
|---|------|---------|--------------------------|
| 1 | `ChatGPT Image Jul 12, 2026, 08_26_03 PM (1).png` | Shared commerce card system | `src/components/public-commerce/*`, `src/components/workspace-cards/*` |
| 2 | `ChatGPT Image Jul 12, 2026, 08_26_03 PM (2).png` | Public event search & discovery | `/discover` |
| 3 | `ChatGPT Image Jul 12, 2026, 08_26_04 PM (3).png` | Ticket & seat selection | `/e/[slug]/tickets` |
| 4 | `ChatGPT Image Jul 12, 2026, 08_26_04 PM (4).png` | Checkout & payment | `/e/[slug]/checkout` |
| 5 | `ChatGPT Image Jul 12, 2026, 08_26_04 PM (5).png` | Public event profile | `/e/[slug]` |
| 6 | `ChatGPT Image Jul 12, 2026, 08_26_05 PM (6).png` | Homepage — ticketing enabled | `(marketing)/_home/EnabledHome.tsx` |
| 7 | `ChatGPT Image Jul 12, 2026, 08_26_05 PM (7).png` | Homepage — ticketing disabled | `(marketing)/_home/DisabledHome.tsx` |

## Screenshot artefacts intentionally NOT reproduced
None of the seven images contained browser chrome, OS taskbar or desktop wallpaper — they were
clean UI mockups. No cropping/distortion correction was needed. Payment-method logos (Visa/
Mastercard/Amex/Apple Pay/Google Pay) are reproduced only as generic iconography, not as brand
lockups, and only for methods actually wired through the existing Stripe integration
(`src/lib/stripe.ts`, Stripe Checkout hosted page) — no fake/unconfigured payment method badges
were added.

## Per-image notes

### Image 1 — Shared commerce card system
Viewport: desktop (~1680px), white background, `COMPONENT LIBRARY` eyebrow + `Public Commerce
Card System` H1. Not a public route — implemented as real reusable components, used across the
public and workspace surfaces below, with no standalone "component library" route shipped to
production (per the brief: internal-only, not a public page).
Cards mapped: Public Event Card (flagship) → `PublicEventCard.tsx`; Seating Planner (Preview) →
`SeatingPreview.tsx`; Ticket Tiers → `TicketTierList.tsx`; Venue Map (Preview) →
`VenueMapPreview.tsx`; Event Manager Workspace card → existing `EventCard.tsx` (unchanged, already
matches this visual language); Event Proposal → `ProposalCard.tsx`; Venue Card → `VenueCard.tsx`;
Supplier Card → `SupplierCard.tsx`.

### Image 2 — Public event search & discovery
Section order: sticky public nav → hero + big search + popular-search chips → filter bar (date
range, category, event type, area, artist, price, venue, accessibility, family-friendly, sort) →
view switcher (Grid/List/Calendar/Map) + date strip → "Promoted Events" rail (compact cards) →
result grid (5-col desktop) → right sidebar (map, saved searches, trending searches) → trust strip
→ pagination/"Load more". All filters URL-backed (`?q=&city=&category=&event_type=&from=&to=&
price_min=&price_max=&sort=&view=&page=`) so a refreshed URL restores state. Map/Calendar views
render an honest "coming soon" panel where no venue geocoordinates exist, rather than a fabricated
map with invented markers.

### Image 3 — Ticket & seat selection
Section order: step indicator (1 Choose Tickets → 2 Select Seats → 3 Review & Pay) + secure-
checkout badge → event summary strip → two-column body (ticket tiers left, section-availability
visual centre) → sticky basket (right, desktop) / bottom sheet (mobile) → price summary → "Continue
to review". Implemented as tier/section-level real availability (`ticket_types.quantity - sold`),
not fabricated individual seat numbers — see `docs/release-gated/user-fixes/public-event-
commerce.md` for the true per-seat map follow-up. No countdown timer was built, since there is no
server-authoritative seat-hold table yet; a fake client-side countdown would violate the "no
browser-only reservations" requirement, so it was intentionally omitted rather than faked.

### Image 4 — Checkout & payment
Section order: step indicator (Your Details → Billing → Payment → Review) → event summary → 
contact/billing/delivery/promo-code panels (left) → payment panel (redirects to Stripe-hosted
Checkout rather than an inline raw card form — Gala Dock never touches card data) → order summary
+ trust badges (right, sticky). All prices, fees and discounts are computed server-side
(`src/app/(marketing)/e/[slug]/pricing.ts` + `checkout/actions.ts`) and re-validated at submission
time — the client never supplies a trusted total.

### Image 5 — Public event profile
Section order: hero (poster + title + badges + date/venue + Share/Favourite/Get Tickets + stat
chips) → sticky tab nav → About/Lineup/Gallery/Schedule → Ticket Tiers/Seating/Venue Map/Venue
Details/Similar Events → Accessibility/Age Restriction/FAQs/Refund Policy/Hosted By → sticky order
rail (desktop) / sticky bottom bar (mobile). Every section reading from the new
`event_public_pages` JSON columns (lineup, gallery, schedule, accessibility_features, policies,
faqs) is conditionally rendered and omitted when empty — no filler content.

### Image 6 — Homepage, ticketing enabled
"Discover unforgettable events. Sell tickets with ease." Section order: nav → hero+search → 
Featured Upcoming Events (real published events) → Browse by Category → Explore by date → feature
showcase (tiers/seat maps/venue maps/mobile tickets) → organiser revenue section → trust stats →
benefits grid → final CTA → footer.

### Image 7 — Homepage, ticketing disabled
"Run every event. From first enquiry to final invoice." / "The Event Delivery OS". Section order:
nav (no Events/Tickets links) → hero+CTAs → restrained "public ticket sales are currently
disabled" info banner → platform/dashboard preview → module grid → second banner → AI Proposal
Builder → trust logos → business-type grid → capability comparison table → final CTA → footer.
The enabled/disabled branch is resolved server-side in `(marketing)/layout.tsx` via
`isFlagEnabled("publicEventsDirectory", …)` — no client-side flash of the wrong nav/homepage.
