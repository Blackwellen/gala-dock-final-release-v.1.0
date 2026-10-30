import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// W01 Part 2 (lane C): venue / service public pages show what providers publish — floor plan (published venue_structures),
// menus (published, attached to the listing; venues also show their own provider's catering menus), public galleries and
// banners — and never private provider fields. Expectations are read live with the ANON client (the same rules the page uses),
// so a section must be present exactly when public data exists. Runs at phone (390) and desktop (1536) widths.

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const PAGES = [
  { path: "/venues/riverside-arena", slug: "riverside-arena", kind: "venue" },
  { path: "/services/elite-sounds-dj", slug: "elite-sounds-dj", kind: "service" },
  { path: "/services/gala-bites-catering", slug: "gala-bites-catering", kind: "service" }, // catering service with a published menu
] as const;
// Strings providers enter as private (contact details, compliance references, internal pricing rules) — never on the page.
const PRIVATE = ["events@riversidearena.co.uk", "+44 7700 900123", "PL-SE1-2291", "multiplier", "Standby fee"];

async function expected(slug: string, kind: string) {
  const { data: l } = await anon.from("listings").select("id,workspace_id,category").eq("slug", slug).eq("published", true).single();
  const id = (l as { id: string }).id, ws = (l as { workspace_id: string }).workspace_id;
  const { data: st } = kind === "venue" ? await anon.from("venue_structures").select("elements").eq("venue_id", id).eq("status", "published").limit(1).maybeSingle() : { data: null };
  const plan = ((st as { elements?: { type: string; hidden?: boolean }[] } | null)?.elements ?? []).some(e => !e.hidden && e.type !== "layer" && e.type !== "basemap");
  const { data: sib } = kind === "venue" ? await anon.from("listings").select("id,category").eq("workspace_id", ws).eq("kind", "service").eq("published", true) : { data: [] };
  const catering = kind === "venue" || /cater|food|drink|bar/i.test((l as { category: string }).category);
  const ids = [id, ...((sib ?? []) as { id: string; category: string }[]).filter(x => /cater|food|drink|bar/i.test(x.category)).map(x => x.id)];
  const { data: menus, error } = catering ? await anon.from("menus").select("name").eq("status", "published").in("listing_id", ids) : { data: [], error: null };
  expect(error, "anon can read published menus (202610294061)").toBeNull();
  const { data: gals } = await anon.from("media_galleries").select("id").eq("visibility", "public").eq("status", "published").eq("listing_id", id);
  const { data: ban } = await anon.from("media_assets").select("url").eq("listing_id", id).eq("usage_scope", "public").in("status", ["approved", "published"]).or("kind.eq.banner,format.in.(banner,wide)").limit(1);
  return { plan, menus: ((menus ?? []) as { name: string }[]).map(m => m.name), galleries: (gals ?? []).length > 0, banner: (ban ?? []).length > 0 };
}

for (const width of [390, 1536]) {
  test.describe(`public listing features @${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 960 } });
    for (const p of PAGES) {
      test(`${p.path} shows what the provider published`, async ({ page }) => {
        const want = await expected(p.slug, p.kind);
        await page.goto(p.path);
        await expect(page.locator("h1#pl-title")).toBeVisible();

        const plan = page.locator("section#floorplan");
        if (want.plan) {
          await expect(plan).toBeVisible();
          await expect(plan.locator("svg.vm")).toBeVisible();
          await expect(plan.getByRole("toolbar", { name: "Map zoom" })).toBeVisible();
          await expect(plan.getByRole("heading", { name: "Areas on this map" })).toBeVisible();
          await expect(page.locator("nav.pl3-tabs a[href='#floorplan']")).toHaveCount(1);
        } else await expect(plan).toHaveCount(0);

        const menus = page.locator("section#menus");
        if (want.menus.length) { await expect(menus).toBeVisible(); for (const m of want.menus) await expect(menus.getByText(m, { exact: true }).first()).toBeVisible(); }
        else await expect(menus).toHaveCount(0);

        await expect(page.locator("section#galleries")).toHaveCount(want.galleries ? 1 : 0);
        await expect(page.locator("figure.plx-banner")).toHaveCount(want.banner ? 1 : 0);

        // Space cards expand to layouts / size / photos (no client JS: <details>).
        if (p.kind === "venue") {
          const more = page.locator("#spaces details.plx-more").first();
          await more.locator("summary").click();
          await expect(more.locator(".plx-layouts li").first()).toBeVisible();
          await expect(page.locator("section#details")).toBeVisible(); // Good to know: accessibility, food & drink, practical, terms
        }

        const html = await page.content();
        for (const s of PRIVATE) expect(html, `private value on ${p.path}`).not.toContain(s);
        // No filler copy for missing data, and no horizontal scroll at phone width.
        await expect(page.getByText("Ask the venue")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      });
    }
  });
}
