import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeSvg, safeSvgColor } from "../../src/lib/security/svg-sanitize";
import { code128Svg } from "../../src/lib/tickets/code128";

// Q45-S01 client layer (unit, no browser): the allow-list sanitiser used before every innerHTML render of stored / generated SVG.
// Payloads are the five from q45-input-safety (DB guard) plus the usual SVG XSS vectors.
const Q45_PAYLOADS = ["<image/onerror=alert(1)/href=x>", "<image\tonerror=alert(1) href=x>", "<a href=\"java&#115;cript:alert(1)\">x</a>", "<foreignObject><div/></foreignObject>",
  "#000\" onmouseover=\"alert(1)"];
const VECTORS = [
  "<script>alert(1)</script>", "<svg><script>alert(1)</script></svg>", "<SCRIPT SRC=//evil.example/x.js></SCRIPT>",
  "<path d=\"M0 0\" onload=\"alert(1)\"/>", "<path d=\"M0 0\" ONCLICK=alert(1) />", "<g\nonmouseover\n=\nalert(1)>x</g>",
  "<use href=\"https://evil.example/s.svg#x\"/>", "<use xlink:href=\"//evil.example/s.svg#x\"/>", "<use href=\"data:image/svg+xml;base64,PHN2Zz4=\"/>",
  "<image href=\"javascript:alert(1)\"/>", "<image href=\"data:text/html;base64,PHNjcmlwdD4=\"/>", "<image href=\"data:image/svg+xml,<svg onload=alert(1)>\"/>",
  "<a xlink:href=\"javascript:alert(1)\"><text>x</text></a>", "<animate attributeName=\"href\" values=\"javascript:alert(1)\"/>",
  "<set attributeName=\"onmouseover\" to=\"alert(1)\"/>", "<foreignObject><iframe src=\"javascript:alert(1)\"></iframe></foreignObject>",
  "<style>@import url(//evil.example/x.css)</style>", "<path style=\"fill:url(https://evil.example/x)\"/>", "<path fill=\"url(//evil.example#a)\"/>",
  "<path style=\"background:url(javascript:alert(1))\"/>", "<path style=\"position:fixed;inset:0;z-index:99999\"/>",
  "<path fill=\"&#x6A;avascript:alert(1)\"/>", "<path fill=\"java\tscript:alert(1)\"/>", "<path style=\"fill:\\75 rl(x)\"/>",
  "<![CDATA[<script>alert(1)</script>]]>", "<!--<script>alert(1)</script>-->", "<?xml-stylesheet href=\"//evil.example/x.xsl\"?>",
  "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>", "<math><mtext><img src=x onerror=alert(1)></mtext></math>", "<img src=x onerror=alert(1)>",
  "</svg><img src=x onerror=alert(1)>", "<svg/onload=alert(1)>", "<text>&lt;img src=x onerror=alert(1)&gt;</text>", "<path d=\"M0 0\" <img src=x onerror=alert(1)>",
  "<g><g><script>alert(1)</script></g>", "<path d=\"M0\" onerror", "<image href=\"  JAVASCRIPT:alert(1)\"/>",
];
// What must never appear inside an emitted tag: an active element, a handler attribute, or a script/data URL. Text runs are escaped
// (`&lt;img …&gt;` is inert text), so only real tags are inspected.
const ACTIVE_TAG = /<\s*\/?\s*(script|foreignobject|iframe|img|a|style|animate|set|math|object|embed)\b|\son[a-z]+\s*=|(javascript|vbscript):|data:(?!image\/(png|jpe?g);base64,)/i;

