import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, BASE, cleanup, createUser, login } from "../phase1/helpers";

// Release spec §74: uploads are sanitised (image metadata stripped) and PDFs with active content are refused.
const db = admin as unknown as SupabaseClient;
const jpegWithExif = () => {
  const exif = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from("GPSLatitude=51.5074;GPSLongitude=-0.1278")]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, exif.length + 2]), exif]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos]);
};

test.describe("upload safety", () => {
  test.afterAll(async () => { await cleanup(); });

  test("image metadata is stripped and active PDFs are refused", async ({ page }) => {
    const u = await createUser("upsafe");
    await login(page, u.email, "/account");
    await page.waitForURL(x => !x.pathname.startsWith("/login"), { timeout: 30_000 });
    const post = (name: string, mime: string, data: Buffer, purpose = "image") => page.request.post(`${BASE}/api/uploads`, { headers: { Origin: BASE }, multipart: { purpose, file: { name, mimeType: mime, buffer: data } } });
    const r = await post("photo.jpg", "image/jpeg", jpegWithExif());
    expect(r.status()).toBe(200);
    const { path } = await r.json();
    const stored = Buffer.from(await (await db.storage.from("workspace-files").download(path)).data!.arrayBuffer());
    expect(stored.includes(Buffer.from("Exif"))).toBe(false);
    expect(stored.includes(Buffer.from("GPSLatitude"))).toBe(false);
    expect(stored.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(true);
    await db.storage.from("workspace-files").remove([path]);
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert('x')) >> >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF");
    const bad = await post("invoice.pdf", "application/pdf", pdf, "document");
    expect(bad.status()).toBe(422);
    expect((await bad.json()).error).toMatch(/active content|scripts/i);
    const okPdf = await post("plain.pdf", "application/pdf", Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF"), "document");
    expect(okPdf.status()).toBe(200);
    await db.storage.from("workspace-files").remove([(await okPdf.json()).path]);
  });
});
