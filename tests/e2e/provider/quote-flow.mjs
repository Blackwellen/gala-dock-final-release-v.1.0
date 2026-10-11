// E2E: provider builds, reviews and sends a versioned quote, then withdraws it (run after seeding).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const item = (await admin.from("build_items").select("id,status,request_id,event:events!inner(name)").eq("event.name", "Product Launch Event").not("listing_id", "is", null).single()).data;
await admin.from("provider_quotes").delete().eq("build_item_id", item.id); // clean slate for this fixture
// The seeded request's response window is relative to seed time; reopen it so the send step isn't refused as expired.
{ const soon = new Date(Date.now() + 6 * 3600e3).toISOString(); const bi = (await admin.from("build_items").select("request_id").eq("id", item.id).single()).data;
  await admin.from("build_items").update({ response_deadline: soon, status: "sent" }).eq("id", item.id); if (bi?.request_id) await admin.from("provider_requests").update({ response_deadline: soon }).eq("id", bi.request_id); }
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await (await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } })).newPage();
try {
  await page.goto(`${BASE}/provider/opportunities/${item.id}/quote?step=1`, { waitUntil: "load" });
  await page.locator(".qb-lines li").first().waitFor();
  const before = await page.locator(".qb-lines li").count();
  await page.getByRole("button", { name: "Add from package" }).click();
  await page.locator(".qb-picker [role=option]").first().click();
  check("Package added from catalogue", (await page.locator(".qb-lines li").count()) === before + 1);
  await page.getByLabel("Travel / delivery").fill("150");
  await page.getByRole("button", { name: /Continue to review/ }).click();
  await page.waitForURL(/step=2/, { timeout: 60000 });
  const quoteId = new URL(page.url()).searchParams.get("quote");
  const draft = (await admin.from("provider_quotes").select("status,version,total,items").eq("id", quoteId).single()).data;
  check("Draft saved with server totals", draft.status === "draft" && draft.items.some(i => i.kind === "travel") && Number(draft.total) > 0, `v${draft.version} £${draft.total}`);
  await page.getByRole("button", { name: "Send quote to customer" }).click();
  await page.waitForURL(/\/provider\/quotes\//, { timeout: 60000 });
  const sent = (await admin.from("provider_quotes").select("status,sent_at").eq("id", quoteId).single()).data;
  const bi = (await admin.from("build_items").select("status,amount").eq("id", item.id).single()).data;
  check("Quote sent and request marked Quoted", sent.status === "sent" && !!sent.sent_at && bi.status === "quoted" && Number(bi.amount) === Number(draft.total));
  check("Profile shows Sent status", /Sent to client/.test(await page.locator(".qp-status").textContent()));
  await page.locator(".qp-act", { hasText: "Withdraw quote" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Withdraw quote" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
  const w = (await admin.from("provider_quotes").select("status").eq("id", quoteId).single()).data;
  const bi2 = (await admin.from("build_items").select("status").eq("id", item.id).single()).data;
  check("Withdraw: quote withdrawn, request back to available", w.status === "withdrawn" && bi2.status === "available");
  const print = await page.goto(`${BASE}/provider/quotes/${quoteId}/print`, { waitUntil: "load" });
  check("Print view renders", print.status() === 200 && await page.locator(".qprint h1").isVisible());
} catch (e) { check("Unhandled error", false, e.message.split("\n")[0]); }
finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
