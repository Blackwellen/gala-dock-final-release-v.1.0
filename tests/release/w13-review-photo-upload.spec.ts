import { test, expect } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { createServerClient } from "@supabase/ssr";
import { createUser, cleanup, admin, PASSWORD, BASE } from "../phase1/helpers";

// W13 remaining (coordinator decision 6): the review "Add photos" control posts each file to /api/uploads (purpose=image, the Q04
// path: type sniffing, polyglot check, AV verdict, files registry). No browser: the same request the control makes, with the
// disposable customer's session cookies. Refusals: signed out, wrong type, file claiming to be an image.

/** A real 2x2 RGB PNG built in memory (signature, IHDR, IDAT, IEND with CRCs). */
function tinyPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
async function sessionCookie(email: string) {
  const jar: string[] = [];
  const c = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: v => { for (const k of v) jar.push(`${k.name}=${k.value}`); } } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD }); if (error) throw error;
  return jar.join("; ");
}
test.afterAll(async () => { await cleanup(); });

test("review photo upload: a real PNG is stored and registered; wrong type, fake image and signed-out are refused", async ({ request }) => {
  const origin = new URL(BASE).origin;
  const signedOut = await request.post("/api/uploads", { headers: { origin }, multipart: { purpose: "image", file: { name: "p.png", mimeType: "image/png", buffer: tinyPng() } } });
  expect(signedOut.status()).toBe(401);

  const u = await createUser("w13up", "W13 Uploader");
  const cookie = await sessionCookie(u.email);
  const ok = await request.post("/api/uploads", { headers: { origin, cookie }, multipart: { purpose: "image", file: { name: "review photo.png", mimeType: "image/png", buffer: tinyPng() } } });
  const j = await ok.json();
  expect(ok.status(), JSON.stringify(j)).toBe(200);
  expect(j.path).toContain(u.id);
  expect(["ready", "checking"]).toContain(j.status);
  const files = admin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(async () => ((await files.from("storage_attribution").select("bucket").eq("bucket", "workspace-files").eq("name", j.path)).data ?? []).length).toBeGreaterThan(0);

  const pdf = await request.post("/api/uploads", { headers: { origin, cookie }, multipart: { purpose: "image", file: { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") } } });
  expect([415, 422]).toContain(pdf.status());
  const fake = await request.post("/api/uploads", { headers: { origin, cookie }, multipart: { purpose: "image", file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("not really a png") } } });
  expect([415, 422]).toContain(fake.status());
  await (admin as unknown as { storage: { from: (b: string) => { remove: (p: string[]) => Promise<unknown> } } }).storage.from("workspace-files").remove([j.path]);
});
