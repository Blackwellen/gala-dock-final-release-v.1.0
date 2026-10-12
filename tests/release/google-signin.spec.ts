import { test, expect } from "@playwright/test";
import { BASE } from "../phase1/helpers";

// Gala Dock's own Google sign-in (src/app/api/auth/google): origin check, and the callback refuses anything without a matching state.
test.describe("google sign-in routes", () => {
  test("start refuses cross-site requests; callback rejects missing or forged state", async ({ request }) => {
    expect((await request.post(`${BASE}/api/auth/google/start`, { headers: { Origin: "https://evil.example" }, data: {} })).status()).toBe(403);
    const start = await request.post(`${BASE}/api/auth/google/start`, { headers: { Origin: BASE }, data: { next: "/organizer" } });
    if (start.status() === 200) {
      const { url } = await start.json() as { url: string };
      const u = new URL(url);
      expect(u.host).toBe("accounts.google.com");
      expect(u.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/google/callback`);
      expect(u.searchParams.get("code_challenge_method")).toBe("S256");
      expect(u.searchParams.get("nonce")).toMatch(/^[0-9a-f]{64}$/);
      // A forged state is refused even with the cookie present.
      const cb = await request.get(`${BASE}/api/auth/google/callback?code=x&state=forged`, { maxRedirects: 0 });
      expect(cb.headers().location).toMatch(/\/login\?error=oauth_failed&next=%2Forganizer/);
    } else expect(start.status()).toBe(503);           // not configured in this environment
    const noCookie = await request.get(`${BASE}/api/auth/google/callback?code=x&state=y`, { maxRedirects: 0, headers: { Cookie: "" } });
    expect(noCookie.headers().location ?? "").toMatch(/\/login\?error=(link_expired|oauth_failed)/);
  });
});
