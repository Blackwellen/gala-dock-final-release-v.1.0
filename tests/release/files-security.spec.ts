import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, PASSWORD, seedWorkspace } from "../phase1/helpers";
import { sessionCookies } from "../../scripts/lib/stripe-test-mode.mjs";
import { accessDecision, isOwnedKey, safeFileName, sniff, tenantKey, validateUpload, type AvVerdict, type FileClass, type ScanStatus } from "../../src/lib/files/policy";
import { sanitize, scanWith } from "../../src/lib/files/safety-core";
import { presignR2 } from "../../src/lib/files/presign";

// Q04 Files, R2 & Malware (migrations 202610291017/1018). Exit gate: hostile upload fixtures cannot become publicly accessible or
// downloadable without a clean verdict. Unit rules + the running app (:3107) + the shared project. EICAR appears ONLY inside a mocked
// scanner reply; no real malware bytes are uploaded anywhere. The ClamAV gateway is not configured locally (BLOCKED_EXTERNAL).
const db = admin as unknown as SupabaseClient;
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: (Uint8Array | number[])[]) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// 1×1 transparent PNG (valid, decodable by sharp).
const PNG_1PX = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
/** JPEG whose APP1 (EXIF) segment carries a fake GPS marker string — must be stripped before the file is public. */
function jpegWithExif(secret = "GPS51.5007N0.1246W-SECRET") {
  const exif = cat(enc("Exif\0\0"), enc(secret));
  const len = exif.length + 2;
  return cat([0xff, 0xd8], [0xff, 0xe1, len >> 8, len & 255], exif, [0xff, 0xdb, 0x00, 0x04, 0x00, 0x00], [0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x11, 0x22], [0xff, 0xd9]);
}
const form = (bytes: Uint8Array, name: string, type: string, fields: Record<string, string>) => {
  const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); f.set("file", new File([new Uint8Array(bytes)], name, { type })); return f;
};

