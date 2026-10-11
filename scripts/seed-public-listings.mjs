// Rich public-profile content for the design reference listings (Riverside Park Events Venue, Gourmet Catering Co.).
// Idempotent; imported by seed-demo-extras.mjs. Usage alone: node --env-file=.env --env-file=.env.local scripts/seed-public-listings.mjs
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const raw = sb.from.bind(sb); sb.from = t => { const q = raw(t); const ins = q.insert.bind(q); q.insert = (v, o = {}) => ins(v, { defaultToNull: false, ...o }); return q; };
const P = "/assets/gd/profile";
const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
const reviewers = ["alex.thompson@example.com", "james.carter@example.com", "alex.events@example.com"].map(e => users.users.find(u => u.email === e)).filter(Boolean);

async function upsertChildren(l, spaces, packages, reviews) {
  if (spaces.length && !(must(await sb.from("spaces").select("id").eq("venue_id", l.id), "spaces?")).length)
    must(await sb.from("spaces").insert(spaces.map(s => ({ ...s, workspace_id: l.workspace_id, venue_id: l.id, status: "published" }))), "spaces");
  if (!(must(await sb.from("packages").select("id").eq("listing_id", l.id), "pk?")).length)
    must(await sb.from("packages").insert(packages.map(p => ({ ...p, workspace_id: l.workspace_id, listing_id: l.id, status: "published", currency: "GBP" }))), "packages");
  if (!(must(await sb.from("reviews").select("id").eq("listing_id", l.id).is("build_item_id", null), "rv?")).length)
    must(await sb.from("reviews").insert(reviews.map((r, i) => ({ ...r, user_id: reviewers[i % reviewers.length].id, listing_id: l.id, status: "published", created_at: new Date(Date.now() - (i + 1) * 19 * 864e5).toISOString() }))), "reviews");
}

const venue = must(await sb.from("listings").select("id,workspace_id,details").eq("slug", "riverside-park-events-venue").single(), "venue");
must(await sb.from("listings").update({
  image: `${P}/venue-main.webp`, gallery: [`${P}/venue-g1.webp`, `${P}/venue-g2.webp`, `${P}/venue-g3.webp`, `${P}/venue-g4.webp`, `${P}/space-grand-hall.webp`, `${P}/space-riverside-terrace.webp`, `${P}/space-garden-pavilion.webp`],
  description: "Stunning riverside venue with panoramic views of the London skyline, offering versatile event spaces for weddings, corporate events, private parties and festivals. Riverside Park combines contemporary design with natural beauty, featuring indoor ballrooms, outdoor terraces, and flexible spaces to suit events of all sizes.",
  details: { ...venue.details, spaces: 3, setting: "Indoor & Outdoor", events_hosted: "200+", experience: "10+ years", ideal_for: "Perfect for weddings, corporate events, festivals", catering: "In-house & external", parking: "On-site (200 spaces)", accessible: "Fully accessible", popular: true,
    amenities: ["In-house catering", "External catering allowed", "Bar services", "AV & sound system", "Lighting", "WiFi", "Furniture & linen", "Parking (200 spaces)", "Wheelchair accessible", "Bridal suite", "Green rooms", "Security staff", "Air conditioning", "Outdoor terrace"],
    policies: { cancellation: "Flexible (30 days)", deposit: "30% to confirm", curfew: "Music until 01:00", noise: "Outdoor amplified music until 23:00" } },
}).eq("id", venue.id), "venue update");
await upsertChildren(venue,
  [{ name: "The Grand Hall", indoor: true, capacity_seated: 300, capacity_standing: 450, area_sqm: 520, image: `${P}/space-grand-hall.webp`, amenities: ["Chandeliers", "Stage", "Dance floor"], details: { description: "Elegant ballroom with chandeliers, ideal for gala dinners, corporate events and weddings." } },
   { name: "Riverside Terrace", indoor: false, capacity_seated: 120, capacity_standing: 200, area_sqm: 300, image: `${P}/space-riverside-terrace.webp`, amenities: ["River views", "Heaters"], details: { description: "Stunning outdoor terrace with river views, perfect for receptions, parties and festivals." } },
   { name: "The Garden Pavilion", indoor: true, capacity_seated: 100, capacity_standing: 150, area_sqm: 240, image: `${P}/space-garden-pavilion.webp`, amenities: ["Glass walls", "Garden access"], details: { description: "Versatile space with glass walls, suitable for weddings and private events." } }],
  [{ name: "Day Delegate Package", description: "Perfect for corporate events and conferences.", base_price: 85, price_basis: "per_person", min_guests: 30, max_guests: 300, duration_hours: 8, deposit_pct: 30, booking_mode: "request", inclusions: ["Room hire", "Lunch & refreshments", "AV package"] },
   { name: "Evening Reception Package", description: "Drinks, canapés and full event support.", base_price: 120, price_basis: "per_person", min_guests: 50, max_guests: 450, duration_hours: 6, deposit_pct: 30, booking_mode: "request", inclusions: ["Welcome drinks", "Canapés", "Event manager"], details: { badge: "Most popular" } },
   { name: "Full Venue Hire", description: "Exclusive use with full production support.", base_price: 2500, price_basis: "fixed", min_guests: 100, max_guests: 5000, duration_hours: 12, deposit_pct: 30, booking_mode: "request", inclusions: ["All spaces", "Production support", "Security"] }],
  [{ rating: 5, ratings: { quality: 5, communication: 5, value: 4, reliability: 5 }, body: "The terrace at sunset was unforgettable. The team handled 180 guests without a hitch and the views sold it for us." },
   { rating: 5, ratings: { quality: 5, communication: 4, value: 5, reliability: 5 }, body: "Used the Grand Hall for our awards night — production support was excellent and load-in was smooth." },
   { rating: 4, ratings: { quality: 5, communication: 4, value: 4, reliability: 4 }, body: "Gorgeous spaces and helpful staff. Parking filled up quickly, so plan transport for larger groups." }]);

