import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { lintMigration } from "../../scripts/db/lint.mjs";
import { publicReply, reviewReplyError, reviewReplyProblem, websiteHref, workspaceCoverUrlOk, organizerJsonLd, jsonLdScript, REPLY_MAX } from "../../src/lib/profiles/rules";

// Q62 profile builders bug hunt (Phase A, code + DB). Pure / source checks only: no network, no dev server.
const src = (f: string) => readFileSync(f, "utf8");
const MIG = "supabase/migrations/202611147621_profile_bughunt.sql";
const WS = "0b9a3c1e-2f4d-4e5a-9b6c-7d8e9f0a1b2c";

test("review replies: 2–2,000 characters, errors map to actionable copy", () => {
  expect(reviewReplyProblem(" ")).toMatch(/Write a reply/);
  expect(reviewReplyProblem("ok")).toBeNull();
  expect(reviewReplyProblem("x".repeat(REPLY_MAX + 1))).toMatch(/under 2,000/);
  expect(reviewReplyError("reply_hidden")).toMatch(/removed your reply/);
  expect(reviewReplyError("review_not_published")).toMatch(/isn't published/);
  expect(reviewReplyError("not_authorized")).toMatch(/owner or a manager/);
  expect(reviewReplyError("rate_limited")).toMatch(/Too many/);
  expect(reviewReplyError("boom")).toMatch(/Nothing was changed/);
});

test("public pages show a reply only when it exists and isn't hidden by moderation", () => {
  expect(publicReply({ provider_response: "Thanks!", response_status: "published" })).toBe("Thanks!");
  expect(publicReply({ provider_response: "Thanks!", response_status: null })).toBe("Thanks!");
  expect(publicReply({ provider_response: "Thanks!", response_status: "hidden" })).toBeNull();
  expect(publicReply({ provider_response: "  ", response_status: null })).toBeNull();
  const l = src("src/components/customer/public-listing.tsx");
  expect(l).toMatch(/provider_response/);
  expect(l).toMatch(/publicReply\(r\)/);
  expect(src("src/app/(customer)/account/reviews/page.tsx")).toMatch(/publicReply\(r\)/);
});

test("reply migration: one editable reply, published reviews only, notifies once, admin moderation, anon sees no moderation fields", () => {
  const m = src(MIG);
  expect(lintMigration(m).errors).toEqual([]);
  const fn = m.slice(m.indexOf("function public.respond_to_review"), m.indexOf("function public.moderate_review_response"));
  expect(fn).toMatch(/require_provider_role\(ws, array\['owner','manager'\]\)/);
  expect(fn).toMatch(/r\.status <> 'published'/);
  expect(fn).toMatch(/reply_hidden/);
  expect(fn).toMatch(/reply_too_long/);
  expect(fn).toMatch(/responded_at = coalesce\(responded_at, now\(\)\)/);
  expect(fn).toMatch(/'review_reply:' \|\| r\.id\)/);            // dedupe key: the reviewer hears about the first reply once
  expect(fn).toMatch(/hit_rate_limit\('review_reply:'/);
  expect(m).toMatch(/has_admin_permission\('trust'\) or public\.has_admin_permission\('marketplace'\)/);
  expect(m).toMatch(/provider_response = case when p_hide then null/);   // hidden text leaves the publicly readable row
  expect(m).toMatch(/grant select \(response_status, response_updated_at\) on public\.reviews to anon/);
  expect(m).not.toMatch(/grant select \([^)]*moderation[^)]*\) on public\.reviews to anon/);
  expect(m).toMatch(/create trigger trg_review_notify_provider after insert on public\.reviews/);
});

test("provider reviews page: owner/manager reply form through respond_to_review, reachable from the Listings nav", () => {
  const a = src("src/app/provider/reviews/actions.ts");
  expect(a).toMatch(/reviewReplyProblem\(body\)/);
  expect(a).toMatch(/if \(!can\.manage\)/);
  expect(a).toMatch(/rpc\("respond_to_review", \{ p_review: reviewId, p_body: body\.trim\(\) \}\)/);
  const p = src("src/app/provider/reviews/page.tsx");
  expect(p).toMatch(/<ActionForm action=\{replyToReview\.bind\(null, r\.id\)\}/);   // ActionForm = one submit at a time
  expect(p).toMatch(/\.eq\("status", "published"\)/);
  expect(src("src/components/workspace/shell.tsx")).toMatch(/href: "\/provider\/reviews", label: "Reviews"/);
});

