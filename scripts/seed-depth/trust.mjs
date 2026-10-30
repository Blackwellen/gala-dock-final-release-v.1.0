// Q08 (trust & verification) for the demo provider workspaces, through the real flow:
//   1. the provider owner (signed in) uploads a GENERATED placeholder PDF to its own folder in workspace-files — never a real
//      document — and the service role records the upload provenance (verified_private_uploads + storage_attribution, what
//      /api/uploads records) and, as the Q04 fixture, the ClamAV verdict "clean" (the shared gateway is not configured yet;
//      this mirrors tests/trust/trust-verification.spec.ts scanClean). Direct writes: those two fixture rows only.
//   2. the owner submits provider_documents (guard re-classes the file as sensitive, status submitted);
//   3. the platform-admin demo (trust permission, aal2) reviews it with trust_review_document → verified;
//   4. business check: trust_submit_verification (owner) → trust_review_verification pending_review → verified (admin);
//   5. listing review: admin_review_listing approve (marketplace permission) for the demo listings still pending;
//   6. reliability_compute (the trust.reliability_daily handler, service-only) per demo provider workspace;
//   7. an enforcement (warning) on Premier Event Services with an appeal by the provider (left open for the admin queue);
//   8. a review report (report_review) by the demo organiser on a duplicate review.
// Public liability ≥ £1m everywhere; food hygiene for the caterers; security licences for the security/staffing providers;
// Northern Crew's SIA licence expires in 21 days (the "expiring within 30 days" demo).
import { randomUUID, createHash } from "node:crypto";
import { sql } from "./lib.mjs";
import { service, signIn, call, placeholderPdf } from "./auth.mjs";

const ADMIN = "admin.demo@example.com";
const day = 864e5, ymd = ms => new Date(ms).toISOString().slice(0, 10);
const WS = [
  { name: "Riverside Arena", owner: "provider.demo@example.com", legal: "Riverside Arena Venues Ltd (demo)", docs: [
    ["public_liability", "Hiscox Events (demo)", "PL-RVA-5M-2026", 400, 500_000_000], ["food_hygiene", "Southwark Council FHRS (demo)", "FHRS-5-RVA-0412", 300, null],
    ["premises_licence", "Southwark Licensing (demo)", "PL-SE1-0412", 720, null], ["fire_safety", "Thames Fire Engineers (demo)", "FRA-RVA-2026", 330, null]] },
  { name: "Premier Event Services", owner: "provider.demo@example.com", legal: "Premier Event Services Ltd (demo)", docs: [
    ["public_liability", "Markel UK (demo)", "PL-PES-2M-2026", 365, 200_000_000], ["food_hygiene", "Westminster FHRS (demo)", "FHRS-5-PES-1180", 280, null],
    ["security_licence", "Security Industry Authority — ACS (demo)", "SIA-ACS-PES-7731", 300, null], ["electrical_safety", "NICEIC PAT (demo)", "PAT-PES-2026", 200, null]] },
  { name: "London Venue Collective", owner: "provider.demo@example.com", legal: "London Venue Collective Ltd (demo)", docs: [
    ["public_liability", "Hiscox Events (demo)", "PL-LVC-10M-2026", 410, 1_000_000_000], ["premises_licence", "City of London Licensing (demo)", "PL-EC-2210", 700, null],
    ["fire_safety", "Capital Fire Risk (demo)", "FRA-LVC-2026", 300, null]] },
  { name: "Mia Rossi Photography", owner: "solo.supplier.demo@example.com", legal: "Mia Rossi (sole trader, demo)", docs: [
    ["public_liability", "Photoguard (demo)", "PL-MRP-1M-2026", 250, 100_000_000]] },
  { name: "Northern Crew Agency", owner: "agency.demo@example.com", legal: "Northern Crew Agency Ltd (demo)", docs: [
    ["public_liability", "Hiscox Events (demo)", "PL-NCA-5M-2026", 330, 500_000_000], ["security_licence", "Security Industry Authority — ACS (demo)", "SIA-ACS-NCA-2204", 21, null]] },
];

async function wsId(name, owner) {
  return (await sql(`select w.id from public.workspaces w where w.name = '${name.replace(/'/g, "''")}' and w.owner_id = (select id from auth.users where email = '${owner}') limit 1`))[0]?.id;
}

