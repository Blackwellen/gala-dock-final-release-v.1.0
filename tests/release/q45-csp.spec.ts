import { test, expect } from "@playwright/test";
import { buildCsp, cspMode, cspHeaderName, makeNonce, PERMISSIONS_POLICY } from "../../src/lib/security/csp";
import { BASE } from "../phase1/helpers";

// Q45 H-01 / H-02 (no browser): the nonce CSP and Permissions-Policy built by src/lib/security/csp.ts and applied by src/proxy.ts.
const directives = (csp: string) => Object.fromEntries(csp.split(";").map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k!, v]));

test.describe("Q45 CSP and Permissions-Policy", () => {
  test("mode switch: Report-Only by default, enforced only with CSP_ENFORCE=1", () => {
    expect(cspMode({})).toBe("report-only");
    expect(cspMode({ CSP_REPORT_ONLY: "1" })).toBe("report-only");
    expect(cspMode({ CSP_REPORT_ONLY: "0" })).toBe("off");
    expect(cspMode({ CSP_ENFORCE: "1" })).toBe("enforce");
    expect(cspMode({ CSP_ENFORCE: "1", CSP_REPORT_ONLY: "0" })).toBe("enforce");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });

  test("nonce is fresh, 128-bit, base64", () => {
    const n = new Set(Array.from({ length: 200 }, makeNonce));
    expect(n.size).toBe(200);
    for (const x of n) expect(x).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  test("policy shape", () => {
    const nonce = makeNonce();
    for (const dev of [true, false]) {
      const ro = directives(buildCsp({ nonce, mode: "report-only", dev }));
      expect(ro["default-src"]).toEqual(["'self'"]);
      expect(ro["script-src"]).toEqual(expect.arrayContaining(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://js.stripe.com", "https://challenges.cloudflare.com"]));
      expect(ro["script-src"]).not.toContain("'unsafe-inline'");
      expect(ro["script-src"]!.includes("'unsafe-eval'")).toBe(dev);
      expect(ro["style-src"]).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'"]));
      expect(ro["style-src"]!.some(s => s.startsWith("'nonce-"))).toBe(false); // a nonce would disable 'unsafe-inline' for style attributes
      expect(ro["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https://*.supabase.co", "https://*.r2.cloudflarestorage.com", "https://api.maptiler.com"]));
      expect(ro["img-src"]).not.toContain("https:");
      expect(ro["connect-src"]).toEqual(expect.arrayContaining(["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://api.stripe.com", "https://api.maptiler.com"]));
      expect(ro["frame-src"]).toEqual(expect.arrayContaining(["https://js.stripe.com", "https://hooks.stripe.com"]));
      // Video embeds: privacy-mode hosts only, in both modes; never the tracking hosts or a wildcard.
      for (const m of ["report-only", "enforce"] as const) {
        const fs = directives(buildCsp({ nonce, mode: m, dev, path: "/events/neon-nights" }))["frame-src"]!;
        expect(fs).toEqual(expect.arrayContaining(["https://www.youtube-nocookie.com", "https://player.vimeo.com"]));
        for (const bad of ["https://www.youtube.com", "https://youtube.com", "https://vimeo.com", "https:", "*"]) expect(fs).not.toContain(bad);
      }
      expect(ro["img-src"]).not.toContain("https://i.ytimg.com");           // click-to-load uses our own poster: no third-party request before a click
      expect(ro["worker-src"]).toEqual(["'self'", "blob:"]);
      expect(ro["object-src"]).toEqual(["'none'"]);
      expect(ro["base-uri"]).toEqual(["'self'"]);
      expect(ro["report-uri"]).toEqual(["/api/csp-report"]);
      expect(ro["report-to"]).toEqual(["csp"]);
      expect(ro["frame-ancestors"]).toBeUndefined();              // ignored (and warned about) in report-only; next.config enforces it
      const en = directives(buildCsp({ nonce, mode: "enforce", dev, path: "/organizer" }));
      expect(en["frame-ancestors"]).toEqual(["'none'"]);
      expect(directives(buildCsp({ nonce, mode: "enforce", dev, path: "/events/neon-nights" }))["frame-ancestors"]).toEqual(["'self'"]);
      expect("upgrade-insecure-requests" in en).toBe(!dev);
    }
  });

  test("Permissions-Policy (H-01)", () => {
    for (const f of ["usb=()", "serial=()", "hid=()", "midi=()", "display-capture=()", "browsing-topics=()", "microphone=()", "camera=(self)", "geolocation=(self)",
      "payment=(self \"https://js.stripe.com\")"]) expect(PERMISSIONS_POLICY.split(", ")).toContain(f);
  });

  test("live: every route class gets the nonce policy, and every executable script carries that request's nonce", async () => {
    const seen = new Set<string>();
    for (const p of ["/", "/login", "/events", "/events/neon-nights", "/discover", "/admin/login", "/api/health"]) {
      const r = await fetch(BASE + p, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
      const csp = r.headers.get("content-security-policy-report-only") ?? r.headers.get("content-security-policy") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce, p).toBeTruthy();
      expect(seen.has(nonce!), `${p} reused a nonce`).toBe(false); seen.add(nonce!);
      expect(r.headers.get("reporting-endpoints"), p).toBe('csp="/api/csp-report"');
      expect(r.headers.get("permissions-policy"), p).toBe(PERMISSIONS_POLICY);
      if (r.status !== 200 || !(r.headers.get("content-type") ?? "").includes("text/html")) continue; // redirects stream no layout
      const html = await r.text();
      const scripts = (html.match(/<script\b[^>]*>/g) ?? []).filter(t => !/type="(application\/ld\+json|application\/json)"/.test(t));
      expect(scripts.length, p).toBeGreaterThan(0);
      expect(scripts.filter(t => !t.includes(`nonce="${nonce}"`)), p).toEqual([]);
      expect(html, p).toMatch(new RegExp(`<script id="gd-fit" nonce="${nonce!.replace(/[+/=]/g, "\\$&")}"`));
    }
  });

  test("live: an inbound x-nonce is never trusted", async () => {
    const r = await fetch(BASE + "/login", { headers: { "x-nonce": "attacker" }, signal: AbortSignal.timeout(120_000) });
    expect(await r.text()).not.toContain('nonce="attacker"');
  });
});
