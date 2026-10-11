// E2E: venue setup step 4 (Operations) — live counters, "Other certificates" via Manage documents, Save as draft (stays on the step), cleanup.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const venue = (await admin.from("listings").select("id,details").eq("name", "Riverside Arena").limit(1).single()).data;
const compliance = () => admin.from("listings").select("details").eq("id", venue.id).single().then(r => r.data.details.compliance ?? []);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await (await browser.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1536, height: 1024 } })).newPage();
const errs = []; page.on("pageerror", e => errs.push(e.message));
const url = `${BASE}/provider/venues/new?venue=${venue.id}&step=4`;
try {
  await page.goto(url, { waitUntil: "load" });
  check("Venue preview and readiness rail render", await page.getByRole("heading", { name: "Venue preview" }).isVisible() && await page.getByRole("heading", { name: /readiness check/ }).isVisible());
  const notes = page.locator('textarea[name="ops_notes"]'), counter = page.locator('.vw-notes .vw-counted small');
  await notes.fill("Load-in via the east gate.");
  check("Character counter follows typing", (await counter.innerText()) === `${"Load-in via the east gate.".length}/500`, await counter.innerText());
  await page.locator(".vw-other > summary").click();
  await page.getByLabel("Other certificate 1 name").fill("E2E Noise licence");
  await page.getByLabel("Other certificate 1 reference").fill("NL-E2E");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await page.getByText("Draft saved").first().waitFor({ timeout: 30000 });
  check("Save as draft stays on step 4", page.url().includes("step=4"));
  const c1 = await compliance();
  check("Other certificate saved alongside the standard documents", c1.some(c => c.name === "E2E Noise licence" && c.reference === "NL-E2E") && c1.some(c => c.name === "Premises licence"), JSON.stringify(c1.map(c => c.name)));
  await page.goto(url, { waitUntil: "load" });
  await page.locator(".vw-other > summary").click();
  const nameBox = page.locator('input[value="E2E Noise licence"]');
  await nameBox.fill("");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await page.getByText("Draft saved").first().waitFor({ timeout: 30000 });
  check("Clearing the name removes the certificate", !(await compliance()).some(c => c.name === "E2E Noise licence"));
  check("No page errors", errs.length === 0, errs.join(" | "));
} catch (e) { check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  // Restore the original details regardless (notes + compliance) so the demo venue is unchanged.
  await admin.from("listings").update({ details: venue.details }).eq("id", venue.id);
  await browser.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
}