export async function run() {
  const out = { documents_verified: 0, business_checks_verified: 0, listings_approved: 0, reliability_snapshots: 0, enforcements: 0, appeals: 0, review_reports: 0 };
  const admin = await signIn(ADMIN);
  for (const w of WS) {
    const id = await wsId(w.name, w.owner);
    if (!id) { out.missing_workspace = (out.missing_workspace ?? 0) + 1; continue; }
    const owner = await signIn(w.owner);
    for (const [key, issuer, ref, days, cover] of w.docs) {
      const have = (await sql(`select id, status from public.provider_documents where workspace_id = '${id}' and credential_key = '${key}' and reference = '${ref}' order by created_at desc limit 1`))[0];
      let docId = have?.id;
      if (!have) {
        const pdf = placeholderPdf(`${w.legal} — ${key.replace(/_/g, " ")}`, [`Issuer: ${issuer}`, `Reference: ${ref}`, `Valid to: ${ymd(Date.now() + days * day)}`,
          cover ? `Cover: GBP ${(cover / 100).toLocaleString("en-GB")}` : ""]);
        const path = `${owner.uid}/${randomUUID()}.pdf`, sha = createHash("sha256").update(pdf).digest("hex");
        const up = await owner.storage.from("workspace-files").upload(path, pdf, { contentType: "application/pdf" });
        if (up.error) throw new Error(`upload ${key}: ${up.error.message}`);
        let e = (await service.from("verified_private_uploads").insert({ path, owner_id: owner.uid, mime: "application/pdf", size_bytes: pdf.length, sha256: sha })).error;
        if (e) throw new Error(`verified_private_uploads: ${e.message}`);
        e = (await service.from("storage_attribution").upsert({ bucket: "workspace-files", name: path, user_id: owner.uid, workspace_id: id, file_class: "private_document",
          sniffed_mime: "application/pdf", declared_mime: "application/pdf", sha256: sha, size_bytes: pdf.length, display_name: `demo-${key.replace(/_/g, "-")}.pdf` }, { onConflict: "bucket,name" })).error;
        if (e) throw new Error(`storage_attribution: ${e.message}`);
        const ins = await owner.from("provider_documents").insert({ workspace_id: id, credential_key: key, file_path: path, file_name: `demo-${key.replace(/_/g, "-")}.pdf`,
          reference: ref, issuing_organisation: issuer, effective_from: ymd(Date.now() - 30 * day), expires_on: ymd(Date.now() + days * day), uploaded_by: owner.uid,
          ...(cover ? { cover_amount_minor: cover, cover_currency: "GBP" } : {}) }).select("id").single();
        if (ins.error) throw new Error(`provider_documents ${key}: ${ins.error.message}`);
        docId = ins.data.id;
        // Q04 fixture: the clean ClamAV verdict (gateway not configured in this environment).
        e = (await service.from("storage_attribution").update({ av_verdict: "clean", scan_status: "clean", scanned_at: new Date().toISOString(), scan_detail: "demo fixture (Q38): generated placeholder PDF" })
          .eq("bucket", "workspace-files").eq("name", path)).error;
        if (e) throw new Error(`scan fixture: ${e.message}`);
      }
      if (!have || have.status !== "verified") {
        await call(admin, "trust_review_document", { p_document: docId, p_status: "verified", p_reason_code: null, p_reason: "Demo evidence checked (placeholder PDF)" });
        out.documents_verified++;
      }
    }
    const chk = (await sql(`select id, status from public.verification_checks where workspace_id = '${id}' and subject_type = 'workspace' and kind = 'business' limit 1`))[0];
    if (!chk || chk.status !== "verified") {
      let check = chk?.id;
      if (!chk || chk.status === "unverified") {
        const r = await call(owner, "trust_submit_verification", { p_workspace: id, p_kind: "business", p_details: { legal_name: w.legal, trading_name: w.name,
          company_number: `DEMO${String(WS.indexOf(w) + 1).padStart(4, "0")}`, address: "Demo address, London", beneficial_owners: [{ name: "Demo owner (example.com)" }] } });
        check = r.check_id;
      }
      const st = (await sql(`select status from public.verification_checks where id = '${check}'`))[0].status;
      if (st === "submitted") await call(admin, "trust_review_verification", { p_check: check, p_to: "pending_review", p_reason_code: null, p_reason: "Demo business check picked up" });
      await call(admin, "trust_review_verification", { p_check: check, p_to: "verified", p_reason_code: null, p_reason: "Demo business details match the placeholder evidence" });
      out.business_checks_verified++;
    }
    for (const l of await sql(`select id from public.listings where workspace_id = '${id}' and review_status = 'pending' and published`)) {
      await call(admin, "admin_review_listing", { p_listing: l.id, p_decision: "approve", p_reason: "demo: evidence seeded and listing content reviewed" });
      out.listings_approved++;
    }
    const snap = (await sql(`select count(*)::int n from public.reliability_snapshots where workspace_id = '${id}'`))[0].n;
    if (!snap) { await call(service, "reliability_compute", { p_workspace: id }); out.reliability_snapshots++; }
  }

  // Enforcement + appeal: a warning on Premier Event Services (late arrivals), appealed by the provider owner.
  const premier = await wsId("Premier Event Services", "provider.demo@example.com");
  let act = (await sql(`select id, appeal_case_id from public.enforcement_actions where subject_type = 'workspace' and subject_id = '${premier}' and action = 'warning' and note like 'Demo:%' limit 1`))[0];
  if (!act) {
    const id = await call(admin, "trust_enforce", { p_subject_type: "workspace", p_subject_id: premier, p_action: "warning", p_reason_code: "other_policy",
      p_note: "Demo: crew arrived after the agreed arrival window at two September events.", p_evidence: [{ kind: "note", label: "Two late-arrival reports from organisers" }] });
    act = { id, appeal_case_id: null }; out.enforcements++;
  }
  if (!act.appeal_case_id) {
    await call(await signIn("provider.demo@example.com"), "trust_appeal", { p_action: act.id,
      p_statement: "Both delays were caused by venue load-in changes communicated on the day; we have the organiser messages to show it." });
    out.appeals++;
  }
  // Review report: the duplicate 5-star review on Gourmet Catering Co, reported as spam/duplicate by the demo organiser.
  const rev = (await sql(`select r.id from public.reviews r join public.listings l on l.id = r.listing_id where l.slug = 'gourmet-catering-co'
      and r.user_id = (select id from auth.users where email = 'james.carter@example.com') order by r.created_at desc limit 1`))[0];
  if (rev && !(await sql(`select 1 from public.review_reports where review_id = '${rev.id}' and reporter_id = (select id from auth.users where email = 'alex.events@example.com')`)).length) {
    await call(await signIn("alex.events@example.com"), "report_review", { p_review: rev.id, p_reason_code: "spam", p_note: "Demo: second near-identical review from the same reviewer." });
    out.review_reports++;
  }
  return out;
}
