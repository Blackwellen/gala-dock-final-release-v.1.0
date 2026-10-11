// Public event page content for Neon Nights: FAQs, gallery, highlights and line-up photography. Idempotent; imported by seed-demo-extras.mjs.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) { console.error(what, r.error); process.exit(1); } return r.data; };
const e = must(await sb.from("events").select("id,settings").eq("slug", "neon-nights").single(), "neon");
const B = "/assets/gd/builder/page-editor";
const settings = { ...e.settings,
  age_limit: 18, attendance: 5000, entry_gate: "Main Gate A", poster: "/assets/gd/builder/poster/poster-main.webp",
  highlights: ["3 stages with world-class production", "International DJs and live artists", "Food & drink village with top local vendors", "Art installations, performers and interactive experiences", "Easy transport links and on-site facilities"],
  features: ["Live Music", "DJ Sets", "Food & Drink", "Art Installations", "Multiple Stages", "Outdoor"],
  gallery: [`${B}/hero-media.webp`, `${B}/hero-gallery-1.webp`, `${B}/hero-gallery-2.webp`, `${B}/hero-gallery-3.webp`, "/assets/gd/ev-neon.webp", "/assets/gd/hero-neon.webp"],
  faqs: [
    { q: "What time does the event start and end?", a: "Gates open at 4:00 PM. Music runs until 1:00 AM, with last entry at 9:00 PM." },
    { q: "Is there an age restriction?", a: "Yes — this is an 18+ event. Valid photo ID is required at the gate." },
    { q: "Can I resell or transfer my ticket?", a: "Yes. Transfers are free in My Tickets, and you can resell at face value through official resale." },
    { q: "What items are prohibited?", a: "Glass, professional cameras, drones, umbrellas and outside food or drink aren't allowed." },
    { q: "Is the event accessible?", a: "Yes — step-free routes, an accessible viewing platform and accessible toilets are available. Contact the organiser to arrange a companion ticket." },
  ] };
must(await sb.from("events").update({ settings }).eq("id", e.id), "neon settings");
const photos = { "DJ Luna": `${B}/lineup-elle-vance.webp`, "The Collective": `${B}/lineup-the-neon-collective.webp` };
const items = must(await sb.from("programme_items").select("id,title").eq("event_id", e.id).eq("kind", "programme"), "programme");
const pool = [`${B}/lineup-dj-marcus-lee.webp`, `${B}/lineup-kairo.webp`, `${B}/lineup-elle-vance.webp`, `${B}/lineup-the-neon-collective.webp`];
for (const [i, it] of items.entries()) { const img = photos[it.title] ?? (/gates|close|doors/i.test(it.title) ? "" : pool[i % pool.length]); must(await sb.from("programme_items").update({ image: img }).eq("id", it.id), "programme image"); }
console.log(JSON.stringify({ publicEvent: true, programme: items.length }));
