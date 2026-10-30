import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { blockOrder, blockVisible, type Block } from "../../src/lib/page-blocks";
import { CLOSED_LABEL } from "../../src/lib/public/ticket-cta";

// W01 Part 1 (lane C): the public event page shows what the organiser built — the event map (public_event_plan), the page
// editor's block order / visibility / CTA labels, published banners (Media Studio banner exports + published promo pages) and
// the public_event_extras sections. Expectations are read live with the ANON client (the rules the page uses), so a section
// must be present exactly when public data exists. Runs at phone (390) and desktop (1536) widths.
// One serial test temporarily saves a custom block order on Comedy Central Live with the service role and restores it.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const EVENTS = [
  { slug: "neon-nights", id: "392fdf17-4e5c-4473-987c-251dc0a97228" },
  { slug: "comedy-central-live", id: "b52e0eae-5de4-46f7-8ba2-2e8861aa8555" },
] as const;
const DEFAULT_PRIMARY = "Buy tickets";
const STATE_LABELS = [...Object.values(CLOSED_LABEL), "Join the waitlist", "Join the waiting list", "Tickets on sale soon", "Not on sale"];
// Section element ids each block renders (first match counts for ordering).
const BLOCK_ID: Partial<Record<Block, string>> = { about: "about", tickets: "tickets", performers: "lineup", programme: "schedule", venue: "venue", map: "event-map", organiser: "info", accessibility: "info", sponsors: "sponsors", gallery: "photos", faqs: "faqs", related: "related" };

async function expected(id: string) {
  const { data: e } = await anon.from("events").select("settings").eq("id", id).single();
  const settings = ((e as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  const { data: plan } = await anon.rpc("public_event_plan", { p_event: id });
  const p = (plan ?? { base: [], overlay: [] }) as { base: { type: string; hidden?: boolean }[]; overlay: { type: string; hidden?: boolean }[] };
  const hasMap = [...(p.base ?? []), ...(p.overlay ?? [])].some(x => !x.hidden && x.type !== "layer" && x.type !== "basemap");
  const { data: ban } = await anon.from("media_assets").select("url").eq("event_id", id).eq("usage_scope", "public").in("status", ["approved", "published"]).or("kind.eq.banner,format.in.(banner,wide)");
  const { data: promos } = await anon.from("promo_landing_pages").select("slug,hero:media_assets!promo_landing_pages_hero_asset_id_fkey(usage_scope,status)").contains("event_ids", [id]).eq("status", "published");
  const promoBanners = ((promos ?? []) as unknown as { hero: { usage_scope: string; status: string } | null }[]).filter(x => x.hero?.usage_scope === "public" && ["approved", "published"].includes(x.hero.status)).length;
  const { data: extras } = await anon.rpc("public_event_extras", { p_event: id });
  const x = extras as { partners: unknown[]; accessibility: unknown } | null;
  return { settings, hasMap, banners: Math.min(2, (ban ?? []).length + promoBanners), partners: x?.partners.length ?? 0, access: !!x?.accessibility };
}

async function sectionOrder(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll(".pe3 [id]")].map(el => el.id));
}

