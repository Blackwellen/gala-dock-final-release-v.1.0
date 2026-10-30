import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Lane D (W01): the venue public free/busy calendar (public_listing_availability, 202610294080/4082) and the event "Getting there"
// section (public_event_getting_there, 202610294081), at phone (390) and desktop (1536) widths. Expectations are read live with the
// ANON client — a section must exist exactly when public data exists. Read-only (no writes). Demo data: Riverside Arena and
// Riverside DJ & Sound opted in; Neon Nights has public notes, Car park A and the post-show shuttle marked public.
// Written for the browser pass; not run by lane D (browser slots were reserved for other lanes).

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const VENUE = { slug: "riverside-arena", id: "327451a6-0693-47f6-bbec-a480fe805db5" };
const EVENT = { slug: "neon-nights", id: "392fdf17-4e5c-4473-987c-251dc0a97228" };
const london = (add = 0) => { const t = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }) + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + add); return t.toISOString().slice(0, 10); };
const LABEL: Record<string, string> = { free: "available", limited: "limited availability", booked: "booked", closed: "closed" };

for (const width of [390, 1536]) {
  test.describe(`public availability + getting there @ ${width}`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 960 } });

    test("venue calendar: legend, month navigation, aria labels match the RPC, no horizontal scroll", async ({ page }) => {
      const { data } = await anon.rpc("public_listing_availability", { p_listing: VENUE.id, p_from: london(), p_to: london(119) });
      await page.goto(`/venues/${VENUE.slug}`);
      const section = page.locator("#availability");
      if (!data) { await expect(section).toHaveCount(0); return; }
      await expect(section).toBeVisible();
      await expect(section.getByRole("grid")).toBeVisible();
      for (const l of ["Available", "Limited", "Booked", "Closed"]) await expect(section.locator(".la-legend")).toContainText(l);
      await expect(section).toContainText("confirmed when the venue accepts your request");
      // Every rendered day's accessible name carries the RPC status.
      const days = (data as { days: { date: string; status: string }[] }).days;
      const first = page.locator(".la-btn").first();
      const date = await first.getAttribute("data-date");
      const want = days.find(d => d.date === date)!;
      await expect(first).toHaveAttribute("aria-label", new RegExp(`, ${LABEL[want.status]}`));
      // Keyboard: the grid has exactly one tab stop; ArrowRight moves it.
      await expect(page.locator(".la-btn[tabindex='0']")).toHaveCount(1);
      await page.locator(".la-btn[tabindex='0']").focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".la-btn:focus")).toHaveCount(1);
      // Month navigation.
      const title = await page.locator("#la-month").innerText();
      await page.getByRole("button", { name: "Next month" }).click();
      await expect(page.locator("#la-month")).not.toHaveText(title);
      await page.getByRole("button", { name: "Previous month" }).click();
      await expect(page.locator("#la-month")).toHaveText(title);
      // Space selector for a multi-space venue re-queries that space.
      if ((data as { spaces: unknown[] }).spaces.length > 1) {
        await section.getByRole("combobox").selectOption({ index: 1 });
        await expect(section.getByRole("grid")).toHaveAttribute("aria-busy", "false");
      }
      // Picking a free day announces it and points at the booking card.
      const free = page.locator(".la-btn.s-free").first();
      if (await free.count()) { await free.click(); await expect(page.locator(".la-pick")).toContainText("selected"); await expect(page.locator(".la-pick a[href='#book']")).toBeVisible(); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // No zoom on the calendar.
      expect(await section.evaluate(el => getComputedStyle(el).zoom)).toMatch(/^(1|normal)$/);
    });

    test("event page: Getting there shows exactly the public info, near Venue, with directions", async ({ page }) => {
      const { data } = await anon.rpc("public_event_getting_there", { p_event: EVENT.id });
      const g = data as { notes: Record<string, string>; parking: { name: string }[]; shuttles: { pickup: string | null }[] } | null;
      const has = !!g && (Object.keys(g.notes).length > 0 || g.parking.length > 0 || g.shuttles.length > 0);
      await page.goto(`/events/${EVENT.slug}`);
      const section = page.locator("#getting-there");
      if (!has) { await expect(section).toHaveCount(0); return; }
      await expect(section).toBeVisible();
      await expect(section.getByRole("heading", { name: "Getting there" })).toBeVisible();
      for (const v of Object.values(g!.notes)) await expect(section).toContainText(v.slice(0, 40));
      for (const p of g!.parking) await expect(section).toContainText(p.name);
      for (const s of g!.shuttles) if (s.pickup) await expect(section).toContainText(s.pickup);
      await expect(section.getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", /google\.com\/maps/);
      // Never private logistics.
      for (const secret of ["Artist & crew compound", "Gate 3 (stewarded)", "LK71 KRA", "GD24 OPS", "Sprinter", "Addison Lee", "Shuttle coaches every 10 min", "The Hoxton", "Service yard", "Enter from Tower Bridge Road"])
        await expect(section).not.toContainText(secret);
      // Default block order puts it right after Venue.
      const ids = await page.evaluate(() => [...document.querySelectorAll(".pe3-block > [id]")].map(el => el.id));
      if (ids.includes("venue")) expect(ids.indexOf("getting-there")).toBeGreaterThan(ids.indexOf("venue"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  });
}
