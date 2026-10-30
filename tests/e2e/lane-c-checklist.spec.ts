import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, insertEventFixture, login } from "../phase1/helpers";

// Lane C browser checklist (owner decisions 2026-10-29): merch store link, sponsor logos, click-to-load privacy video, Riverside bar
// packages, no invented gate / doors on ticket pages. Disposable organiser + customer (E2E_AUTH_FIXTURE=otp), one disposable public
// event; everything is removed in afterAll. Logo files come from LOGO_DIR (PNG, JPG, SVG).

const db = admin as unknown as SupabaseClient;
const LOGOS = process.env.LOGO_DIR ?? "artifacts/testing/logos";
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
let O: { id: string; email: string }, C: { id: string; email: string }, W = "", ev = "", slug = "", tier = "", party = "", ticket = "";

test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_AUTH_FIXTURE !== "otp", "needs the OTP auth fixture");

test.beforeAll(async () => {
  [O, C] = await Promise.all([createUser("lcx-org", "Lane C Organiser"), createUser("lcx-cust", "Lane C Customer")]);
  W = await seedWorkspace(O.id, "organizer", "LCX Checklist Events");
  slug = `lcx-check-${randomBytes(3).toString("hex")}`;
  const r = await insertEventFixture({ workspace_id: W, owner_id: O.id, management: "professional", name: "LCX Checklist Night", slug, visibility: "public", status: "on_sale", event_type: "concert",
    description: "Disposable lane C checklist event.", starts_at: iso(30), ends_at: iso(30.2), city: "London", venue_name: "Checklist Hall" }, "lane C checklist").select("id").single();
  expect(r.error).toBeNull(); ev = (r.data as { id: string }).id;
  const t = await db.from("ticket_tiers").insert({ event_id: ev, name: "General admission", price: 0, quantity: 100, status: "on_sale" }).select("id").single();
  expect(t.error).toBeNull(); tier = (t.data as { id: string }).id;
  const p = await db.from("event_parties").insert({ event_id: ev, workspace_id: W, kind: "sponsor", name: "LCX Sponsor", status: "confirmed" }).select("id").single();
  expect(p.error).toBeNull(); party = (p.data as { id: string }).id;
  const k = await db.from("tickets").insert({ event_id: ev, tier_id: tier, holder_id: C.id, code: `LCX-${randomBytes(4).toString("hex").toUpperCase()}`, order_ref: `LCX${randomBytes(3).toString("hex").toUpperCase()}`, status: "valid", attendee_name: "Lane C Customer" }).select("id").single();
  expect(k.error, JSON.stringify(k.error)).toBeNull(); ticket = (k.data as { id: string }).id;
});
test.afterAll(async () => {
  if (ev) {
    for (const tb of ["check_ins", "tickets", "event_parties", "ticket_tiers"]) await db.from(tb).delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev);
  }
  if (W) await db.from("workspaces").delete().eq("id", W);
  await cleanup();
});

const settings = async () => ((await db.from("events").select("settings").eq("id", ev).single()).data as { settings: Record<string, unknown> }).settings;
const toast = (page: Page) => page.locator("[role=status], [role=alert], .k-toast").last();

