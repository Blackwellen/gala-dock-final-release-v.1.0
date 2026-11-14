import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { trustRequirements } from "../../src/lib/onboarding-schema";
import { csvCell } from "../../src/lib/provider/csv";
import { wallToIso } from "../../src/lib/events/wall-time";

// Q59 trust bug hunt (phase A, code level). Pure + source checks only: no browser, no dev server, no database.
// The DB half (held listing can't be published, expired restriction releases its hold, verify needs expiry/cover and notifies,
// unknown cover fails a minimum, provider can't forge bookkeeping, submitted business check can be verified) is the exercise
// scripts/db/exercises/202611146801_trust_bughunt_fixes.sql, run by migrate.mjs dry-run/apply.
const src = (p: string) => readFileSync(p, "utf8");
const MIG = "supabase/migrations/202611146801_trust_bughunt_fixes.sql";

test.describe("Q59 · onboarding trust step", () => {
  test("every required document is shown (no slice to three)", () => {
    const reqs = trustRequirements({ country: "United Kingdom", capabilities: ["venue", "service"], categories: ["Catering", "Security"] }).filter(r => r.kind === "document");
    expect(reqs.filter(r => r.required).map(r => r.key)).toEqual(expect.arrayContaining(["public_liability", "premises_licence", "food_hygiene", "security_licence"]));
    expect(reqs.length).toBeGreaterThan(3);
    const ui = src("src/components/onboarding.tsx");
    expect(ui).not.toContain('r.kind === "document").slice(0, 3)');
  });
  test("onboarding documents reach the review queue with a file name", () => {
    expect(src("src/app/api/onboarding/route.ts")).toMatch(/file_name: `\$\{k\.replaceAll\("_", "-"\)\}/);
  });
});

test.describe("Q59 · admin review", () => {
  const actions = src("src/app/admin/(console)/_d/actions.ts");
  test("identity checks expire at the end of the London day, not 23:59 UTC", () => {
    expect(actions).not.toContain("T23:59:59Z");
    expect(wallToIso("2026-07-04T23:59")).toBe("2026-07-04T22:59:00.000Z");   // BST
    expect(wallToIso("2026-12-04T23:59")).toBe("2026-12-04T23:59:00.000Z");   // GMT
  });
  test("cover with thousands separators is read, junk is refused (was silently dropped)", () => {
    expect(actions).toContain('.replace(/[£,\\s]/g, "")');
    expect(actions).toContain("Enter the cover amount in pounds");
  });
  test("new DB refusals have plain-English messages", () => {
    for (const k of ["expiry_required", "cover_required", "illegal verification transition", "invalid_reason_code"]) expect(actions).toContain(k);
  });
  test("Restrict / Suspend applies a real restriction (trust_enforce), never just closes the case", () => {
    expect(src("src/app/admin/(console)/_b/actions.ts")).toContain('rpc("trust_enforce"');
    const view = src("src/app/admin/(console)/trust/view.tsx");
    expect(view).toContain("action={restrictCase}");
    expect(view).not.toContain('args={[c.id, "actioned"]}');
    expect(actions).toContain("export async function applyRestriction");
    expect(src("src/app/admin/(console)/trust/verification/page.tsx")).toContain("action={applyRestriction}");
  });
  test("a submitted check can be marked in review from the queue", () => {
    expect(src("src/app/admin/(console)/trust/verification/page.tsx")).toContain('<option value="pending_review">Mark in review</option>');
  });
  test("provider-declared listing compliance is never labelled Verified", () => {
    const page = src("src/app/admin/(console)/marketplace/listings/[id]/page.tsx");
    expect(page).toContain('label="Declared"');
    expect(page).not.toContain('<Status key={x.name} value="verified" label="Verified" />');
  });
  test("trust case export neutralises spreadsheet formulas", () => {
    expect(src("src/app/admin/(console)/trust/export/route.ts")).toContain("csvCell(r[c])");
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

test.describe("Q59 · provider trust & credentials", () => {
  test("business verification can be submitted (only route for enquiry-only countries)", () => {
    expect(src("src/app/provider/settings/_components/credentials-actions.ts")).toContain('rpc("trust_submit_verification"');
    expect(src("src/app/provider/settings/_components/credentials-card.tsx")).toContain("<BusinessVerificationForm");
  });
  test("expiry is compared with today's London date", () => {
    const a = src("src/app/provider/settings/_components/credentials-actions.ts");
    expect(a).toContain('timeZone: "Europe/London"');
    expect(a).not.toContain("new Date(new Date().toDateString())");
  });
  test("upload guards double submits and enforces the minimum cover in the field", () => {
    const u = src("src/app/provider/settings/_components/credential-upload.tsx");
    expect(u).toContain("if (busy) return;");
    expect(u).toContain("min={minCover ? Math.ceil(minCover / 100) : 1}");
  });
});

test.describe("Q59 · data export includes trust records", () => {
  test("documents submitted, verification checks and actions about the user", () => {
    const e = src("src/app/api/account/export/route.ts");
    for (const k of ["trust_documents_submitted", "verification_checks", "trust_actions_about_you"]) expect(e).toContain(`q("${k}"`);
  });
});

test.describe("Q59 · migration 202611146801", () => {
  const m = src(MIG);
  test("held listings can't be published (one helper + trigger covers every published-filtered surface)", () => {
    expect(m).toContain("create or replace function public.trust_listing_held(p_listing uuid)");
    expect(m).toContain("create trigger listings_trust_hold_guard before insert or update of published on public.listings");
  });
  test("expired time-boxed restrictions reverse their effect", () => expect(m).toContain("perform public.trust_apply_effect(a, false);"));
  test("verify needs expiry + cover, provider is notified", () => {
    for (const k of ["'expiry_required'", "'cover_required'", "'trust_document_reviewed'"]) expect(m).toContain(k);
  });
  test("unknown cover never meets a minimum", () => expect(m).toContain("coalesce(cur.cover_amount_minor, 0) < p_min_cover"));
  test("submitted check passes through pending_review", () => expect(m).toContain("if c.status = 'submitted' and p_to in ('verified','suspended') then"));
  test("listing_trust exposes insurance_verified for public display", () => expect(m).toContain("'insurance_verified', coalesce(insured, false)"));
  test("is in the reviewed manifest", () => {
    const man = JSON.parse(src("supabase/migration-manifest.json")) as { reviewed: { file: string }[] };
    expect(man.reviewed.some(r => r.file === "202611146801_trust_bughunt_fixes.sql")).toBe(true);
  });
});

// ── Q59 follow-up: owner decisions (migration 202611146802, exercise scripts/db/exercises/202611146802_trust_owner_decisions.sql) ──
test.describe("Q59 · owner decisions", () => {
  const m2 = src("supabase/migrations/202611146802_trust_owner_decisions.sql");
  test("a suspended workspace gets no new payouts; the provider is told; lifting resumes", () => {
    expect(m2).toMatch(/dec107_payouts_paused[\s\S]*e\.action = 'workspace_suspended'/);
    expect(m2).toMatch(/payout_eligible[\s\S]*e\.action = 'workspace_suspended'/);
    expect(m2).toContain("'payout.held_trust_suspension'");
    expect(m2).toContain("refunds to buyers still go out");
  });
  test("managers can upload credentials; appeals and business verification stay owner-only", () => {
    expect(src("src/app/provider/settings/page.tsx")).toContain("canUpload={ctx.can.manage}");
    expect(src("src/app/provider/settings/_components/credentials-card.tsx")).toContain("{canUpload && !r.pending_renewal &&");
  });
  test("wizard compliance is 'Declared' with a link to Trust & credentials (no dead 'Uploaded')", () => {
    for (const p of ["src/app/provider/venues/new/steps.tsx", "src/app/provider/services/new/steps.tsx"]) {
      const s = src(p);
      expect(s).toContain('href="/provider/settings#credentials"');
      expect(s).toContain('"Declared" : "Not declared"');
      expect(s).not.toContain('"Uploaded"');
    }
  });
  test("admin identity/phone chips come from real checks, not profiles.identity_verified", () => {
    expect(m2).toContain("create or replace function public.user_identity_verified(p_user uuid)");
    expect(m2).toContain("public.user_identity_verified(u.id) as identity_verified");
    expect(m2).toContain("'phone_confirmed', u.phone_confirmed_at is not null");
    for (const p of ["src/app/admin/(console)/users/[id]/page.tsx", "src/app/admin/(console)/users/page.tsx"]) expect(src(p)).not.toMatch(/profile\??\.identity_verified \?/);
  });
  test("licence documents go through the upload pipeline and a gated download", () => {
    expect(m2).toContain("raise exception 'upload_not_verified'");
    expect(m2).toContain("create or replace function public.licence_document_access(p_licence uuid)");
    expect(src("src/components/organizer/event/sections/compliance.tsx")).toContain("<LicenceDocument");
    const r = src("src/app/api/compliance/licences/[id]/document/route.ts");
    expect(r).toContain('gate(admin, "workspace-files", doc.path)');
    expect(r).toContain("createSignedUrl(doc.path, 60");
  });
  test("public claims are truthful", () => {
    const d = src("src/app/organizer/marketplace/[type]/[id]/page.tsx");
    expect(d).toContain("Identity & required documents verified");
    expect(d).not.toContain("completed bookings on Gala Dock");
    expect(src("src/app/(site)/page.tsx")).not.toContain("Verified providers who respond");
    expect(src("src/app/organizer/marketplace/emergency/page.tsx")).not.toContain("vetted");
    expect(src("src/app/(customer)/account/events/[id]/build/page.tsx")).not.toContain("DBS");
    expect(src("src/app/provider/services/[id]/page.tsx")).toContain("Verified (identity + documents)");
  });
  test("retention drafts + erasure-safe FKs", () => {
    expect(m2).toContain("'provider_documents.retain'");
    expect(m2).toContain("on delete set null");
    expect(m2).toContain("drop constraint if exists provider_documents_uploaded_by_fkey");
  });
  test("uploaders can't delete stored evidence", () => {
    expect(m2).toContain("alter policy workspace_files_delete on storage.objects");
    expect(m2).toContain("not public.storage_object_locked(bucket_id, name)");
  });
});
