import { expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const USERS = {
  customer: { email: "alex.thompson@example.com", password: process.env.DEMO_CUSTOMER_PASSWORD! },
  organizer: { email: "alex.events@example.com", password: process.env.DEMO_ORGANIZER_PASSWORD! },
  crew: { email: "james.carter@example.com", password: process.env.DEMO_CREW_PASSWORD! },
  provider: { email: "provider.demo@example.com", password: process.env.DEMO_PROVIDER_PASSWORD! },
};
/** Signs in through the real login form. */
export async function login(page: Page, who: keyof typeof USERS, next = "/") {
  const u = USERS[who]; if (!u.password) throw new Error(`Missing password env for ${who}`);
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill('input[name="email"]', u.email);
  await page.fill('input[name="password"]', u.password);
  await Promise.all([page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button[type="submit"]')]);
}
/** Service-role client for test fixtures and assertions only (never used by the app UI). */
export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
/** Signed-in user client (anon key + password) for RLS assertions. */
export async function userClient(who: keyof typeof USERS) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: USERS[who].email, password: USERS[who].password });
  if (error) throw error; return c;
}
export async function toast(page: Page, text: RegExp | string) { await expect(page.locator(".k-toast").last()).toContainText(text); }
export async function fresh(ctx: BrowserContext) { await ctx.clearCookies(); }
export const eventId = async (slug: string) => (await admin().from("events").select("id").eq("slug", slug).single()).data!.id as string;
