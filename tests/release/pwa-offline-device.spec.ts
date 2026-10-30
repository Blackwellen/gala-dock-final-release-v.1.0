import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, signedIn } from "../phase1/helpers";

// Q37 PWA / device / offline (domains 231–234) — API-level. Service-worker caching rules, manifest/installability inputs,
// device permission policy, push registration (bound to user + session, revocable, SSRF-safe), preferences and sender rules.
// Push delivery is BLOCKED_EXTERNAL (no VAPID keys) — asserted as such, never sent.
type U = { id: string; email: string };
const db = admin as unknown as SupabaseClient;
const rpc = async <T>(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}) => (await c.rpc(fn, args)) as { data: T; error: { message: string } | null };
const ep = (n: string) => `https://fcm.googleapis.com/fcm/send/q37-${n}-${Math.random().toString(36).slice(2)}`;
const keys = { p_p256dh: "B".repeat(87), p_auth: "a".repeat(22) };

test.describe.configure({ mode: "serial" });

test.describe("Q37 PWA, device and offline", () => {
  let O: U, X: U; let oc: SupabaseClient, xc: SupabaseClient;
  test.beforeAll(async () => {
    [O, X] = await Promise.all([createUser("q37-owner"), createUser("q37-other")]);
    [oc, xc] = (await Promise.all([signedIn(O.email), signedIn(X.email)])) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => { await db.from("push_subscriptions").delete().in("user_id", [O.id, X.id]); await cleanup(); });

  test("service worker caches only public static assets; never pages, APIs, token pages or cross-origin", async ({ request }) => {
    const sw = await (await request.get(`${BASE}/sw.js`)).text();
    expect(sw).toContain('const STATIC = [/^\\/_next\\/static\\//');
    for (const never of ["^\\/api\\/", "^\\/auth\\/", "pay|portal", "rsvp", "\\/print"]) expect(sw).toContain(never);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/);          // Stripe/Supabase never intercepted
    expect(sw).toMatch(/request\.method !== "GET"\) return/);                        // writes never replayed
    expect(sw).not.toMatch(/cache\.put\(request, response\.clone\(\)\)[^]*request\.mode === "navigate"/);
    expect(sw).toContain('event.tag !== "gd-scan-sync"');
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    // Private responses advertise no-store so even a browser HTTP cache keeps nothing.
    const api = await request.get(`${BASE}/api/analytics/metrics?workspace=00000000-0000-4000-8000-000000000000`);
    expect(api.headers()["cache-control"]).toContain("no-store");
  });

  test("manifest, icons and offline shell are installable inputs", async ({ request }) => {
    const m = await (await request.get(`${BASE}/gala-dock.webmanifest`)).json() as { display: string; start_url: string; scope: string; icons: { src: string; sizes: string; purpose?: string }[]; theme_color: string };
    expect(m).toMatchObject({ display: "standalone", scope: "/" });
    expect(m.icons.some(i => i.sizes === "512x512")).toBe(true);
    expect(m.icons.some(i => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect((await request.get(`${BASE}${i.src}`)).status(), i.src).toBe(200);
    const offline = await request.get(`${BASE}/offline.html`);
    expect(offline.status()).toBe(200);
    const html = await offline.text();
    expect(html).toContain("viewport-fit=cover");                                    // safe areas
    expect(html).toContain("env(safe-area-inset-left)");
    expect(html).not.toMatch(/supabase|token|[\w.-]+@[\w-]+\.[a-z]{2,}/i);   // no backend URLs, tokens or e-mail addresses
    const home = await request.get(`${BASE}/`);
    expect(home.headers()["permissions-policy"]).toContain("camera=(self)");        // scanner camera only first-party
    expect(home.headers()["permissions-policy"]).toContain("microphone=()");
    expect(home.headers()["permissions-policy"]).toContain("geolocation=(self)");
  });

  test("push config is BLOCKED_EXTERNAL without VAPID keys; subscribe needs a session", async ({ request }) => {
    const cfg = await request.get(`${BASE}/api/push/config`);
    if (!process.env.WEB_PUSH_VAPID_PUBLIC_KEY) expect(cfg.status()).toBe(503);
    expect((await request.post(`${BASE}/api/push/subscribe`, { data: { endpoint: ep("anon"), p256dh: keys.p_p256dh, auth: keys.p_auth } })).status()).toBe(401);
  });

  test("push registration: allow-listed services, session-bound, owner-only, revocable", async () => {
    expect((await rpc(oc, "push_register", { p_endpoint: "https://169.254.169.254/latest", ...keys })).error?.message).toContain("push_endpoint_not_allowed");
    expect((await rpc(oc, "push_register", { p_endpoint: "https://fcm.googleapis.com.evil.example/x", ...keys })).error?.message).toContain("push_endpoint_not_allowed");
    const e1 = ep("a");
    const id = (await rpc<string>(oc, "push_register", { p_endpoint: e1, ...keys, p_platform: "android", p_label: "Phone" })).data;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const row = (await db.from("push_subscriptions").select("user_id,session_id,revoked_at").eq("id", id).single()).data!;
    expect(row.user_id).toBe(O.id);
    expect(row.session_id).toBeTruthy();                                             // bound to the signed-in session
    expect((await oc.from("push_subscriptions").select("id,label")).data).toHaveLength(1);
    expect((await oc.from("push_subscriptions").select("endpoint")).error?.message).toMatch(/permission denied/);
    expect((await xc.from("push_subscriptions").select("id")).data).toHaveLength(0);
    expect((await rpc<boolean>(xc, "push_unregister", { p_subscription: id })).data).toBe(false);   // not theirs
    // Same endpoint registered by another account moves to that account (shared browser) — never duplicated.
    await rpc(xc, "push_register", { p_endpoint: e1, ...keys });
    expect((await db.from("push_subscriptions").select("user_id").eq("id", id).single()).data!.user_id).toBe(X.id);
    expect((await rpc<boolean>(xc, "push_unregister", { p_subscription: id })).data).toBe(true);
    expect((await db.from("push_subscriptions").select("revoked_at").eq("id", id).single()).data!.revoked_at).toBeTruthy();
    expect((await rpc(oc, "push_enqueue", { p_user: O.id, p_category: "x", p_title: "t", p_body: "", p_url: "/" })).error?.message).toMatch(/permission denied/);
  });

  test("sender rules: preferences, critical bypass, dedupe, dead devices, payload limits", async () => {
    const id = (await rpc<string>(oc, "push_register", { p_endpoint: ep("b"), ...keys })).data;
    await rpc(oc, "push_set_preference", { p_category: "messages", p_enabled: false });
    const q = (cat: string, critical = false, dedupe: string | null = null) => rpc<number>(db, "push_enqueue", { p_user: O.id, p_category: cat, p_title: "Gala Dock", p_body: "Open the app to read it", p_url: "/inbox", p_critical: critical, p_dedupe: dedupe });
    expect((await q("messages")).data).toBe(0);
    expect((await q("messages", true, `q37-${id}`)).data).toBe(1);
    expect((await q("messages", true, `q37-${id}`)).data).toBe(0);                   // dedupe
    expect((await q("quotes", false, `q37q-${id}`)).data).toBe(1);
    expect((await db.from("push_outbox").insert({ user_id: O.id, subscription_id: id, category: "x_y", title: "t", url: "https://evil.example" })).error?.message).toContain("push_outbox_url_check");
    expect((await db.from("push_outbox").insert({ user_id: O.id, subscription_id: id, category: "x_y", title: "t".repeat(61), url: "/" })).error).not.toBeNull();
    // 410 from the push service revokes the device; nothing more is queued for it.
    const row = (await db.from("push_outbox").select("id").eq("subscription_id", id).eq("category", "quotes").single()).data!;
    await rpc(db, "push_mark", { p_id: row.id, p_status: "failed", p_http: 410, p_error: "gone" });
    expect((await db.from("push_subscriptions").select("revoke_reason").eq("id", id).single()).data!.revoke_reason).toBe("expired");
    expect((await q("quotes", true, `q37q2-${id}`)).data).toBe(0);
    await db.from("push_outbox").delete().eq("user_id", O.id);
    await rpc(oc, "push_set_preference", { p_category: "messages", p_enabled: true });
  });
});
