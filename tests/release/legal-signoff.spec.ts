import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Legal sign-off (R3, owner 2026-11-15): the v3 legal pack is final and published from content/legal; no person is named in any legal
// header, contact point or footer; versions are bumped; insurance wording is kept only where sellers must hold their own cover; the
// acceptance flow (sign-up, per-role re-acceptance, express ticks, P2B 15-day notice) is wired and recorded with the version.
// Pure + source checks always run; database checks run with management credentials; page checks run when the app server answers.
function load(file: string): Record<string, any> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = { exports: {} as Record<string, unknown> };
  runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: m, exports: m.exports, require: (n: string) => { throw new Error(`Unexpected dependency: ${n}`); }, Date });
  return m.exports as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
}
const src = (f: string) => readFileSync(f, "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const reg = load("src/lib/legal/registry.ts");
const DOCS = reg.LEGAL_DOCUMENTS as { slug: string; title: string; href: string; version: string; label: string; previous: string; audience: string; accept: string[]; express?: { code: string }[] }[];
const MIG = src("supabase/migrations/202611150101_legal_signoff_v3.sql");
const EXERCISE = src("scripts/db/exercises/202611150101_legal_signoff_v3.sql");
const DIRECTOR = /jamahl|\bthomas\b/i;   // the director's name must not appear in anything published
const insuranceLines = (body: string) => body.split("\n").filter(l => /insur/i.test(l.replace(/National Insurance/g, "")));
const PUBLISHED_SOURCES = [
  ...walk("content/legal"), ...walk("src/app/(legal)"), ...walk("src/components/legal"), "src/lib/legal.ts", "src/lib/legal/registry.ts", "src/lib/legal/texts.generated.ts",
  ...walk("src/lib/email"), "src/app/partner/statements/[id]/page.tsx", "src/components/public/site-footer.tsx", "src/app/(site)/about/page.tsx",
];

test.describe("Legal sign-off · published texts", () => {
  test("texts pass the publication checks and the generated module is up to date", () => {
    const r = spawnSync(process.execPath, ["scripts/legal/build-texts.mjs", "--check"], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  test("no director name in any published legal page, header, footer, email or template; role wording instead", () => {
    for (const f of PUBLISHED_SOURCES) {
      expect(src(f), f).not.toMatch(DIRECTOR);
      expect(src(f), f).not.toMatch(/Data Protection Officer is|dpo\.name|approved by \{/);
    }
    expect(src("src/lib/legal.ts")).not.toMatch(/\bdpo\b/);
    expect(src("content/legal/privacy.md")).toMatch(/Our data protection lead handles questions/);
    expect(src("content/legal/safeguarding.md")).toMatch(/our \*\*Safeguarding lead\*\*/);
    expect(src("content/legal/data-retention.md")).not.toMatch(/Approved by/);
  });

  test("the identity the law requires is in every header: company, number, registered office, VAT, contact", () => {
    const id = src("src/components/legal/legal-document.tsx");
    for (const k of ["e.name", "e.number", "e.address", "e.vat", "LEGAL.contact.legal"]) expect(id).toContain(k);
    expect(src("src/lib/legal.ts")).toMatch(/number: "16482166", address: "61 Bridge Street, Kington, Herefordshire, HR5 3DJ, United Kingdom".*vat: "GB508480488"/);
  });

  test("insurance wording only where sellers must hold their own cover (and the badge that says what we checked)", () => {
    const allowed: Record<string, number> = { terms: 1, "organiser-terms": 2, "supplier-terms": 6, "venue-terms": 2, "community-standards": 1 };
    for (const d of DOCS) {
      const body = src(`content/legal/${d.slug}.md`);
      expect(insuranceLines(body).length, d.slug).toBe(allowed[d.slug] ?? 0);
    }
    for (const s of ["terms", "payment-terms", "partner-terms", "ai-terms"]) expect(src(`content/legal/${s}.md`)).not.toMatch(/insurer|insured/i);
  });

  test("no placeholders, draft markers or review notes; every v3 redline published", () => {
    const redlines = readdirSync("docs/legal/review-2026-11/redlines").filter(f => f.endsWith("-v3.md"));
    expect(redlines).toHaveLength(25);
    for (const d of DOCS) {
      const body = src(`content/legal/${d.slug}.md`);
      expect(body, d.slug).not.toMatch(/\[(?![^\]]*\]\()|DRAFT|ENGINE|counsel|owner decision|\bQ\d{2}\b/);
    }
    expect(DOCS).toHaveLength(26);   // the 25 v3 redlines (redline 25 Part B became the published Accessibility Statement) + Privacy … = 26 pages
  });
});

test.describe("Legal sign-off · versions and dates", () => {
  test("every changed document has a new version, distinct from the one it replaces", () => {
    for (const d of DOCS) {
      expect(d.version, d.slug).toMatch(/^gd-[a-z]+-\d+\.\d+$/);
      expect(d.version, d.slug).not.toBe(d.previous);
      expect(d.version.endsWith(d.label), d.slug).toBe(true);
    }
    expect(new Set(DOCS.map(d => d.version)).size).toBe(DOCS.length);
    expect(src("src/lib/legal.ts")).toMatch(/version: legalDoc\("terms"\)!\.version/);
    expect(reg.legalDoc("terms").version).toBe("gd-tos-3.0");
    expect(reg.legalDoc("payment-terms").version).toBe("gd-pt-1.1");
    expect(reg.BUSINESS_NOTICE_DAYS).toBe(15);
  });

  test("business documents take effect 15 full days after publication; consumer and privacy documents on publication", () => {
    for (const d of DOCS) {
      if (/organiser|supplier|venue|partner|promoter|payment|subscription|ai-terms|data-processing/.test(d.slug)) expect(d.audience, d.slug).toBe("business");
      if (/privacy|cookies|data-retention|customer-terms|ticket-terms|resale|cancellation|accessibility|safeguarding/.test(d.slug)) expect(d.audience, d.slug).toBe("consumer");
    }
    expect(MIG).toMatch(/biz := \(\(date_trunc\('day', t at time zone 'Europe\/London'\) \+ interval '16 days'\) at time zone 'Europe\/London'\)/);
    expect(MIG).toMatch(/case when d\.audience = 'business' then biz else t end, case when d\.audience = 'consumer' then t else biz end/);
    const pub = { version: "gd-org-3.0", published_at: "2026-11-16T10:00:00Z", effective_at: "2026-12-02T00:00:00Z", business_effective_at: "2026-12-02T00:00:00Z" };
    expect(reg.statusLine(reg.legalDoc("organiser-terms"), pub, new Date("2026-11-20T00:00:00Z"))).toBe("Published 16 November 2026 · applies to new users now and to existing business users from 2 December 2026");
    expect(reg.statusLine(reg.legalDoc("organiser-terms"), pub, new Date("2026-12-03T00:00:00Z"))).toBe("In force from 2 December 2026");
    expect(reg.statusLine(reg.legalDoc("privacy"), { ...pub, version: "gd-pp-3.0", effective_at: pub.published_at }, new Date())).toBe("In force from 16 November 2026");
    expect(reg.statusLine(reg.legalDoc("terms"), null)).toBe("Publication pending");
  });

  test("the database mirror agrees with the registry (slug, title, URL, audience, who accepts)", () => {
    const seeded = [...MIG.matchAll(/\('([a-z-]+)', '([^']+)', '(\/[a-z/-]+)', '(consumer|business|all)', array\[([^\]]*)\](?:::text\[\])?, \d+\)/g)]
      .map(m => ({ slug: m[1], title: m[2], href: m[3], audience: m[4], accept: m[5]!.split(",").map(x => x.trim().replace(/'/g, "")).filter(Boolean) }));
    expect(seeded).toEqual(DOCS.map(d => ({ slug: d.slug, title: d.title, href: d.href, audience: d.audience, accept: d.accept })));
    for (const d of DOCS) for (const e of d.express ?? []) expect(MIG).toContain(`'["${e.code}"]'::jsonb`);
  });
});

test.describe("Legal sign-off · acceptance per role", () => {
  test("sign-up records the Terms version and the customer documents; updated terms are re-accepted at sign-in and in each shell", () => {
    expect(src("src/components/auth.tsx")).toMatch(/terms_version: TERMS_VERSION/);
    expect(src("src/components/auth.tsx")).toMatch(/the documents for customers it lists/);
    expect(MIG).toMatch(/create trigger legal_signup_acceptance after insert on public\.profiles/);
    expect(src("src/app/continue/route.ts")).toMatch(/loadPending\(\)[\s\S]*\/legal\/updates\?next=/);
    for (const f of ["src/app/organizer/layout.tsx", "src/app/provider/layout.tsx"]) {
      expect(src(f)).toMatch(/if \(businessGate\(legal\)\) redirect\(`\/legal\/updates\?next=/);
      expect(src(f)).toMatch(/<LegalUpdateBanner pending=\{legal\}/);
    }
    expect(src("src/app/(customer)/layout.tsx")).toMatch(/<LegalUpdateBanner pending=\{legal\}/);
    expect(src("src/lib/legal/actions.ts")).toMatch(/rpc\("legal_accept", \{ p_items: items \}\)/);
    expect(src("src/app/(legal)/legal/updates/page.tsx")).toMatch(/name=\{`express:\$\{d\.slug\}`\}[\s\S]*required/);
  });

  test("roles map to the right documents; express terms have their own tick; acceptance stores the version", () => {
    const by = (role: string) => DOCS.filter(d => d.accept.includes(role)).map(d => d.slug).sort();
    expect(by("customer")).toEqual(["acceptable-use", "cancellation-refund-policy", "community-standards", "customer-terms", "disputes-policy", "resale-terms", "standard-booking-terms", "terms", "ticket-terms"]);
    expect(by("organiser")).toEqual(["ai-terms", "data-processing-addendum", "disputes-policy", "organiser-terms", "payment-terms", "standard-booking-terms", "subscription-terms"]);
    expect(by("supplier")).toEqual(["ai-terms", "data-processing-addendum", "disputes-policy", "payment-terms", "standard-booking-terms", "subscription-terms", "supplier-terms"]);
    expect(by("venue")).toEqual(["venue-terms"]);
    expect(by("partner")).toEqual(["partner-terms"]);
    expect(by("promoter")).toEqual(["promoter-terms"]);
    expect(MIG).toMatch(/user_id uuid not null,[\s\S]*version text not null,[\s\S]*foreign key \(slug, version\) references public\.legal_document_versions/);
    expect(MIG).toMatch(/raise exception 'express_term_required'/);
    expect(MIG).toMatch(/raise exception 'terms_version_changed'/);
    expect(src("src/components/payments/payment-terms-tick.tsx")).toMatch(/a suspension of your workspace decided by a person after review, or missing tax-reporting details/);
    expect(src("src/app/partner/apply/apply-form.tsx")).toMatch(/href="\/legal\/partner-terms"/);
  });

  test("notices are queued only by the post-deploy publish, once per real account, as legal service mail", () => {
    expect(MIG).not.toMatch(/^\s*select public\.legal_publish_pack/m);                 // the migration publishes nothing
    expect(MIG).toMatch(/revoke all on function public\.legal_publish_pack\(text, jsonb, text\) from public, anon, authenticated/);
    expect(MIG).toMatch(/not public\.analytics_user_is_demo\(u\.id\) and not public\.is_test_identity_email\(u\.email\)/);
    expect(MIG).toMatch(/update public\.email_outbox set category = 'legal'/);
    expect(src("src/lib/email/send.ts")).toMatch(/\["security", "payments", "legal"\]\.includes\(o\.category\)/);
    expect(src("scripts/legal/publish-pack.mjs")).toMatch(/refused: the live site doesn't serve this checkout's legal texts/);
    expect(EXERCISE).toMatch(/EXERCISE_OK/);
  });
});

const PAT = process.env.SUPABASE_PAT_KEY, REF = process.env.SUPABASE_PROJECT_REF;
async function sql(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return { ok: res.ok, text: await res.text() };
}

test.describe("Legal sign-off · live database", () => {
  test.skip(!PAT || !REF, "management credentials not set");
  test("mirror rows match the registry; published versions (if any) carry the deployed texts", async () => {
    const r = await sql("select slug, title, href, audience, accept_roles from public.legal_documents order by sort");
    expect(r.ok, r.text).toBe(true);
    const rows = JSON.parse(r.text) as { slug: string; title: string; href: string; audience: string; accept_roles: string[] }[];
    expect(rows.map(x => [x.slug, x.title, x.href, x.audience, x.accept_roles])).toEqual(DOCS.map(d => [d.slug, d.title, d.href, d.audience, d.accept]));
    const pub = JSON.parse((await sql("select slug, version, body_sha256 from public.legal_current_versions() join public.legal_document_versions using (slug, version)")).text) as { slug: string; version: string; body_sha256: string }[];
    if (pub.length) {
      const gen = src("src/lib/legal/texts.generated.ts");
      for (const p of pub) { expect(p.version).toBe(reg.legalDoc(p.slug).version); expect(gen).toContain(p.body_sha256); }
    }
  });
  test("acceptance flow end to end in a rolled-back transaction (before publication)", async () => {
    const published = JSON.parse((await sql("select count(*)::int n from public.legal_packs")).text)[0].n as number;
    test.skip(published > 0, "pack already published: the exercise covers the pre-publication state");
    const r = await sql(EXERCISE);
    expect(r.ok).toBe(false);                       // the exercise always ends by raising, which rolls everything back
    expect(r.text).toMatch(/EXERCISE_OK/);
  });
});

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
test.describe("Legal sign-off · published pages", () => {
  test.beforeAll(async () => { test.skip(!(await fetch(`${BASE}/legal/manifest.json`).then(r => r.ok).catch(() => false)), "app server not running"); });
  test("every document renders with its version, the company identity and no director name", async ({ request }) => {
    for (const d of DOCS) {
      const res = await request.get(`${BASE}${d.href}`);
      expect(res.status(), d.href).toBe(200);
      const html = (await res.text()).replace(/<!-- -->/g, "");   // React separates adjacent text nodes with empty comments
      expect(html, d.href).toContain(`data-legal-version="${d.version}"`);
      expect(html, d.href).toContain(`Version ${d.label}`);
      expect(html, d.href).toContain("company number 16482166");
      expect(html, d.href).toContain("61 Bridge Street, Kington");
      expect(html, d.href).not.toMatch(DIRECTOR);
      expect(html, d.href).not.toMatch(/Data Protection Officer|DRAFT|Draft for owner review/);
    }
    for (const p of ["/legal", "/legal/archive/terms-2026-10", "/legal/archive/privacy-2026-10"]) {
      const html = await (await request.get(`${BASE}${p}`)).text();
      expect(html, p).not.toMatch(DIRECTOR);
    }
    expect((await request.get(`${BASE}/legal/terms`, { maxRedirects: 0 })).status()).toBe(308);
  });
  test("the manifest serves the generated texts; the updates page needs sign-in", async ({ request }) => {
    const m = await (await request.get(`${BASE}/legal/manifest.json`)).json() as { pack: string; documents: { slug: string; version: string; sha256: string }[] };
    expect(m.pack).toBe(reg.LEGAL_PACK);
    const gen = src("src/lib/legal/texts.generated.ts");
    for (const d of m.documents) { expect(d.version).toBe(reg.legalDoc(d.slug).version); expect(gen).toContain(d.sha256); }
    const res = await request.get(`${BASE}/legal/updates`, { maxRedirects: 0 });
    expect([303, 307]).toContain(res.status());
    expect(res.headers().location).toMatch(/\/login/);
  });
});
