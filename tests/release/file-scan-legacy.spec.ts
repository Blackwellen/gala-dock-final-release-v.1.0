import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Incident 2026-11-13: the stored-object sweep compared a legacy `application/octet-stream` content type literally with the
 *  sniffed type and deleted 32 valid files. Octet-stream must count as "type not declared", as in the upload policy. */
test("scanStoredObject treats application/octet-stream as undeclared, matching the upload policy", () => {
  const svc = readFileSync("src/lib/files/service.ts", "utf8");
  const fn = svc.slice(svc.indexOf("export async function scanStoredObject"), svc.indexOf("export async function deriveThumbnail"));
  expect(fn).toMatch(/declared !== "application\/octet-stream" && kind\.type !== declared/);
  expect(fn).not.toMatch(/kind\.type !== o\.mimetype/);
  const policy = readFileSync("src/lib/files/policy.ts", "utf8");
  expect(policy).toMatch(/declared !== "application\/octet-stream"/);
});

test("stored-object sweep keeps brand fonts in the private bucket; general upload sniffing still refuses fonts", () => {
  const svc = readFileSync("src/lib/files/service.ts", "utf8");
  expect(svc).toMatch(/sniff\(original\) \?\? \(o\.bucket === PRIVATE_BUCKET \? sniffFont\(original\) : null\)/);
  const policy = readFileSync("src/lib/files/policy.ts", "utf8");
  const sniffBody = policy.slice(policy.indexOf("export function sniff("), policy.indexOf("export function sniffFont"));
  expect(sniffBody).not.toMatch(/font\//);
  expect(readFileSync("src/app/api/media/font/route.ts", "utf8")).toMatch(/import \{ sniffFont \} from "@\/lib\/files\/policy"/);
});