const svc = must(await sb.from("listings").select("id,workspace_id,details").eq("slug", "gourmet-catering-co").single(), "service");
must(await sb.from("listings").update({
  image: `${P}/service-main.webp`, gallery: [`${P}/service-g1.webp`, `${P}/service-g2.webp`, `${P}/service-g3.webp`, `${P}/service-g4.webp`, `${P}/service-signature.webp`],
  description: "Award-winning catering for weddings, corporate events, festivals and private celebrations. Seasonal menus, bespoke experiences and flawless execution from an expert team.",
  details: { ...svc.details, logo: `${P}/service-logo.webp`, tagline: "Exceptional cuisine. Unforgettable events.", events_hosted: "500+", experience: "10+ years", coverage: "Covers UK & Europe", team: "10–50 team", top_rated: true,
    signature: { kicker: "Signature experience", title: "Festival-Ready Catering at Any Scale", body: "From VIP dining to artist catering and general admission food villages, we design unforgettable culinary experiences tailored to your event.", image: `${P}/service-signature.webp` },
    highlights: [{ t: "Michelin-trained chefs", d: "World-class culinary team" }, { t: "Sustainable & local sourcing", d: "Seasonal, ethical ingredients" }, { t: "Flexible at any scale", d: "From 50 to 50,000+ guests" }, { t: "Dietary inclusivity", d: "Vegan, vegetarian, halal, gluten-free" }, { t: "Full event support", d: "Menus, staffing, equipment & logistics" }],
    price_tiers: [{ l: "Standard", p: 25 }, { l: "Premium", p: 45 }, { l: "Bespoke", p: 75 }],
    policies: { cancellation: "Free up to 21 days before", deposit: "25% to confirm", minimum: "Minimum 50 guests" } },
}).eq("id", svc.id), "service update");
await upsertChildren(svc, [],
  [{ name: "Festival Essentials", description: "Perfect for large-scale events and food villages.", base_price: 25, price_basis: "per_person", min_guests: 200, deposit_pct: 25, booking_mode: "request", image: `${P}/pkg-festival-essentials.webp`, inclusions: ["Street food style", "Custom branding", "Dietary options", "Min. 200 guests"], details: { badge: "Most popular" } },
   { name: "Signature Dining", description: "Elevated menus for VIP areas and private dining.", base_price: 45, price_basis: "per_person", min_guests: 50, deposit_pct: 25, booking_mode: "request", image: `${P}/pkg-signature-dining.webp`, inclusions: ["Fine dining menus", "Table service options", "Wine pairing", "Min. 50 guests"], details: { badge: "Premium" } },
   { name: "Bespoke Experience", description: "Fully custom menus and experiences.", base_price: 75, price_basis: "per_person", deposit_pct: 25, booking_mode: "enquiry", image: `${P}/pkg-bespoke-experience.webp`, inclusions: ["Tailored menu design", "Full production support", "Themed dining experiences", "Any guest count"], details: { badge: "Bespoke" } }],
  [{ rating: 5, ratings: { quality: 5, communication: 5, value: 5, reliability: 5 }, body: "Fed 3,000 festival-goers across two days with zero queues at peak. The vegan options were a huge hit." },
   { rating: 5, ratings: { quality: 5, communication: 5, value: 4, reliability: 5 }, body: "Our wedding canapés were the talk of the night. Menu tasting was thorough and the team was lovely." },
   { rating: 4, ratings: { quality: 5, communication: 4, value: 4, reliability: 4 }, body: "Excellent food and service; final headcount changes were handled calmly the week before." }]);
console.log(JSON.stringify({ publicListings: true }));