for (const width of [390, 1536]) {
  test.describe(`public event features @${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 960 } });
    for (const ev of EVENTS) {
      test(`/events/${ev.slug} shows what the organiser built`, async ({ page }) => {
        const want = await expected(ev.id);
        await page.goto(`/events/${ev.slug}`);
        await expect(page.locator("h1#pe-title")).toBeVisible();

        // Event map: present exactly when a published layout / venue structure has content.
        const map = page.locator("section#event-map");
        if (want.hasMap && blockVisible(want.settings, "map")) {
          await expect(map).toBeVisible();
          await expect(map.locator("svg.vm")).toBeVisible();
          await expect(map.getByRole("heading", { name: "Areas on this map" })).toBeVisible();
          await expect(map.getByRole("toolbar", { name: "Map zoom" })).toBeVisible();
          await map.getByRole("button", { name: "Zoom in" }).click();
          await expect(map.getByRole("button", { name: "Fit map to width" })).toBeEnabled();
          await expect(page.locator(".pe3-tabs a[href='#event-map']")).toBeVisible();
        } else await expect(map).toHaveCount(0);

        // Hero CTAs: the organiser's labels when actionable, otherwise the same state the ticket card shows.
        const cta = (want.settings.cta ?? {}) as { primary?: string; secondary?: string };
        const ctas = page.getByTestId("hero-ctas");
        await expect(ctas).toBeVisible();
        const first = (await ctas.locator(".k-btn").first().innerText()).trim();
        expect([cta.primary?.trim() || DEFAULT_PRIMARY, ...STATE_LABELS]).toContain(first);
        if (cta.secondary?.trim() && (await page.locator("#lineup, #schedule").count())) await expect(ctas.getByRole("link", { name: cta.secondary.trim() })).toBeVisible();

        // Banners (published + public only).
        await expect(page.locator(".px-banner")).toHaveCount(want.banners);
        if (want.banners) await expect(page.locator(".px-banner img").first()).toBeVisible();

        // Sponsors and accessibility facts from public_event_extras.
        if (want.partners && blockVisible(want.settings, "sponsors")) await expect(page.locator("section#sponsors")).toBeVisible();
        else await expect(page.locator("section#sponsors")).toHaveCount(0);
        if (want.access && blockVisible(want.settings, "accessibility")) await expect(page.locator("#accessibility .px-facts")).toBeVisible();

        // Block order and visibility follow the settings.
        const ids = await sectionOrder(page);
        const expectedIds = blockOrder(want.settings).filter(b => b !== "hero" && blockVisible(want.settings, b)).map(b => BLOCK_ID[b]).filter((v): v is string => !!v && ids.includes(v));
        const seen = [...new Set(ids.filter(i => expectedIds.includes(i)))];
        expect(seen).toEqual([...new Set(expectedIds)]);
        for (const b of ["faqs", "related", "sponsors", "map"] as Block[]) if (!blockVisible(want.settings, b)) await expect(page.locator(`#${BLOCK_ID[b]}`)).toHaveCount(0);

        // Phone-first: no horizontal page scroll.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe.serial("saved page-editor settings are honoured", () => {
  const ev = EVENTS[1];
  let original: Record<string, unknown> | null = null;
  test.beforeAll(async () => {
    const { data } = await admin.from("events").select("settings").eq("id", ev.id).single();
    original = ((data as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
    const order: Block[] = ["hero", "map", "about", "tickets", "faqs", "venue", "programme", "performers", "organiser", "accessibility", "sponsors", "gallery", "related"];
    const visible = Object.fromEntries(order.map(b => [b, b !== "sponsors" && b !== "related"]));
    const { error } = await admin.from("events").update({ settings: { ...original, page_blocks: { order, visible }, cta: { primary: "Grab a seat", secondary: "See the programme" }, hero_overlay: "light" } }).eq("id", ev.id);
    expect(error).toBeNull();
  });
  test.afterAll(async () => { if (original) await admin.from("events").update({ settings: original }).eq("id", ev.id); });

  for (const width of [390, 1536]) test(`custom order, hidden blocks, CTA labels and overlay @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto(`/events/${ev.slug}`);
    const ids = await sectionOrder(page);
    const pos = (i: string) => ids.indexOf(i);
    if (pos("event-map") >= 0) expect(pos("event-map")).toBeLessThan(pos("about"));
    expect(pos("venue")).toBeGreaterThan(pos("about"));
    expect(pos("schedule") < 0 || pos("schedule") > pos("venue")).toBeTruthy();
    await expect(page.locator("#sponsors")).toHaveCount(0);
    await expect(page.locator("#related")).toHaveCount(0);
    await expect(page.locator(".pe3-hero.ov-light")).toBeVisible();
    const ctas = page.getByTestId("hero-ctas");
    expect(["Grab a seat", ...STATE_LABELS]).toContain((await ctas.locator(".k-btn").first().innerText()).trim());
    if (await page.locator("#schedule").count()) await expect(ctas.getByRole("link", { name: "See the programme" })).toBeVisible();
  });
});
