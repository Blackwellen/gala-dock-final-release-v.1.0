// Q13 food, drinks and hospitality on the demo identities.
//   * Catalogue (provider-authored, the same RLS-bound table writes the provider Menus screen makes — src/lib/venue/actions.ts
//     saveMenu/saveMenuSection/saveMenuItem/saveMenuVariant/saveBarPackage — as the signed-in provider owner): three menus with
//     sections, items with declared allergens (14 UK FIC keys), "may contain", dietary tags, courses and relational variants;
//     three bar packages.
//   * Selections through the commands as the event side: catering on Alex's 30th (Premier · Gourmet Catering Co, confirmed) with
//     final numbers set (hospitality_set_final_numbers), crew catering on Neon Nights, an open bar on the Alex & Taylor wedding
//     (hospitality_save_bar). Provider freezes the 30th (hospitality_confirm), syncs the BEO with event_order_sync_hospitality
//     (send) and the event owner approves it (approve_event_order). Neon's BEO is synced and sent (awaiting approval).
//   * Hospitality schedules on Neon Nights (green room / artist catering, crew meals, VIP) via hospitality_save_schedule.
import { sql } from "./lib.mjs";
import { signIn, call } from "./auth.mjs";

const PROV = "provider.demo@example.com";
const q1 = async q => (await sql(q))[0];
const esc = s => s.replace(/'/g, "''");
const A = (...a) => a;

const MENUS = [
  { listing: "gourmet-catering-co", name: "Summer Garden Feast", kind: "food", serving_style: "plated", pricing: "per_person", price: 68, min_guests: 30, max_guests: 250,
    service_window_minutes: 150, final_numbers_days: 10, prep_requirements: "Kitchen access from 14:00; 1 chef per 40 guests, 1 server per 12.",
    description: "Three-course seasonal British menu. Guests choose one dish per course in advance; vegetarian and vegan variants on every course.",
    sections: [
      { name: "Starters", choose_min: 1, choose_max: 1, items: [
        { name: "Heritage tomato & burrata", course: "starter", dietary: A("vegetarian", "gluten_free"), allergens: A("milk"), may_contain: [], variants: [{ name: "Vegan (cashew ricotta)", price_delta_minor: 0, dietary: A("vegan", "vegetarian", "gluten_free"), allergens: A("nuts") }] },
        { name: "Smoked trout, pickled cucumber, rye", course: "starter", dietary: A("pescatarian"), allergens: A("fish", "gluten", "milk", "mustard"), may_contain: A("sesame") },
        { name: "Chicken liver parfait, brioche", course: "starter", dietary: [], allergens: A("eggs", "gluten", "milk", "sulphites"), may_contain: [] }] },
      { name: "Mains", choose_min: 1, choose_max: 1, items: [
        { name: "Herb-crusted lamb rump, minted peas", course: "main", dietary: A("gluten_free"), allergens: A("celery", "sulphites"), may_contain: A("milk"),
          variants: [{ name: "Halal lamb", price_delta_minor: 0, dietary: A("halal", "gluten_free"), allergens: A("celery", "sulphites") }] },
        { name: "Pan-roasted sea bass, samphire, beurre blanc", course: "main", dietary: A("pescatarian", "gluten_free"), allergens: A("fish", "milk", "molluscs"), may_contain: A("crustaceans") },
        { name: "Wild mushroom Wellington", course: "main", dietary: A("vegetarian"), allergens: A("gluten", "eggs", "milk", "celery"), may_contain: [],
          variants: [{ name: "Vegan pastry", price_delta_minor: 0, dietary: A("vegan", "vegetarian"), allergens: A("gluten", "celery", "soya") }] }] },
      { name: "Desserts", choose_min: 1, choose_max: 1, items: [
        { name: "Eton mess", course: "dessert", dietary: A("vegetarian", "gluten_free"), allergens: A("eggs", "milk"), may_contain: [] },
        { name: "Dark chocolate tart, sea salt", course: "dessert", dietary: A("vegetarian"), allergens: A("gluten", "eggs", "milk", "soya"), may_contain: A("nuts", "peanuts") },
        { name: "Seasonal fruit & sorbet", course: "dessert", dietary: A("vegan", "vegetarian", "gluten_free", "dairy_free", "nut_free"), allergens: [], may_contain: [] }] }] },
  { listing: "gourmet-catering-co", name: "Crew & Artist Catering", kind: "food", serving_style: "buffet", pricing: "per_person", price: 18, min_guests: 20, max_guests: 400,
    service_window_minutes: 90, final_numbers_days: 5, prep_requirements: "Back-of-house room with 16 A power and a hand-wash station.",
    description: "Hot buffet for crew, artists and staff: two mains, sides, salad bar, fruit, tea and coffee.",
    sections: [{ name: "Hot buffet", choose_min: 2, choose_max: 2, items: [
      { name: "Chicken tikka masala, pilau rice", course: "main", dietary: A("halal", "gluten_free"), allergens: A("milk", "mustard"), may_contain: A("nuts") },
      { name: "Chickpea & spinach curry", course: "main", dietary: A("vegan", "vegetarian", "gluten_free", "dairy_free"), allergens: [], may_contain: A("mustard") },
      { name: "Beef chilli, rice", course: "main", dietary: A("gluten_free", "dairy_free"), allergens: A("celery"), may_contain: [] }] },
      { name: "Sides & salad bar", choose_min: 0, choose_max: 3, items: [
      { name: "Garlic naan", course: "side", dietary: A("vegetarian"), allergens: A("gluten", "milk"), may_contain: A("sesame", "eggs") },
      { name: "Mixed leaf salad bar", course: "side", dietary: A("vegan", "vegetarian", "gluten_free"), allergens: A("mustard"), may_contain: [] }] }] },
  { listing: "gala-bites-catering", name: "Arena Street Food", kind: "food", serving_style: "street_food", pricing: "per_person", price: 32, min_guests: 50, max_guests: 2000,
    service_window_minutes: 180, final_numbers_days: 7, prep_requirements: "Three trader pitches on the concourse; 32 A three-phase per pitch.",
    description: "Three street-food stations served from the arena concourse.",
    sections: [{ name: "Stations", choose_min: 2, choose_max: 3, items: [
      { name: "Korean fried chicken bao", course: "main", dietary: [], allergens: A("gluten", "soya", "sesame", "eggs"), may_contain: A("peanuts") },
      { name: "Halloumi & harissa wrap", course: "main", dietary: A("vegetarian"), allergens: A("milk", "gluten"), may_contain: A("sesame") },
      { name: "Jackfruit tacos", course: "main", dietary: A("vegan", "vegetarian", "dairy_free"), allergens: [], may_contain: A("gluten") }] }] },
];
const BARS = [
  { listing: "riverside-bars", name: "Prosecco & Craft Beer Open Bar", model: "open_bar", per_person: 28, token_price: 6, corkage_per_bottle: 12, allowed_modes: ["hosted_bar", "drink_tokens"],
    description: "Prosecco, two craft lagers, an IPA, house wines and soft drinks for four hours.", hours_from: "18:00", hours_to: "23:30", staffing: "1 bartender per 50 guests", setup_minutes: 60, deposit_pct: 30,
    licensing: { provided_by: "provider", licence_ref: "PL-RB-2026", min_age: 18 } },
  { listing: "riverside-bars", name: "Cash Bar with Minimum Spend", model: "minimum_spend", min_spend: 1500, allowed_modes: ["cash_bar"],
    description: "Full cash bar; the host tops up if takings fall below the minimum.", hours_from: "19:00", hours_to: "01:00", staffing: "4 bartenders", setup_minutes: 45, deposit_pct: 20,
    licensing: { provided_by: "provider", licence_ref: "PL-RB-2026", min_age: 18 } },
  { listing: "gala-bites-catering", name: "Arena Hosted Bar", model: "hosted_bar", per_person: 22, allowed_modes: ["cash_bar", "drink_tokens"], token_price: 5.5,
    description: "Beer, wine and soft drinks charged to the host's tab.", hours_from: "18:00", hours_to: "23:00", staffing: "Arena bar team", setup_minutes: 30, deposit_pct: 25,
    licensing: { provided_by: "venue", licence_ref: "PL-SE1-0412", min_age: 18 } },
];

async function ensureMenus(prov, out) {
  for (const m of MENUS) {
    const l = await q1(`select id, workspace_id from public.listings where slug = '${m.listing}'`);
    let menu = (await q1(`select id from public.menus where workspace_id = '${l.workspace_id}' and name = '${esc(m.name)}'`))?.id;
    if (!menu) {
      const { sections, listing, ...row } = m;
      const r = await prov.from("menus").insert({ ...row, workspace_id: l.workspace_id, listing_id: l.id, status: "published" }).select("id").single();
      if (r.error) throw new Error(`menus: ${r.error.message}`);
      menu = r.data.id; out.menus++;
    }
    for (const [si, s] of m.sections.entries()) {
      let sec = (await q1(`select id from public.menu_sections where menu_id = '${menu}' and name = '${esc(s.name)}'`))?.id;
      if (!sec) {
        const r = await prov.from("menu_sections").insert({ menu_id: menu, name: s.name, choose_min: s.choose_min, choose_max: s.choose_max, sort: si }).select("id").single();
        if (r.error) throw new Error(`menu_sections: ${r.error.message}`);
        sec = r.data.id; out.sections++;
      }
      for (const [ii, it] of s.items.entries()) {
        let item = (await q1(`select id from public.menu_items where menu_id = '${menu}' and name = '${esc(it.name)}'`))?.id;
        if (!item) {
          const { variants, ...row } = it;
          const r = await prov.from("menu_items").insert({ ...row, menu_id: menu, section_id: sec, description: "", unit: "portion", available: true, allergen_status: "declared", sort: ii,
            allergen_note: row.may_contain.length ? "Prepared in a kitchen that handles the listed 'may contain' allergens." : "" }).select("id").single();
          if (r.error) throw new Error(`menu_items: ${r.error.message}`);
          item = r.data.id; out.items++;
        }
        for (const [vi, v] of (it.variants ?? []).entries()) {
          if ((await q1(`select count(*)::int n from public.menu_item_variants where menu_item_id = '${item}' and name = '${esc(v.name)}'`)).n) continue;
          const r = await prov.from("menu_item_variants").insert({ ...v, menu_item_id: item, menu_id: menu, may_contain: [], available: true, sort: vi });
          if (r.error) throw new Error(`menu_item_variants: ${r.error.message}`);
          out.variants++;
        }
      }
    }
  }
  for (const b of BARS) {
    const l = await q1(`select id, workspace_id from public.listings where slug = '${b.listing}'`);
    if ((await q1(`select count(*)::int n from public.bar_packages where workspace_id = '${l.workspace_id}' and name = '${esc(b.name)}'`)).n) continue;
    const { listing, ...row } = b;
    const r = await prov.from("bar_packages").insert({ ...row, workspace_id: l.workspace_id, listing_id: l.id, glassware: true, status: "published" });
    if (r.error) throw new Error(`bar_packages: ${r.error.message}`);
    out.bar_packages++;
  }
}

const line = async (ev, slug) => q1(`select b.id from public.build_items b join public.listings l on l.id = b.listing_id join public.events e on e.id = b.event_id
  where e.slug = '${ev}' and l.slug = '${slug}' and b.status not in ('cancelled','declined','expired') order by b.created_at limit 1`);
const menuItems = async (menu, names) => sql(`select i.id item_id from public.menu_items i join public.menus m on m.id = i.menu_id where m.name = '${esc(menu)}' and i.name in ('${names.map(esc).join("','")}')`);

export async function run() {
  const out = { menus: 0, sections: 0, items: 0, variants: 0, bar_packages: 0, catering_selections: 0, final_numbers: 0, bar_selections: 0, confirmed: 0, beo_synced: 0, beo_approved: 0, schedules: 0 };
  const prov = await signIn(PROV);
  await ensureMenus(prov, out);
  const menuId = async name => (await q1(`select id from public.menus where name = '${esc(name)}'`)).id;

  // Alex's 30th — plated dinner, final numbers, frozen, BEO approved.
  const cust = await signIn("alex.thompson@example.com");
  const b30 = await line("alex-30th-birthday", "gourmet-catering-co");
  if (b30) {
    if (!(await q1(`select count(*)::int n from public.catering_selections where build_item_id = '${b30.id}'`)).n) {
      const items = await menuItems("Summer Garden Feast", ["Heritage tomato & burrata", "Wild mushroom Wellington", "Seasonal fruit & sorbet"]);
      await call(cust, "hospitality_save_catering", { p_item: b30.id, p_sel: { menu_id: await menuId("Summer Garden Feast"), guests: 80, items, dietary_counts: { vegetarian: 9, vegan: 3, gluten_free: 4 },
        service_at: "2027-07-26T19:30:00Z", course_timing: [{ course: "starter", serve_at: "2027-07-26T19:30:00Z" }, { course: "main", serve_at: "2027-07-26T20:15:00Z" }, { course: "dessert", serve_at: "2027-07-26T21:15:00Z" }],
        staffing: "7 servers, 2 chefs", notes: "Speeches between main and dessert. One guest with a severe sesame allergy (table 4).", submit: true }, p_expected_version: null, p_accept_change: false });
      out.catering_selections++;
    }
    const cs = await q1(`select final_guest_count from public.catering_selections where build_item_id = '${b30.id}'`);
    if (!cs.final_guest_count) {
      await call(cust, "hospitality_set_final_numbers", { p_item: b30.id, p_guests: 76, p_dietary: { vegetarian: 9, vegan: 3, gluten_free: 4 }, p_expected_version: null });
      out.final_numbers++;
    }
    // Correction (first run picked two mains and counted halal guests no selected dish covers): one dish per course, counts the
    // menu covers. Re-saved through the command (accept_change on the frozen booking); the BEO is re-synced and re-approved below.
    const cur = await q1(`select dietary_counts ? 'halal' bad, version from public.catering_selections where build_item_id = '${b30.id}'`);
    if (cur.bad) {
      const items = await menuItems("Summer Garden Feast", ["Heritage tomato & burrata", "Wild mushroom Wellington", "Seasonal fruit & sorbet"]);
      await call(cust, "hospitality_save_catering", { p_item: b30.id, p_sel: { menu_id: await menuId("Summer Garden Feast"), guests: 76, items, dietary_counts: { vegetarian: 9, vegan: 3, gluten_free: 4 },
        service_at: "2027-07-26T19:30:00Z", course_timing: [{ course: "starter", serve_at: "2027-07-26T19:30:00Z" }, { course: "main", serve_at: "2027-07-26T20:15:00Z" }, { course: "dessert", serve_at: "2027-07-26T21:15:00Z" }],
        staffing: "7 servers, 2 chefs", notes: "Speeches between main and dessert. One guest with a severe sesame allergy (table 4).", submit: true }, p_expected_version: cur.version, p_accept_change: true });
      out.catering_corrected = 1;
      const o = await q1(`select id from public.event_orders where build_item_id = '${b30.id}' order by created_at limit 1`);
      if (o) await call(prov, "event_order_sync_hospitality", { p_item: b30.id, p_send: true, p_note: "Menu corrected: one dish per course" });
    }
    const hb = await q1(`select status, beo_order_id from public.hospitality_bookings where build_item_id = '${b30.id}'`);
    if (hb && hb.status !== "confirmed") { await call(prov, "hospitality_confirm", { p_item: b30.id }); out.confirmed++; }
    let order = await q1(`select o.id, o.status, o.current_version from public.event_orders o where o.build_item_id = '${b30.id}' order by o.created_at limit 1`);
    if (!order) {
      const r = await call(prov, "event_order_sync_hospitality", { p_item: b30.id, p_send: true, p_note: "Menu, final numbers (76) and dietary counts confirmed" });
      order = { id: r.order_id, status: r.status, current_version: r.version }; out.beo_synced++;
    }
    if (order.status !== "approved") { await call(cust, "approve_event_order", { p_order: order.id, p_version: order.current_version }); out.beo_approved++; }
  }

  // Wedding — open bar on the Riverside Bars line (held).
  const bw = await line("alex-taylor-wedding", "riverside-bars");
  if (bw && !(await q1(`select count(*)::int n from public.bar_selections where build_item_id = '${bw.id}'`)).n) {
    await call(cust, "hospitality_save_bar", { p_item: bw.id, p_bar: { bar_package_id: (await q1(`select id from public.bar_packages where name = 'Prosecco & Craft Beer Open Bar'`)).id, mode: "open_bar", guests: 120,
      starts_at: "2027-06-14T17:30:00Z", ends_at: "2027-06-14T21:30:00Z", corkage_bottles: 6, notes: "Prosecco on arrival; six bottles of our own champagne for the toast (corkage).", submit: true }, p_expected_version: null });
    out.bar_selections++;
  }

  // Neon Nights — crew catering on the Gourmet line, schedules, BEO sent for approval.
  const org = await signIn("alex.events@example.com");
  const bn = await line("neon-nights", "gourmet-catering-co");
  const neon = (await q1(`select id from public.events where slug = 'neon-nights'`)).id;
  const crewMenu = await menuId("Crew & Artist Catering");
  if (bn && !(await q1(`select count(*)::int n from public.catering_selections where build_item_id = '${bn.id}'`)).n) {
    const items = await menuItems("Crew & Artist Catering", ["Chicken tikka masala, pilau rice", "Chickpea & spinach curry", "Mixed leaf salad bar"]);
    await call(org, "hospitality_save_catering", { p_item: bn.id, p_sel: { menu_id: crewMenu, guests: 140, items, dietary_counts: { vegan: 22, vegetarian: 18, halal: 30, gluten_free: 9 },
      service_at: "2026-12-12T16:30:00Z", course_timing: [{ course: "main", serve_at: "2026-12-12T16:30:00Z" }], staffing: "2 servers", notes: "Crew meal before doors; artists in the green room.", submit: true },
      p_expected_version: null, p_accept_change: false });
    out.catering_selections++;
  }
  const SCHED = [
    { kind: "green_room", title: "Green room — headline artists", location: "Backstage dressing room 1", starts_at: "2026-12-12T17:00:00Z", ends_at: "2026-12-13T01:30:00Z", headcount: 12,
      dietary_counts: { vegan: 3, gluten_free: 1 }, requirements: ["Rider: still water, fresh fruit, hummus platter", "Kettle and herbal teas", "No nuts in the room"], notes: "Rider attached in Partners." },
    { kind: "crew_catering", title: "Crew meal before doors", location: "Crew canteen (loading bay B)", starts_at: "2026-12-12T16:30:00Z", ends_at: "2026-12-12T17:30:00Z", headcount: 140,
      dietary_counts: { vegan: 22, vegetarian: 18, halal: 30, gluten_free: 9 }, build_item_id: bn?.id ?? null, menu_id: bn ? crewMenu : null, requirements: ["Hot buffet", "Tea and coffee station"] },
    { kind: "staff_meals", title: "Late crew snack (load-out)", location: "Crew canteen (loading bay B)", starts_at: "2026-12-13T01:30:00Z", ends_at: "2026-12-13T02:15:00Z", headcount: 60,
      dietary_counts: { vegan: 8 }, requirements: ["Sandwiches, soup, hot drinks"] },
    { kind: "vip", title: "VIP terrace hospitality", location: "Riverside Terrace", starts_at: "2026-12-12T19:00:00Z", ends_at: "2026-12-12T23:00:00Z", headcount: 80,
      dietary_counts: { vegetarian: 10 }, requirements: ["Canapés on rotation", "Two hosted bar staff"], status: "confirmed" },
  ];
  for (const s of SCHED) {
    if ((await q1(`select count(*)::int n from public.hospitality_schedules where event_id = '${neon}' and title = '${esc(s.title)}'`)).n) continue;
    await call(org, "hospitality_save_schedule", { p_event: neon, p_row: s, p_id: null, p_expected_version: null });
    out.schedules++;
  }
  if (bn && !(await q1(`select count(*)::int n from public.event_orders where build_item_id = '${bn.id}'`)).n) {
    await call(prov, "event_order_sync_hospitality", { p_item: bn.id, p_send: true, p_note: "Crew catering for 140 and the green-room rider" });
    out.beo_synced++;
  }
  return out;
}
