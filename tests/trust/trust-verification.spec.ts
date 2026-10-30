import { randomUUID, createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, enrolTotp, seedWorkspace, signedIn } from "../phase1/helpers";

// Q08 Trust, verification & provider documents (domains 116–122) — API-level, disposable identities, RLS-bound user clients.
// The service role is used only for fixtures (users, workspaces, listings, events, the ClamAV "clean" verdict and moving dates
// to simulate time) and for running the scheduled job handler. Every authorization assertion goes through a user/anon client.
type U = { id: string; email: string };
type Id = { id: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const day = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const anonC = () => anon() as unknown as SupabaseClient;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test.describe.configure({ mode: "serial" });

test.describe("Q08 trust & verification", () => {
  let P: U, S: U, C: U, A: U;
  let pc: SupabaseClient, sc: SupabaseClient, cc: SupabaseClient, ac: SupabaseClient;
  let PW: string, SW: string, L: string, L2: string, EV: string, EVP: string, BI: string, BIP: string, Q: string;
  let doc1: string, doc2: string, review: string;
  const paths: string[] = [];

  // A real private upload owned by `u` with server-side provenance (what /api/uploads records), optionally scanned clean.
  async function upload(u: U, client: SupabaseClient) {
    const path = `${u.id}/${randomUUID()}.pdf`;
    const up = await client.storage.from("workspace-files").upload(path, PDF, { contentType: "application/pdf" });
    expect(up.error).toBeNull();
    paths.push(path);
    expect((await db.from("verified_private_uploads").insert({ path, owner_id: u.id, mime: "application/pdf", size_bytes: PDF.length, sha256: createHash("sha256").update(PDF).digest("hex") })).error).toBeNull();
    await db.from("storage_attribution").upsert({ bucket: "workspace-files", name: path, user_id: u.id, file_class: "private_document", sniffed_mime: "application/pdf" }, { onConflict: "bucket,name" });
    return path;
  }
  const scanClean = (path: string) => db.from("storage_attribution").update({ av_verdict: "clean", scan_status: "clean", scanned_at: new Date().toISOString() }).eq("bucket", "workspace-files").eq("name", path);
  const listing = async (id: string) => (await db.from("listings").select("verified,published").eq("id", id).single()).data as { verified: boolean; published: boolean };
  const creds = async (client: SupabaseClient) => ((await client.rpc("workspace_credential_status", { p_workspace: PW })).data ?? []) as { credential_key: string; status: string; blocking: boolean; reason: string | null; pending_renewal: boolean }[];
  const pl = async (client: SupabaseClient) => (await creds(client)).find(r => r.credential_key === "public_liability")!;

  test.beforeAll(async () => {
    [P, S, C, A] = await Promise.all([createUser("q08-prov"), createUser("q08-stranger"), createUser("q08-cust"), createUser("q08-admin")]);
    PW = await seedWorkspace(P.id, "provider", "Q08 Hall Co");
    SW = await seedWorkspace(S.id, "provider", "Q08 Other Co");
    await db.from("platform_admins").insert({ user_id: A.id, title: "Q08 trust admin", permissions: ["trust"] });
    L = ((await db.from("listings").insert({ workspace_id: PW, name: "Q08 Hall", kind: "venue", category: "Event Hall", published: true, review_status: "approved", verified: true }).select("id").single()).data as Id).id;
    L2 = ((await db.from("listings").insert({ workspace_id: PW, name: "Q08 Annex", kind: "venue", category: "Event Hall", published: false, description: "x".repeat(60), location: "London", details: { photos: ["a.webp"] } }).select("id").single()).data as Id).id;
    // Identity: the Stripe Connect mirror (webhook data) says verified.
    expect((await db.rpc("trust_sync_stripe_check", { p_workspace: PW, p_state: "verified", p_account: "acct_q08_test", p_evidence: {} })).error).toBeNull();
    EV = ((await db.from("events").insert({ owner_id: C.id, name: "Q08 Party", starts_at: iso(Date.now() - 3 * day), ends_at: iso(Date.now() - 3 * day + 5 * 36e5) }).select("id").single()).data as Id).id;
    EVP = ((await db.from("events").insert({ owner_id: P.id, name: "Q08 Own Party", starts_at: iso(Date.now() - 3 * day), ends_at: iso(Date.now() - 2 * day) }).select("id").single()).data as Id).id;
    BI = ((await db.from("build_items").insert({ event_id: EV, listing_id: L, category: "venue", title: "Q08 Hall hire", amount: 1000, status: "quoted" }).select("id").single()).data as Id).id;
    BIP = ((await db.from("build_items").insert({ event_id: EVP, listing_id: L, category: "venue", title: "Q08 self booking", amount: 10, status: "completed" }).select("id").single()).data as Id).id;
    [pc, sc, cc, ac] = await Promise.all([as(P), as(S), as(C), as(A)]);
    await enrolTotp(ac as unknown as Parameters<typeof enrolTotp>[0]);   // Q31: admin mutations need aal2
  });

  test.afterAll(async () => {
    const subjects = [PW, SW, L, L2, review].filter(Boolean);
    await db.from("trust_cases").delete().in("subject_id", subjects);
    await db.from("provider_quotes").delete().eq("workspace_id", PW);
    await db.from("provider_jobs").delete().in("workspace_id", [PW, SW]);
    await db.from("events").delete().in("id", [EV, EVP]);
    await db.from("workspaces").delete().in("id", [PW, SW]);
    await db.from("platform_admins").delete().eq("user_id", A.id);
    if (paths.length) await admin.storage.from("workspace-files").remove(paths);
    await cleanup();
  });

  test("badge is computed from evidence: missing insurance → no badge, cannot publish, provider-facing reason; manual writes cannot set it", async () => {
    expect((await listing(L)).verified).toBe(false);                        // inserted with verified=true, the guard recomputed it
    await db.from("listings").update({ verified: true }).eq("id", L);
    expect((await listing(L)).verified).toBe(false);
    const s = (await pc.rpc("trust_summary", { p_workspace: PW })).data as { badge: boolean; identity_verified: boolean; can_publish: boolean; blockers: { code: string; credential_key: string; reason: string }[] };
    expect(s.identity_verified).toBe(true);
    expect(s.badge).toBe(false);
    expect(s.can_publish).toBe(false);
    const b = s.blockers.find(x => x.credential_key === "public_liability")!;
    expect(b.code).toBe("credential_missing");
    expect(b.reason).toMatch(/Public liability insurance has not been provided/);
    // Outsiders get the derived badge only — never the blockers.
    const outside = (await sc.rpc("trust_summary", { p_workspace: PW })).data as Record<string, unknown>;
    expect(outside.badge).toBe(false);
    expect(outside.blockers).toBeUndefined();
    const r = (await pc.rpc("publish_listing", { p_listing: L2 })).data as { eligible: boolean; missing: string[]; trust_blockers: { reason: string }[] };
    expect(r.eligible).toBe(false);
    expect(r.missing).toContain("credentials");
    expect(r.trust_blockers.some(x => /Public liability/.test(x.reason))).toBe(true);
    expect((await listing(L2)).published).toBe(false);
  });

  test("documents stay private: other tenants and anonymous visitors cannot read rows, objects or signed access; file is sensitive + quarantined", async () => {
    const path = await upload(P, pc);
    const ins = await pc.from("provider_documents").insert({ workspace_id: PW, credential_key: "public_liability", file_path: path, file_name: "policy.pdf",
      reference: "PL-123", issuing_organisation: "Q08 Insurer", expires_on: ymd(Date.now() + 60 * day), uploaded_by: P.id, cover_amount_minor: 200_000_000, cover_currency: "GBP" } as never).select("id,status").single();
    expect(ins.error).toBeNull();
    doc1 = (ins.data as { id: string; status: string }).id;
    expect((ins.data as { status: string }).status).toBe("submitted");
    expect((await sc.from("provider_documents").select("id").eq("id", doc1)).data).toEqual([]);
    expect((await anonC().from("provider_documents").select("id").eq("id", doc1)).data ?? []).toEqual([]);
    expect((await sc.storage.from("workspace-files").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await anonC().storage.from("workspace-files").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await sc.rpc("provider_document_access", { p_document: doc1 })).error).not.toBeNull();
    expect((await anonC().rpc("provider_document_access", { p_document: doc1 })).error).not.toBeNull();
    const own = (await pc.rpc("provider_document_access", { p_document: doc1 })).data as { decision: string };
    expect(own.decision).toBe("quarantined");                               // sensitive class fails closed until ClamAV says clean
    const attr = (await db.from("storage_attribution").select("file_class").eq("name", path).single()).data as { file_class: string };
    expect(attr.file_class).toBe("sensitive");
    // Another tenant cannot submit someone else's upload as their evidence, nor reference an unverified object.
    expect((await sc.from("provider_documents").insert({ workspace_id: SW, credential_key: "public_liability", file_path: path, uploaded_by: S.id } as never)).error).not.toBeNull();
    expect((await pc.from("provider_documents").insert({ workspace_id: PW, credential_key: "public_liability", file_path: `${P.id}/${randomUUID()}.pdf`, uploaded_by: P.id } as never)).error).not.toBeNull();
  });

  test("forged state: uploads never self-verify; review needs Trust permission and a clean scan", async () => {
    await pc.from("provider_documents").update({ status: "verified" } as never).eq("id", doc1);
    expect(((await db.from("provider_documents").select("status").eq("id", doc1).single()).data as { status: string }).status).toBe("submitted");
    expect((await pc.rpc("trust_review_document", { p_document: doc1, p_status: "verified", p_reason_code: null, p_reason: "self approve" })).error?.message).toMatch(/not_authorized/);
    expect((await ac.rpc("trust_review_document", { p_document: doc1, p_status: "verified", p_reason_code: null, p_reason: "looks fine" })).error?.message).toMatch(/file_not_cleared/);
    expect((await pl(pc)).status).toBe("submitted");
  });

  test("verified, current evidence → badge true, can publish/accept; cover below minimum blocks", async () => {
    const { data: d } = await db.from("provider_documents").select("file_path").eq("id", doc1).single();
    await scanClean((d as { file_path: string }).file_path);
    // Cover below the £1m minimum: verified document but not eligible.
    expect((await ac.rpc("trust_review_document", { p_document: doc1, p_status: "verified", p_reason_code: null, p_reason: "verified", p_cover_amount_minor: 50_000_000 })).error).toBeNull();
    expect((await pl(pc)).status).toBe("insufficient_cover");
    expect((await listing(L)).verified).toBe(false);
    await db.from("provider_documents").update({ cover_amount_minor: 200_000_000 }).eq("id", doc1);
    const row = await pl(pc);
    expect(row.status).toBe("verified");
    expect(row.blocking).toBe(false);
    expect((await listing(L)).verified).toBe(true);
    const s = (await pc.rpc("trust_summary", { p_workspace: PW })).data as { badge: boolean; can_publish: boolean; can_accept: boolean };
    expect(s).toMatchObject({ badge: true, can_publish: true, can_accept: true });
  });

  test("expired insurance blocks eligibility with a reason (hidden listing, quote refused); renewal restores it", async () => {
    Q = ((await db.from("provider_quotes").insert({ workspace_id: PW, build_item_id: BI, reference: `Q08-${Date.now()}`, version: 1, status: "draft", items: [{ name: "Hire", qty: 1, unit: 1000 }], subtotal: 1000, tax: 0, total: 1000 }).select("id").single()).data as Id).id;
    await db.from("build_items").update({ status: "sent" }).eq("id", BI);
    // Time passes: the policy's expiry date is now in the past (state computed at read time, before the daily job runs).
    await db.from("provider_documents").update({ expires_on: ymd(Date.now() - day) }).eq("id", doc1);
    const row = await pl(pc);
    expect(row.status).toBe("expired");
    expect(row.reason).toMatch(/expired/);
    expect(await listing(L)).toEqual({ verified: false, published: false });
    const holds = (await pc.from("trust_listing_holds").select("source,reason_code,released_at").eq("listing_id", L)).data as { source: string; released_at: string | null }[];
    expect(holds.filter(h => !h.released_at).map(h => h.source)).toEqual(["credential_lapse"]);
    const send = await pc.rpc("provider_send_quote", { p_quote: Q });
    expect(send.error?.message).toMatch(/trust_ineligible: Public liability insurance expired/);
    const s = (await pc.rpc("trust_summary", { p_workspace: PW })).data as { badge: boolean; can_accept: boolean; lapsed: boolean };
    expect(s).toMatchObject({ badge: false, can_accept: false, lapsed: true });
    // Daily job: marks the document expired, audits, notifies the owner (once).
    expect((await db.rpc("job_trust_expiry_daily", { p_job: null })).error).toBeNull();
    expect((await db.rpc("job_trust_expiry_daily", { p_job: null })).error).toBeNull();
    expect(((await db.from("provider_documents").select("status").eq("id", doc1).single()).data as { status: string }).status).toBe("expired");
    expect(((await db.from("notifications").select("id").eq("user_id", P.id).eq("kind", "trust_document_expired")).data ?? []).length).toBe(1);
    expect(((await db.from("audit_events").select("id").eq("workspace_id", PW).eq("event", "trust.document_expired")).data ?? []).length).toBe(1);

    // Renewal: new document (linked to the lapsed one), scanned, verified → listing restored and quote can be sent.
    const path = await upload(P, pc);
    const ins = await pc.from("provider_documents").insert({ workspace_id: PW, credential_key: "public_liability", file_path: path, file_name: "renewal.pdf",
      expires_on: ymd(Date.now() + 365 * day), uploaded_by: P.id, cover_amount_minor: 500_000_000 } as never).select("id").single();
    doc2 = (ins.data as Id).id;
    expect((await pl(pc)).pending_renewal).toBe(true);
    await scanClean(path);
    expect((await ac.rpc("trust_review_document", { p_document: doc2, p_status: "verified", p_reason_code: null, p_reason: "renewed" })).error).toBeNull();
    expect((await pl(pc)).status).toBe("verified");
    expect(await listing(L)).toEqual({ verified: true, published: true });
    expect(((await db.from("provider_documents").select("status,superseded_by").eq("id", doc1).single()).data as { status: string; superseded_by: string }))
      .toEqual({ status: "superseded", superseded_by: doc2 });
    expect((await pc.rpc("provider_send_quote", { p_quote: Q })).error).toBeNull();
  });

  test("expiry reminders: one notification per threshold, never duplicated", async () => {
    await db.from("provider_documents").update({ expires_on: ymd(Date.now() + 10 * day) }).eq("id", doc2);
    for (let i = 0; i < 2; i++) expect((await db.rpc("job_trust_expiry_daily", { p_job: null })).error).toBeNull();
    const n = (await db.from("notifications").select("title").eq("user_id", P.id).eq("kind", "trust_document_expiring")).data as { title: string }[];
    expect(n.length).toBe(1);
    expect(n[0].title).toMatch(/expires in 10 days/);
    await db.from("provider_documents").update({ expires_on: ymd(Date.now() + 365 * day), last_reminder_days: null }).eq("id", doc2);
  });

  test("verification state machine: illegal transitions rejected, submit → review → verified with history, permissions enforced", async () => {
    const sub = await pc.rpc("trust_submit_verification", { p_workspace: PW, p_kind: "business", p_details: { legal_name: "Q08 Hall Co Ltd", company_number: "12345678", beneficial_owners: [{ name: "P Owner" }] } });
    expect(sub.error).toBeNull();
    const check = (sub.data as { check_id: string }).check_id;
    expect((await sc.rpc("trust_submit_verification", { p_workspace: PW, p_kind: "business", p_details: { legal_name: "Hijack Ltd" } })).error?.message).toMatch(/not_authorized/);
    expect((await sc.from("verification_checks").select("id").eq("id", check)).data).toEqual([]);
    expect((await pc.rpc("trust_review_verification", { p_check: check, p_to: "verified", p_reason_code: null, p_reason: "self verify" })).error?.message).toMatch(/not_authorized/);
    // submitted → verified skips review: illegal (command and direct write both refused).
    expect((await ac.rpc("trust_review_verification", { p_check: check, p_to: "verified", p_reason_code: null, p_reason: "skip review" })).error?.message).toMatch(/illegal verification transition submitted -> verified/);
    expect((await db.from("verification_checks").update({ status: "verified" }).eq("id", check)).error?.message).toMatch(/illegal verification transition/);
    expect((await db.rpc("transition_state", { p_machine: "verification", p_id: check, p_to: "suspended" })).error?.message).toMatch(/illegal/);
    expect((await ac.rpc("trust_review_verification", { p_check: check, p_to: "pending_review", p_reason_code: null, p_reason: "picked up" })).error).toBeNull();
    expect((await ac.rpc("trust_review_verification", { p_check: check, p_to: "verified", p_reason_code: null, p_reason: "Companies House match" })).error).toBeNull();
    const hist = (await pc.from("verification_records").select("status,from_status").eq("check_id", check).order("created_at")).data as { status: string; from_status: string }[];
    expect(hist.map(h => `${h.from_status}->${h.status}`)).toEqual(["unverified->submitted", "submitted->pending_review", "pending_review->verified"]);
    // Re-submitting changed details on a verified check is a refresh: back to review, not a silent edit.
    expect(((await pc.rpc("trust_submit_verification", { p_workspace: PW, p_kind: "business", p_details: { legal_name: "Q08 Hall Co Ltd (renamed)" } })).data as { to: string }).to).toBe("pending_review");
    const ev = (await db.from("domain_outbox").select("event_type").eq("aggregate_id", check)).data as { event_type: string }[];
    expect(ev.filter(e => e.event_type === "verification.state_changed").length).toBe(4);
  });

  test("reviews: only after a completed booking, one per booking, never by the provider's own team; provider can respond", async () => {
    const body = "Great venue, smooth load-in and helpful staff throughout.";
    expect((await cc.rpc("submit_review", { p_item: BI, p_rating: 5, p_ratings: { quality: 5 }, p_body: body, p_photos: [] })).error?.message).toMatch(/not_completed/);
    await db.from("build_items").update({ status: "completed" }).eq("id", BI);
    expect((await sc.rpc("submit_review", { p_item: BI, p_rating: 1, p_ratings: {}, p_body: body, p_photos: [] })).error?.message).toMatch(/not_authorized/);
    const first = await cc.rpc("submit_review", { p_item: BI, p_rating: 5, p_ratings: { quality: 5, value: 4 }, p_body: body, p_photos: [] });
    expect(first.error).toBeNull();
    review = first.data as string;
    const again = await cc.rpc("submit_review", { p_item: BI, p_rating: 4, p_ratings: {}, p_body: body + " Updated.", p_photos: [] });
    expect(again.data).toBe(review);                                         // edit of the same review, not a second one
    expect(((await db.from("reviews").select("id").eq("build_item_id", BI)).data ?? []).length).toBe(1);
    expect((await cc.rpc("submit_review", { p_item: BI, p_rating: 4, p_ratings: { bogus: 9 }, p_body: body, p_photos: [] })).error?.message).toMatch(/invalid_ratings/);
    expect((await pc.rpc("submit_review", { p_item: BIP, p_rating: 5, p_ratings: {}, p_body: "Our own venue is the best one around, honestly.", p_photos: [] })).error?.message).toMatch(/self_review/);
    expect((await pc.rpc("respond_to_review", { p_review: review, p_body: "Thank you for hosting with us!" })).error).toBeNull();
    expect((await sc.rpc("respond_to_review", { p_review: review, p_body: "Not my listing" })).error).not.toBeNull();
  });

  test("moderation: report with reason code → case; enforcement with evidence; appeal once; overturn reverses; reliability ignores removed reviews", async () => {
    const before = ((await db.from("listings").select("review_count").eq("id", L).single()).data as { review_count: number }).review_count;
    expect((await sc.rpc("report_review", { p_review: review, p_reason_code: "not_a_code", p_note: "" })).error?.message).toMatch(/invalid_reason_code/);
    expect((await cc.rpc("report_review", { p_review: review, p_reason_code: "fake_review", p_note: "" })).error?.message).toMatch(/cannot_report_own_review/);
    expect((await sc.rpc("report_review", { p_review: review, p_reason_code: "fake_review", p_note: "Looks staged" })).error).toBeNull();
    expect((await sc.rpc("report_review", { p_review: review, p_reason_code: "spam", p_note: "" })).error?.message).toMatch(/already_reported/);
    const kase = (await db.from("trust_cases").select("id,queue,status").eq("subject_id", review).single()).data as { id: string; queue: string };
    expect(kase.queue).toBe("fraud");
    expect(((await db.from("reviews").select("status").eq("id", review).single()).data as { status: string }).status).toBe("published");   // no auto-hide

    expect((await sc.rpc("trust_enforce", { p_subject_type: "review", p_subject_id: review, p_action: "review_removed", p_reason_code: "fake_review", p_note: "Not genuine" })).error?.message).toMatch(/not_authorized/);
    expect((await ac.rpc("trust_enforce", { p_subject_type: "review", p_subject_id: review, p_action: "review_removed", p_reason_code: "misleading_listing", p_note: "Wrong code" })).error?.message).toMatch(/invalid_reason_code/);
    const act = await ac.rpc("trust_enforce", { p_subject_type: "review", p_subject_id: review, p_action: "review_removed", p_reason_code: "fake_review",
      p_note: "Reviewer linked to the venue", p_evidence: [{ kind: "note", label: "IP overlap" }], p_case: kase.id });
    expect(act.error).toBeNull();
    const actionId = act.data as string;
    expect(((await db.from("reviews").select("status").eq("id", review).single()).data as { status: string }).status).toBe("removed");
    expect(((await db.from("listings").select("review_count").eq("id", L).single()).data as { review_count: number }).review_count).toBe(before - 1);
    expect(((await cc.from("enforcement_actions").select("reason_code,appeal_deadline").eq("id", actionId).single()).data as { reason_code: string }).reason_code).toBe("fake_review");
    expect((await sc.from("enforcement_actions").select("id").eq("id", actionId)).data).toEqual([]);

    expect((await sc.rpc("trust_appeal", { p_action: actionId, p_statement: "I am not the author but want this back." })).error?.message).toMatch(/not_found/);
    const appeal = await cc.rpc("trust_appeal", { p_action: actionId, p_statement: "I really attended this event; here is my ticket reference." });
    expect(appeal.error).toBeNull();
    expect((await cc.rpc("trust_appeal", { p_action: actionId, p_statement: "Appealing a second time to be sure it lands." })).error?.message).toMatch(/already_appealed/);
    expect((await ac.rpc("trust_decide_appeal", { p_case: appeal.data, p_outcome: "overturned", p_reason: "Ticket verified" })).error).toBeNull();
    expect(((await db.from("reviews").select("status").eq("id", review).single()).data as { status: string }).status).toBe("published");
    expect(((await db.from("enforcement_actions").select("status").eq("id", actionId).single()).data as { status: string }).status).toBe("overturned");
    expect(((await db.from("audit_events").select("event").eq("workspace_id", PW).in("event", ["trust.enforcement_applied", "trust.appeal_opened", "trust.enforcement_lifted"])).data ?? []).length).toBe(3);
  });

  test("workspace suspension blocks acceptance and hides listings until lifted; tenant sees the reason, others do not", async () => {
    const act = await ac.rpc("trust_enforce", { p_subject_type: "workspace", p_subject_id: PW, p_action: "workspace_suspended", p_reason_code: "fraud_suspected", p_note: "Chargeback pattern under review" });
    expect(act.error).toBeNull();
    expect(await listing(L)).toEqual({ verified: false, published: false });
    expect(((await pc.rpc("trust_summary", { p_workspace: PW })).data as { can_accept: boolean; suspended: boolean })).toMatchObject({ can_accept: false, suspended: true });
    expect(((await pc.from("enforcement_actions").select("note").eq("id", act.data as string).single()).data as { note: string }).note).toMatch(/Chargeback/);
    expect((await sc.from("enforcement_actions").select("id").eq("id", act.data as string)).data).toEqual([]);
    expect((await ac.rpc("trust_lift_enforcement", { p_action: act.data, p_reason: "Cleared after review" })).error).toBeNull();
    expect(await listing(L)).toEqual({ verified: true, published: true });
  });

  test("reliability: versioned, explainable snapshot; sponsored/ads never inputs; team reviews excluded", async () => {
    const r = (await db.rpc("reliability_compute", { p_workspace: PW })).data as { formula_version: number; band: string; components: Record<string, { included: boolean }> };
    expect(r.formula_version).toBe(1);
    expect(Object.keys(r.components).sort()).toEqual(["arrival", "cancellation", "completion_rate", "dispute", "response_rate", "response_time", "review_score"]);
    const explain = (await pc.rpc("reliability_explain", { p_workspace: PW })).data as { excluded: Record<string, unknown>; formula: string };
    expect(explain.excluded.sponsored_or_ads).toBe("never an input");
    expect((await sc.rpc("reliability_explain", { p_workspace: PW })).data).toBeNull();
    expect((await pc.rpc("reliability_compute", { p_workspace: PW })).error).not.toBeNull();     // service-only
    expect((await db.from("reliability_formulas").update({ weights: {} }).eq("version", 1)).error?.message).toMatch(/append_only/);
  });
});
