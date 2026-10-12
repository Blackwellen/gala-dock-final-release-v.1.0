// E2E: in-app dialogs replace browser pop-ups — template report (reason picker), calendar "save view" prompt.
// Fails if any browser-native confirm/prompt/alert opens. Usage: node --env-file=.env --env-file=.env.local tests/e2e/ui/native-dialogs.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const starter = (await admin.from("design_templates").select("document,width,height").contains("tags", ["gala-starter"]).limit(1).single()).data;
const owner = (await admin.from("workspaces").select("owner_id").eq("name", "Riverside Arena").single()).data.owner_id;
const tpl = (await admin.from("design_templates").insert({ title: "E2E community template", category: "concert", owner_id: owner, visibility: "public", status: "active", ...starter }).select("id").single()).data;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await (await b.newContext({ storageState: "artifacts/auth/organizer.json", viewport: { width: 1440, height: 950 } })).newPage();
let nativeDialogs = 0; p.on("dialog", d => { nativeDialogs++; void d.dismiss(); });
const errs = []; p.on("pageerror", e => errs.push(e.message));
try {
  await p.goto(`${BASE}/organizer/media?tab=community`, { waitUntil: "load" });
  const card = p.locator(".ml-card, .ml-grid > *").filter({ hasText: "E2E community template" }).first();
  await card.getByRole("button", { name: "Report template" }).click();
  const dlg = p.getByRole("dialog", { name: "Report this template" });
  await dlg.waitFor();
  check("Report opens an in-app dialog with reasons", await dlg.getByRole("radio", { name: /Copyright/ }).isVisible());
  check("Send is disabled until a reason is chosen", await dlg.getByRole("button", { name: "Send report" }).isDisabled());
  await dlg.getByRole("radio", { name: /Spam or misleading/ }).check(); await dlg.getByLabel(/Details/).fill("E2E test report — please ignore.");
  await p.screenshot({ path: "artifacts/tmp/dialog-report.png" });
  await dlg.getByRole("button", { name: "Send report" }).click();
  await p.getByText("Thanks — our team will review it.").waitFor({ timeout: 15000 });
  const rep = (await admin.from("template_reports").select("reason,detail").eq("template_id", tpl.id)).data;
  check("Report saved with the chosen reason and details", rep.length === 1 && rep[0].reason === "spam" && /E2E/.test(rep[0].detail));
  await card.getByRole("button", { name: "Report template" }).click(); await p.getByRole("dialog", { name: "Report this template" }).waitFor(); await p.keyboard.press("Escape");
  check("Esc closes the dialog", await p.getByRole("dialog", { name: "Report this template" }).waitFor({ state: "detached", timeout: 3000 }).then(() => true).catch(() => false));
  // Calendar "save view" prompt
  await p.goto(`${BASE}/organizer/calendar`, { waitUntil: "load" });
  await p.getByRole("button", { name: /Saved views|Save/ }).first().click();
  await p.getByRole("menuitem", { name: /save/i }).first().click();
  const vd = p.getByRole("dialog", { name: "Save this calendar view" }); await vd.waitFor({ timeout: 10000 });
  await vd.getByLabel(/View name/).fill("E2E view"); await vd.getByRole("button", { name: "Save view" }).click();
  check("Calendar view prompt is in-app and saves", await vd.count() === 0 && await p.evaluate(() => (localStorage.getItem("gd-cal-views") ?? "").includes("E2E view")));
  check("No browser-native pop-ups were opened", nativeDialogs === 0, `${nativeDialogs}`);
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { await p.screenshot({ path: "artifacts/tmp/dialogs-fail.png" }); check("unexpected error", false, e.message.split("\n")[0]); }
finally { await admin.from("template_reports").delete().like("detail", "E2E test report%"); await admin.from("design_templates").delete().eq("id", tpl.id); await b.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