test("merch store link: http and bad links refused, https saved, Shop merch opens safely", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, O.email, `/organizer/events/${ev}?tab=operations&section=merch`);
  await page.getByRole("tab", { name: "Merch items" }).or(page.getByRole("button", { name: "Merch items" })).first().click({ timeout: 30_000 });
  const input = page.getByLabel("Merch store link (https)");
  await input.waitFor({ timeout: 30_000 }).catch(async () => { console.log("URL", page.url(), (await page.locator("main, body").first().innerText()).slice(0, 800)); });
  await expect(input).toBeVisible();
  for (const bad of ["http://shop.example.com/lcx", "https://localhost/lcx"]) {
    await input.fill(bad); await page.getByRole("button", { name: "Save link" }).click();
    await expect(page.getByText(/https:\/\/|public https/).last()).toBeVisible();
    expect((await settings()).merch_url).toBeUndefined();
  }
  await input.fill("https://example.com/lcx-merch"); await page.getByRole("button", { name: "Save link" }).click();
  await expect.poll(async () => (await settings()).merch_url).toBe("https://example.com/lcx-merch");
  for (const width of [390, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/events/${slug}`);
    const a = page.getByRole("link", { name: /Shop merch/ });
    await expect(a).toBeVisible();
    expect(await a.getAttribute("href")).toBe("https://example.com/lcx-merch");
    expect(await a.getAttribute("target")).toBe("_blank");
    expect(await a.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    await expect(page.getByText("can’t be ordered online")).toHaveCount(0);
  }
});

test("sponsor logo: SVG refused, PNG and JPG accepted, replace, remove, one box size", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, O.email, `/organizer/events/${ev}?tab=plan&section=partners`);
  const row = page.locator(`#party-${party}`);
  await row.locator("summary").click();
  const file = row.locator("input[type=file]");
  await file.setInputFiles(path.resolve(LOGOS, "logo.svg"));
  await expect(page.getByText("Upload a PNG, JPG or WebP image.").last()).toBeVisible();
  const logo = async () => ((await db.from("event_parties").select("logo_url").eq("id", party).single()).data as { logo_url: string | null }).logo_url;
  expect(await logo()).toBeNull();
  await file.setInputFiles(path.resolve(LOGOS, "logo.png"));
  await expect.poll(logo, { timeout: 30_000 }).toMatch(/\/event-media\/.+\.png$/);
  const first = await logo();
  await row.locator("summary").isVisible();
  await file.setInputFiles(path.resolve(LOGOS, "logo.jpg"));
  await expect.poll(logo, { timeout: 30_000 }).toMatch(/\.(jpe?g)$/);
  expect(await logo()).not.toBe(first);
  for (const width of [390, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/events/${slug}`);
    const box = page.locator("#sponsors .px-sp-logo").first();
    await expect(box).toBeVisible();
    const bb = (await box.boundingBox())!;
    expect(Math.round(bb.width)).toBe(88); expect(Math.round(bb.height)).toBe(48);
    expect(await box.locator("img").evaluate(i => getComputedStyle(i).objectFit)).toBe("contain");
    await expect(box.locator("img")).toHaveAttribute("alt", "LCX Sponsor logo");
  }
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto(`/organizer/events/${ev}?tab=plan&section=partners`);
  await page.locator(`#party-${party} summary`).click();
  await page.locator(`#party-${party}`).getByRole("button", { name: "Remove" }).first().click();
  await expect.poll(logo).toBeNull();
  await page.goto(`/events/${slug}`);
  await expect(page.locator("#sponsors .px-sp-logo")).toHaveCount(0);
  await expect(page.locator("#sponsors .px-sp-av")).toHaveCount(1);
});

test("video: click-to-load privacy embeds, no third-party request before the click, no CSP violations", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await login(page, O.email, `/organizer/events/${ev}/page`);
  const vin = page.getByPlaceholder("https://youtu.be/...");
  await expect(vin).toBeVisible({ timeout: 30_000 });
  await vin.fill("https://youtube.com/watch?v=evil"); await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Use a YouTube or Vimeo video link/).last()).toBeVisible();
  await vin.fill("https://youtu.be/dQw4w9WgXcQ"); await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(async () => (await settings()).hero_video).toBe("https://youtu.be/dQw4w9WgXcQ");

  for (const width of [390, 1536]) {
    // Leave the previous iteration's player completely before listening (its stream requests would otherwise be counted).
    await page.goto("about:blank"); await page.waitForTimeout(1000);
    await page.setViewportSize({ width, height: 900 });
    const third: string[] = [], csp: string[] = [];
    page.on("request", r => { const u = r.url(); if (/youtube|ytimg|vimeo|googlevideo/i.test(u)) third.push(u); if (u.includes("/api/csp-report")) csp.push(u); });
    page.on("console", m => { if (/Content.Security.Policy/i.test(m.text())) csp.push(m.text()); });
    await page.goto(`/events/${slug}`);
    await page.waitForLoadState("load"); await page.waitForTimeout(2500);
    expect(third, "no YouTube/Vimeo request before the click").toEqual([]);
    await page.getByTestId("hero-ctas").getByRole("link", { name: "Watch video" }).click();
    await expect(page).toHaveURL(/#video$/);
    await page.getByRole("button", { name: /Play video/ }).click();
    const frame = page.locator("#video iframe");
    await expect(frame).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    await expect(frame).toHaveAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    await page.waitForTimeout(1500);
    expect(csp.filter(x => !/report-only.*(chrome-extension|inline)/i.test(x)), "no CSP violations").toEqual([]);
    page.removeAllListeners("request"); page.removeAllListeners("console");
  }
  await db.from("events").update({ settings: { ...(await settings()), hero_video: "https://vimeo.com/76979871" } }).eq("id", ev);
  await page.goto("about:blank"); await page.goto(`/events/${slug}`);
  await page.getByRole("button", { name: /Play video/ }).click();
  await expect(page.locator("#video iframe")).toHaveAttribute("src", /^https:\/\/player\.vimeo\.com\/video\/76979871\?dnt=1/);
});

test("ticket pages show no invented gate or doors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, C.email, `/account/tickets/${ticket}`);
  await expect(page.getByRole("heading", { name: "LCX Checklist Night" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Main Gate A")).toHaveCount(0);
  await expect(page.getByText("Entry gate")).toHaveCount(0);
  await expect(page.getByText(/Gates open at|Doors \d/)).toHaveCount(0);
  await page.goto("/account/tickets");
  await expect(page.getByText("Main Gate A")).toHaveCount(0);
  // With a real gate set, it shows.
  await db.from("events").update({ settings: { ...(await settings()), entry_gate: "North Gate" } }).eq("id", ev);
  await page.goto(`/account/tickets/${ticket}`);
  await expect(page.getByText("North Gate").first()).toBeVisible();
});

test("Riverside Arena shows bar packages and the Bar tab", async ({ page }) => {
  for (const width of [390, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/venues/riverside-arena");
    await expect(page.locator("section#bars")).toBeVisible();
    await expect(page.locator(".pe3-tabs a[href='#bars']")).toHaveCount(1);
    await expect(page.locator("section#bars").getByText("Arena Hosted Bar")).toBeVisible();
    await expect(page.getByText("PL-SE1-0412")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