test("workspace cover accepts only this workspace's files-pipeline images", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public/event-media";
  expect(workspaceCoverUrlOk(`${base}/${WS}/1b4e28ba-2fa1-11d2-883f-0016d3cca427.webp`, WS)).toBe(true);
  expect(workspaceCoverUrlOk(`${base}/${WS}/1b4e28ba-2fa1-11d2-883f-0016d3cca427.jpg`, WS)).toBe(true);
  expect(workspaceCoverUrlOk(`${base}/11111111-2222-3333-4444-555555555555/1b4e28ba-2fa1-11d2-883f-0016d3cca427.webp`, WS)).toBe(false);   // another workspace
  expect(workspaceCoverUrlOk("https://cdn.example.com/x.png", WS)).toBe(false);
  expect(workspaceCoverUrlOk(`http://abc.supabase.co/storage/v1/object/public/event-media/${WS}/1b4e28ba-2fa1-11d2-883f-0016d3cca427.png`, WS)).toBe(false);
  expect(workspaceCoverUrlOk(`${base}/${WS}/1b4e28ba-2fa1-11d2-883f-0016d3cca427.svg`, WS)).toBe(false);
  const ps = src("src/app/provider/settings/page.tsx");
  expect(ps).not.toMatch(/venues\/new\?venue=\$\{venue\.id\}&step=5`\}>Change photo/);   // edited the venue's photos, not the workspace cover
  expect(ps).toMatch(/<CoverUpload workspaceId=\{ws\.id\} save=\{saveCoverImage\}/);
  expect(src("src/app/provider/settings/actions.ts")).toMatch(/workspaceCoverUrlOk\(url, workspace\.id\)/);
  const os = src("src/app/organizer/settings/page.tsx");
  expect(os).not.toMatch(/key: "cover_image", label: "Cover image URL"/);
  expect(os).toMatch(/<CoverUpload workspaceId=\{ws\}/);
  const wa = src("src/lib/actions/workspace-settings.ts");
  expect(wa).toMatch(/workspaceCoverUrlOk\(url, ctx\.workspace\.id\)/);
  expect(wa).toMatch(/"cover_image" in p\.data/);
});

test("organiser profile: Settings description/website/brand reach the page; no self-asserted rating; JSON-LD; London dates", () => {
  const p = src("src/app/organizers/[slug]/page.tsx");
  expect(p).toMatch(/rpc\("public_organizer_profile"/);
  expect(p).not.toMatch(/\)\?\.rating \?\? 0|\}average rating|Average event rating/);   // the comment explaining the removal may mention it
  expect(p).toMatch(/application\/ld\+json/);
  expect(p).toMatch(/accentVars\(w\.brand_color\)/);
  expect(p).toMatch(/rel="noopener noreferrer nofollow ugc"/);
  expect(p).toMatch(/alt=\{p\.alt\}/);
  expect(p).toMatch(/permanentRedirect\(`\/organizers\/\$\{id\}`\)/);
  const m = src(MIG);
  const fn = m.slice(m.indexOf("function public.public_organizer_profile"));
  expect(fn).not.toMatch(/contact_email|contact_phone/);
  expect(fn).toMatch(/w\.status <> 'suspended' and not public\.demo_hidden_for_viewer\(w\.id\)/);
  expect(websiteHref("example.com")).toBe("https://example.com/");
  expect(websiteHref("http://example.co.uk/about")).toBe("https://example.co.uk/about");
  expect(websiteHref("javascript:alert(1)")).toBeNull();
  expect(websiteHref("not a site")).toBeNull();
  const ld = organizerJsonLd({ name: "A</script>", url: "https://x/organizers/1", description: null, image: null, website: null });
  expect(ld["@type"]).toBe("Organization");
  expect(jsonLdScript(ld)).not.toMatch(/<\/script>/);
});

test("anonymous visitors get the trust-calculated listing badges (listing_trust executable by anon)", () => {
  expect(src(MIG)).toMatch(/grant execute on function public\.listing_trust\(uuid\) to anon/);
});

test("customer profile: the 'Verified' badge means identity verification, not a confirmed email", () => {
  const a = src("src/app/(customer)/account/page.tsx");
  expect(a).toMatch(/identity_verified/);
  expect(a).toMatch(/const idVerified = !!p\?\.identity_verified/);
});

test("Q49 add-ons: Published sparkline from listings, my-shifts page-head scale, Export team only for owners/managers", () => {
  const l = src("src/app/provider/listings/[[...type]]/page.tsx");
  expect(l).toMatch(/label="Published" value=\{counts\.published\} series=\{dailySeries\(scoped\.filter\(c => c\.status === "published"\)/);
  expect(src("src/components/team/my-shifts.tsx")).not.toMatch(/fontSize: 28/);
  const t = src("src/components/organizer/team-client.tsx");
  expect(t).toMatch(/\{canExport && <a role="menuitem" className="k-menu-item" href="\/api\/export\/team"/);
  expect(src("src/app/organizer/team/page.tsx")).toMatch(/canExport=\{\["owner", "manager"\]\.includes\(String\(ctx\.role\)\)\}/);
  expect(src("src/lib/tours.ts")).not.toMatch(/Payouts, commission and invoices/);   // providers have no invoices page
});

test("public listing selects `published` so a published listing is never labelled as a draft preview (Q71 finding)", () => {
  const s = readFileSync("src/components/customer/public-listing.tsx", "utf8");
  expect(s).toMatch(/const COLS = "[^"]*\bpublished\b/);
  expect(s).toMatch(/const q = preview \? base : base\.eq\("published", true\)/);
});