test.describe("Q04 file rules (unit)", () => {
  test("magic bytes win over names/declared types; polyglots, mismatches, oversize and empty files are refused", () => {
    expect(sniff(PNG_1PX)?.type).toBe("image/png");
    expect(sniff(enc("<html><script>alert(1)</script></html>"))).toBeNull();
    const base = { fileClass: "public_media" as FileClass, allowed: ["image/png", "image/jpeg", "image/webp"] };
    expect(validateUpload({ ...base, bytes: enc("<html><script>alert(1)</script>"), declaredType: "image/png" })).toMatchObject({ ok: false, code: "unknown_type", status: 415 });
    expect(validateUpload({ ...base, bytes: cat(PNG_SIG, enc("<script>alert(document.cookie)</script>")), declaredType: "image/png" })).toMatchObject({ ok: false, code: "polyglot" });
    expect(validateUpload({ ...base, bytes: PNG_1PX, declaredType: "image/jpeg" })).toMatchObject({ ok: false, code: "mime_mismatch" });
    expect(validateUpload({ ...base, bytes: enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), declaredType: "image/svg+xml", allowed: [...base.allowed, "image/svg+xml"] })).toMatchObject({ ok: false, code: "type_not_allowed" });   // never SVG in public
    expect(validateUpload({ ...base, bytes: new Uint8Array(10 * 1024 * 1024 + 1), declaredType: "image/png" })).toMatchObject({ ok: false, code: "too_large", status: 413 });
    expect(validateUpload({ ...base, bytes: new Uint8Array(0) })).toMatchObject({ ok: false, code: "empty" });
    expect(validateUpload({ ...base, bytes: PNG_1PX, declaredType: "image/png" })).toMatchObject({ ok: true, kind: { type: "image/png", ext: "png" } });
  });

  test("SVG with script / handlers / external refs and PDFs with JavaScript are refused; EXIF is stripped", () => {
    for (const svg of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><a href="javascript:alert(1)">x</a></svg>',
      '<svg><foreignObject><iframe src="https://x"/></foreignObject></svg>', '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>', '<svg><image href="https://evil.test/x.png"/></svg>'])
      expect(sanitize(enc(svg), "image/svg+xml")).toMatchObject({ ok: false, reason: "active_content" });
    const ok = sanitize(enc('<svg xmlns="http://www.w3.org/2000/svg"><!-- c --><metadata>m</metadata><rect width="1" height="1"/></svg>'), "image/svg+xml");
    expect(ok.ok && new TextDecoder().decode(ok.bytes)).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
    expect(sanitize(enc("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"), "application/pdf")).toMatchObject({ ok: false, reason: "active_content" });
    const j = sanitize(jpegWithExif(), "image/jpeg");
    expect(j.ok).toBe(true);
    expect(Buffer.from(j.ok ? j.bytes : []).includes("SECRET")).toBe(false);
  });

  test("malware gateway contract: EICAR verdict = infected; errors, timeouts and malformed replies fail closed", async () => {
    const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";   // only ever inside this mocked reply path
    const cfg = { url: "https://av.test", token: "t" };
    expect(await scanWith({ ...cfg, fetchImpl: reply(200, { clean: false, signature: "Eicar-Test-Signature" }) }, enc(eicar))).toMatchObject({ ok: false, reason: "infected", detail: "Eicar-Test-Signature" });
    expect(await scanWith({ ...cfg, fetchImpl: reply(200, { clean: true }) }, PNG_1PX)).toMatchObject({ ok: true });
    expect(await scanWith({ ...cfg, fetchImpl: reply(500, { clean: true }) }, PNG_1PX)).toMatchObject({ ok: false, reason: "scanner_unavailable" });
    expect(await scanWith({ ...cfg, fetchImpl: reply(200, { verdict: "ok" }) }, PNG_1PX)).toMatchObject({ ok: false, reason: "scanner_unavailable" });
    expect(await scanWith({ ...cfg, fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch }, PNG_1PX)).toMatchObject({ ok: false, reason: "scanner_unavailable" });
  });

  test("path traversal names are neutralised; keys are owner/tenant scoped; presigned URLs are single-key and short-lived", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("..\\..\\windows\\win.ini")).toBe("win.ini");
    expect(safeFileName("a\0b<>.pdf")).toBe("ab__.pdf");
    expect(safeFileName("....")).toBe("file");
    const me = randomUUID(), other = randomUUID(), f = randomUUID();
    expect(isOwnedKey(`${me}/${f}.pdf`, me)).toBe(true);
    for (const k of [`${other}/${f}.pdf`, `${me}/../${other}/${f}.pdf`, `/${me}/${f}.pdf`, `${me}//${f}.pdf`, `${me}\\${f}.pdf`, `${me}/${f}.html`]) expect(isOwnedKey(k, me)).toBe(false);
    expect(tenantKey({ workspaceId: other, ownerId: me, fileId: f, ext: "pdf" })).toBe(`t/${other}/${me}/${f}.pdf`);
    expect(() => tenantKey({ workspaceId: null, ownerId: "../x", fileId: f, ext: "pdf" })).toThrow();
    const creds = { endpoint: "https://acc.r2.cloudflarestorage.com", bucket: "b", accessKeyId: "AK", secretAccessKey: "SK" };
    const p = presignR2(creds, { method: "GET", key: `t/${other}/${me}/${f}.pdf`, expiresSeconds: 99999, now: new Date("2026-10-28T12:00:00Z") });
    expect(p.url).toContain(`/b/t/${other}/${me}/${f}.pdf?`);
    expect(p.url).toContain("X-Amz-Expires=900");                       // capped at 15 minutes
    expect(p.expiresAt).toBe("2026-10-28T12:15:00.000Z");
    expect(() => presignR2(creds, { method: "GET", key: "../secret" })).toThrow("invalid_key");
  });

  test("quarantine decision: documents/sensitive fail closed without a clean verdict; images usable when sanitised", () => {
    const d = (fileClass: FileClass, mime: string, av: AvVerdict, scan: ScanStatus, deleted = false) => accessDecision({ fileClass, mime, av, scan, deleted });
    expect(d("private_document", "application/pdf", "not_scanned", "sanitised")).toBe("quarantined");
    expect(d("sensitive", "image/png", "not_scanned", "sanitised")).toBe("quarantined");
    expect(d("private_document", "application/pdf", "clean", "clean")).toBe("ok");
    expect(d("private_image", "image/png", "not_scanned", "sanitised")).toBe("ok");
    expect(d("private_image", "image/png", "pending", "pending")).toBe("pending");
    expect(d("public_media", "image/png", "infected", "infected")).toBe("infected");
    expect(d("private_document", "application/pdf", "clean", "quarantined")).toBe("quarantined");
    expect(d("legacy", "application/pdf", "not_scanned", "skipped")).toBe("quarantined");
    expect(d("legacy", "image/svg+xml", "not_scanned", "skipped")).toBe("ok");
    expect(d("private_image", "image/png", "clean", "clean", true)).toBe("deleted");
  });
});

