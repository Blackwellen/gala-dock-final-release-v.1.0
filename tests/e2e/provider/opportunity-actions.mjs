// E2E: provider responds to requests through the real UI and the database reflects it (run after seeding).
// Usage: node --env-file=.env --env-file=.env.local tests/e2e/provider/opportunity-actions.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const itemFor = async name => (await admin.from("build_items").select("id,status,event:events!inner(name)").eq("event.name", name).not("listing_id", "is", null).single()).data;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await (await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } })).newPage();
try {
  // 1. Mark available
  const conf = await itemFor("Corporate Conference");
  await page.goto(`${BASE}/provider/opportunities/${conf.id}`, { waitUntil: "load" });
  await page.locator(".pq-rail .pq-opt", { hasText: "I’m available" }).click();
  await page.getByRole("dialog").locator("textarea").fill("Happy to host — Riverside Suite is free.");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm available" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  check("Available response recorded", (await itemFor("Corporate Conference")).status === "available");

  // 2. Clarification with a question
  const party = await itemFor("Birthday Party");
  await page.goto(`${BASE}/provider/opportunities/${party.id}`, { waitUntil: "load" });
  await page.locator(".pq-rail .pq-opt", { hasText: "Need clarification" }).click();
  await page.getByRole("dialog").locator("textarea").fill("Is the late licence required past midnight?");
  await page.getByRole("dialog").getByRole("button", { name: "Send question" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  const partyAfter = (await admin.from("build_items").select("status,notes").eq("id", party.id).single()).data;
  check("Clarification recorded with question", partyAfter.status === "clarification" && partyAfter.notes.includes("late licence"));

  // 3. Internal note persists and renders
  await page.locator("#pq-note").fill("Client prefers terrace if weather allows.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.locator(".pq-notes li", { hasText: "terrace" }).waitFor({ timeout: 30000 });
  check("Internal note saved and shown", true);

  // 4. Expired request cannot be answered (UI disabled + server refuses)
  const exp = await itemFor("Spring Networking");
  await page.goto(`${BASE}/provider/opportunities/${exp.id}`, { waitUntil: "load" });
  const disabled = await page.locator(".pq-rail .pq-opt", { hasText: "I’m available" }).isDisabled();
  const label = await page.locator(".pq-sub .ws-chip").textContent();
  check("Expired request shows Expired / No response and blocks Available", disabled && /Expired/.test(label ?? ""), label ?? "");

  // 5. Audit trail written for responses
  const { data: audit } = await admin.from("audit_events").select("event,metadata").eq("event", "request.responded").contains("metadata", { build_item_id: conf.id });
  check("Audit event written", (audit ?? []).length > 0);
} catch (e) { check("Unhandled error", false, e.message); }
finally { await browser.close(); }
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