test.describe("Q45-S01 SVG sanitiser", () => {
  test("q45-input-safety payloads and SVG XSS vectors come out inert", () => {
    const active = (out: string) => (out.match(/<[^>]*>/g) ?? []).some(t => ACTIVE_TAG.test(t));
    const leaks = [...Q45_PAYLOADS, ...VECTORS].map(p => [p, sanitizeSvg(p)] as const).filter(([, out]) => active(out));
    expect(leaks).toEqual([]);
    expect(sanitizeSvg("<image/onerror=alert(1)/href=x>")).toBe("<image></image>"); // handler and non-raster href stripped
    expect(sanitizeSvg("<foreignObject><div/></foreignObject>")).toBe("");
    expect(sanitizeSvg("#000\" onmouseover=\"alert(1)")).toBe("#000&quot; onmouseover=&quot;alert(1)"); // text only, no tag
    expect(sanitizeSvg("<text>&lt;img src=x onerror=alert(1)&gt;</text>")).toBe("<text>&lt;img src=x onerror=alert(1)&gt;</text>");
    expect(sanitizeSvg("<g><g><script>alert(1)</script></g>")).toBe("<g><g></g></g>");
  });

  test("benign markup keeps its shape (canonical case, internal references, raster images)", () => {
    expect(sanitizeSvg("<path d=\"M0 0h24\"/>")).toBe("<path d=\"M0 0h24\"/>");
    expect(sanitizeSvg("<lineargradient id=\"a\" gradientunits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff\"/></lineargradient><path fill=\"url(#a)\" d=\"M0 0\"/>"))
      .toBe("<linearGradient id=\"a\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff\"/></linearGradient><path fill=\"url(#a)\" d=\"M0 0\"/>");
    expect(sanitizeSvg("<use href=\"#SVGabc\"/><mask id=\"m\" style=\"mask-type:alpha\"><rect width=\"1\"/></mask>"))
      .toBe("<use href=\"#SVGabc\"/><mask id=\"m\" style=\"mask-type:alpha\"><rect width=\"1\"/></mask>");
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(sanitizeSvg(`<image href="${png}" width="4" height="4"/>`)).toBe(`<image href="${png}" width="4" height="4"/>`);
    expect(sanitizeSvg("<path d='M0 0' fill='currentColor'/>")).toBe("<path d=\"M0 0\" fill=\"currentColor\"/>");
    expect(sanitizeSvg("<g fill=\"none\"><path d=\"M1 1\"/>")).toBe("<g fill=\"none\"><path d=\"M1 1\"/></g>");
  });

  test("every shipped icon (all public/design-assets sets) survives unchanged in element and attribute count", () => {
    const dir = join(process.cwd(), "public", "design-assets", "icons");
    const count = (s: string) => [(s.match(/<[a-zA-Z]/g) ?? []).length, (s.match(/\s[a-zA-Z:-]+="/g) ?? []).length];
    let icons = 0; const changed: string[] = [];
    for (const f of readdirSync(dir)) {
      const set = JSON.parse(readFileSync(join(dir, f), "utf8")) as { i: Record<string, string | [string, number, number]> };
      for (const [name, v] of Object.entries(set.i)) {
        const body = typeof v === "string" ? v : v[0]; icons++;
        const [e0, a0] = count(body), [e1, a1] = count(sanitizeSvg(body));
        if (e0 !== e1 || a0 !== a1) changed.push(`${f}:${name}`);
      }
    }
    console.log(`icons checked: ${icons}, changed: ${changed.length}`);
    expect(icons).toBeGreaterThan(1000);
    expect(changed.slice(0, 20)).toEqual([]);
  });

  test("barcode colour cannot break out of its attribute", () => {
    const evil = "#000\" onmouseover=\"alert(1)";
    expect(safeSvgColor(evil)).toBe("#000");
    expect(safeSvgColor("#1b64f5")).toBe("#1b64f5");
    expect(safeSvgColor("rgb(0, 0, 0)")).toBe("rgb(0, 0, 0)");
    expect(safeSvgColor("red")).toBe("red");
    expect(code128Svg("GALADOCK", { color: evil })).not.toMatch(/onmouseover/);
    expect(sanitizeSvg(code128Svg("GALADOCK", { color: "#123456" }))).toBe(code128Svg("GALADOCK", { color: "#123456" }));
  });

  test("qrcode library SVG passes through intact", async () => {
    const QRCode = (await import("qrcode")).default;
    const svg = await QRCode.toString("https://galadock.example/t/abc", { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    const out = sanitizeSvg(svg);
    expect(out).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="[^"]+"/);
    expect((out.match(/<path/g) ?? []).length).toBe((svg.match(/<path/g) ?? []).length);
    expect(out).toContain((svg.match(/ d="([^"]+)"/g) ?? [])[1]!);
  });
});