test.describe("Q04 hostile uploads against the app + database", () => {
  test.describe.configure({ mode: "serial" });
  let owner: { id: string; email: string }, other: { id: string; email: string }, ws: string, otherWs: string, cookie: string, otherCookie: string;
  const fixtures: { bucket: string; name: string }[] = [];
  test.beforeAll(async () => {
    owner = await createUser("q04-o"); other = await createUser("q04-x");
    ws = await seedWorkspace(owner.id, "organizer", "Q04 Files Org"); otherWs = await seedWorkspace(other.id, "organizer", "Q04 Other Org");
    cookie = (await sessionCookies(owner.email, PASSWORD)).cookie; otherCookie = (await sessionCookies(other.email, PASSWORD)).cookie;
  });
  test.afterAll(async () => {
    for (const f of fixtures) { await db.storage.from(f.bucket).remove([f.name]); await db.from("storage_attribution").delete().eq("bucket", f.bucket).eq("name", f.name); await db.from("file_tombstones").delete().eq("bucket", f.bucket).eq("name", f.name); }
    for (const w of [ws, otherWs]) await db.from("workspaces").delete().eq("id", w);
    await cleanup();
  });
  const post = (path: string, body: FormData, c = cookie) => fetch(`${BASE}${path}`, { method: "POST", body, headers: { cookie: c } });

  test("private uploads: hostile fixtures refused before storage; display names sanitised", async () => {
    const cases: [Uint8Array, string, string, string, number][] = [
      [enc("<html><script>alert(1)</script></html>"), "x.png", "image/png", "image", 415],                    // HTML pretending to be PNG
      [cat(PNG_SIG, enc("<script>alert(1)</script>")), "poly.png", "image/png", "image", 422],                  // PNG/HTML polyglot
      [PNG_1PX, "real.jpg", "image/jpeg", "image", 415],                                                        // mismatched MIME
      [enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "s.svg", "image/svg+xml", "element", 422],
      [enc("%PDF-1.7\n<< /OpenAction << /S /JavaScript /JS (x) >> >>"), "a.pdf", "application/pdf", "document", 422],
      [cat(PNG_1PX, new Uint8Array(10 * 1024 * 1024)), "big.png", "image/png", "image", 413],
    ];
    for (const [bytes, name, type, purpose, status] of cases) {
      const r = await post("/api/uploads", form(bytes, name, type, { purpose }));
      if (name === "big.png") expect([400, 413], name).toContain(r.status);   // the platform body limit may cut the form first (400) — refused either way
      else expect(r.status, `${name}`).toBe(status);
    }
    const { count } = await db.from("storage_attribution").select("name", { count: "exact", head: true }).eq("bucket", "workspace-files").like("name", `${owner.id}/%`);
    expect(count ?? 0).toBe(0);                                                                                 // nothing was stored
  });

  test("a clean PDF is stored but quarantined (no gateway): owner gets 423, others 404, anon 401; clean verdict releases; infected → 410", async () => {
    const r = await post("/api/uploads", form(enc("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF"), "../../etc/passwd.pdf", "application/pdf", { purpose: "document" }));
    expect(r.status).toBe(200);
    const j = await r.json() as { path: string; name: string; status: string };
    fixtures.push({ bucket: "workspace-files", name: j.path });
    expect(j.name).toBe("passwd.pdf"); expect(j.status).toBe("checking");
    const row = (await db.from("storage_attribution").select("file_class,av_verdict,scan_status,sha256,sniffed_mime,display_name").eq("bucket", "workspace-files").eq("name", j.path).single()).data;
    expect(row).toMatchObject({ file_class: "private_document", av_verdict: "not_scanned", scan_status: "quarantined", sniffed_mime: "application/pdf", display_name: "passwd.pdf" });
    expect(row!.sha256).toMatch(/^[a-f0-9]{64}$/);
    const signed = (c?: string) => fetch(`${BASE}/api/files/signed?path=${encodeURIComponent(j.path)}`, { headers: c ? { cookie: c } : {}, redirect: "manual" });
    expect((await signed(cookie)).status).toBe(423);
    expect((await signed(otherCookie)).status).toBe(404);
    expect((await signed()).status).toBe(401);
    expect((await fetch(`${BASE}/api/files/signed?path=${encodeURIComponent(`${owner.id}/../${other.id}/x.pdf`)}`, { headers: { cookie } })).status).toBe(404);
    // Simulated gateway verdict (service role) — what files.scan records once ClamAV is reachable.
    expect((await db.rpc("file_record_verdict", { p_bucket: "workspace-files", p_name: j.path, p_verdict: "clean", p_detail: "q04-test" })).data).toBe("ok");
    const ok = await signed(cookie); expect(ok.status).toBe(200);
    const url = ((await ok.json()) as { url: string }).url; expect(url).toMatch(/token=/);
    expect((await signed(otherCookie)).status).toBe(404);                                                         // still owner-scoped
    expect((await db.rpc("file_record_verdict", { p_bucket: "workspace-files", p_name: j.path, p_verdict: "infected", p_detail: "Eicar-Test-Signature (mock)" })).data).toBe("infected");
    expect((await signed(cookie)).status).toBe(410);
    // The private bucket itself is never public: an unsigned object URL is refused.
    const pub = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/workspace-files/${j.path}`);
    expect(pub.ok).toBe(false);
  });

  test("public media: only via the server; EXIF stripped; SVG / HTML-as-PNG / polyglot refused; non-members refused", async () => {
    expect((await post("/api/files/public-media", form(enc("<html><script>1</script>"), "x.png", "image/png", { workspace: ws }))).status).toBe(415);
    expect((await post("/api/files/public-media", form(cat(PNG_SIG, enc("<script>1</script>")), "p.png", "image/png", { workspace: ws }))).status).toBe(422);
    expect((await post("/api/files/public-media", form(enc('<svg xmlns="http://www.w3.org/2000/svg"/>'), "s.svg", "image/svg+xml", { workspace: ws }))).status).toBe(415);
    expect((await post("/api/files/public-media", form(PNG_1PX, "a.png", "image/png", { workspace: ws }), otherCookie)).status).toBe(403);   // not a member
    const r = await post("/api/files/public-media", form(jpegWithExif(), "../photo.jpg", "image/jpeg", { workspace: ws }));
    expect(r.status).toBe(200);
    const j = await r.json() as { path: string; url: string };
    fixtures.push({ bucket: "event-media", name: j.path });
    expect(j.path.startsWith(`${ws}/`)).toBe(true);
    const served = Buffer.from(await (await fetch(j.url)).arrayBuffer());
    expect(served.length).toBeGreaterThan(0);
    expect(served.includes("SECRET")).toBe(false);                                                                // GPS/EXIF never public
    const row = (await db.from("storage_attribution").select("file_class,av_verdict,display_name").eq("bucket", "event-media").eq("name", j.path).single()).data;
    expect(row).toMatchObject({ file_class: "public_media", av_verdict: "not_scanned", display_name: "photo.jpg" });
    // A private class can never be recorded against a public bucket.
    const bad = await db.from("storage_attribution").update({ file_class: "sensitive" }).eq("bucket", "event-media").eq("name", j.path);
    expect(bad.error?.message).toMatch(/public_class_check/);
    const { data: job } = await db.from("job_queue").select("kind,status").eq("dedupe_key", `files.derive:event-media/${j.path}`).maybeSingle();
    expect(job?.kind).toBe("files.derive");
  });

  test("a hostile object that reached a public bucket directly is removed by the scan sweep (magic bytes vs stored type)", async () => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET not configured");
    const name = `${ws}/${randomUUID()}.png`;
    const up = await db.storage.from("event-media").upload(name, enc("<html><body><script>alert(1)</script></body></html>"), { contentType: "image/png" });
    expect(up.error).toBeNull(); fixtures.push({ bucket: "event-media", name });
    const r = await fetch(`${BASE}/api/cron/scan-uploads`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(r.status).toBe(200);
    expect((await db.from("storage_attribution").select("name").eq("bucket", "event-media").eq("name", name)).data ?? []).toEqual([]);   // object + live row gone
    const tomb = (await db.from("file_tombstones").select("av_verdict,scan_status,scan_detail,reason,sha256").eq("bucket", "event-media").eq("name", name).single()).data;
    expect(tomb).toMatchObject({ av_verdict: "infected", scan_status: "infected", reason: "blocked" });
    expect(tomb!.scan_detail).toMatch(/mime_mismatch/); expect(tomb!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(((await db.from("audit_events").select("event").eq("event", "upload.blocked").contains("metadata", { name })).data ?? []).length).toBe(1);
    const pub = await fetch(db.storage.from("event-media").getPublicUrl(name).data.publicUrl);
    expect(pub.ok).toBe(false);                                                                                  // no longer publicly reachable
  });

  test("retention sweep enqueues deletion (legal hold excluded); storage meter snapshots usage; functions are service-only", async () => {
    const expired = `${owner.id}/${randomUUID()}.png`, held = `${owner.id}/${randomUUID()}.png`;
    const ins = await db.from("storage_attribution").insert([{ bucket: "workspace-files", name: expired, user_id: owner.id, retention_until: new Date(Date.now() - 864e5).toISOString(), legal_hold: false },
      { bucket: "workspace-files", name: held, user_id: owner.id, retention_until: new Date(Date.now() - 864e5).toISOString(), legal_hold: true }]);
    expect(ins.error).toBeNull();
    fixtures.push({ bucket: "workspace-files", name: expired }, { bucket: "workspace-files", name: held });
    const id = (await db.rpc("enqueue_job", { p_kind: "files.retention_sweep", p_payload: {}, p_dedupe_key: `q04-test:${randomUUID()}` })).data as string;
    await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["files.retention_sweep"] });
    expect(((await db.from("job_queue").select("status").eq("id", id).single()).data as { status: string }).status).toBe("succeeded");
    const q = async (n: string) => (await db.from("job_queue").select("id").eq("dedupe_key", `files.delete_object:workspace-files/${n}`)).data ?? [];
    expect((await q(expired)).length).toBe(1);
    expect((await q(held)).length).toBe(0);
    await db.from("job_queue").update({ status: "cancelled" }).eq("dedupe_key", `files.delete_object:workspace-files/${expired}`);
    const m = (await db.rpc("enqueue_job", { p_kind: "files.meter_snapshot", p_payload: {}, p_dedupe_key: `q04-test:${randomUUID()}` })).data as string;
    await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["files.meter_snapshot"] });
    expect(((await db.from("job_queue").select("status,result").eq("id", m).single()).data as { status: string }).status).toBe("succeeded");
    const anonDb = (await import("../phase1/helpers")).anon() as unknown as SupabaseClient;
    for (const fn of ["file_access_decision", "file_record_verdict", "file_register", "file_quarantine", "file_mark_deleted"])
      expect((await anonDb.rpc(fn, { p_bucket: "workspace-files", p_name: "x" })).error, fn).not.toBeNull();
    expect((await anonDb.from("storage_usage_snapshots").select("day").limit(1)).data ?? []).toEqual([]);
  });

  test("R2: presigned PUT/GET/DELETE round trip on one tenant key (skipped without R2 credentials)", async () => {
    const env = process.env;
    test.skip(!(env.CLOUDFLARE_R2_S3_API && env.CLOUDFLARE_R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY), "R2 not configured");
    const key = `q04-test/${tenantKey({ workspaceId: ws, ownerId: owner.id, fileId: randomUUID(), ext: "txt" })}`;
    const hosts = [new URL(env.CLOUDFLARE_R2_S3_API!).host, new URL(env.CLOUDFLARE_R2_S3_API!).host.replace(/^([^.]+)\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com$/, "$1.eu.r2.cloudflarestorage.com")];
    let ok = false;
    for (const host of [...new Set(hosts)]) {
      const creds = { endpoint: `https://${host}`, bucket: env.CLOUDFLARE_R2_BUCKET!, accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! };
      const put = await fetch(presignR2(creds, { method: "PUT", key, expiresSeconds: 60 }).url, { method: "PUT", body: "q04" });
      if (put.status === 404) continue;                                                                         // bucket lives on the other jurisdiction host
      expect(put.status).toBe(200);
      expect(await (await fetch(presignR2(creds, { method: "GET", key, expiresSeconds: 60 }).url)).text()).toBe("q04");
      const other = presignR2(creds, { method: "GET", key: `${key}.other`, expiresSeconds: 60 }).url.replace(`${key}.other`, key);   // signature is bound to the key
      expect((await fetch(other)).status).toBe(403);
      expect([200, 204]).toContain((await fetch(presignR2(creds, { method: "DELETE", key, expiresSeconds: 60 }).url, { method: "DELETE" })).status);
      ok = true; break;
    }
    expect(ok).toBe(true);
  });
});
