// E2E: inbox — readable bubbles, avatars, profile card + saved contact, emoji, personalised text, attachments, top-bar dropdown.
// Messages and contacts it creates are removed afterwards. Usage: node --env-file=.env --env-file=.env.local tests/e2e/messaging/inbox.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const started = new Date().toISOString();
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await (await b.newContext({ storageState: "artifacts/auth/provider.json", viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
const lum = c => { const [r, g, bl] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
const contrast = (a, z) => { const [x, y] = [lum(a), lum(z)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
let convId;
try {
  await p.goto(`${BASE}/provider/inbox`, { waitUntil: "load" });
  await p.locator(".ms-list a").first().waitFor();
  convId = new URL(await p.locator(".ms-list a").first().getAttribute("href"), BASE).searchParams.get("c");
  check("Conversation list shows avatars", await p.locator(".ms-list a .ms-av").count() > 0);
  // Send a personalised message with an emoji.
  const box = p.getByRole("textbox", { name: "Message" });
  await box.fill("Hi ");
  await p.locator(".ms-compose").getByRole("button", { name: "Insert personal detail" }).click();
  await p.getByRole("menuitem", { name: /\[Their first name\]/ }).click();
  await box.press("End"); await box.type(" {{ .Subscriber.Name }} ");
  await p.locator(".ms-compose").getByRole("button", { name: "Add emoji" }).click();
  await p.getByLabel("Search emoji").fill("party"); await p.locator(".ms-emo-grid button").first().click();
  check("Preview shows filled-in details", /They’ll see:/.test(await p.locator(".ms-preview").innerText()) && !(await p.locator(".ms-preview").innerText()).includes("{{"), await p.locator(".ms-preview").innerText());
  await p.locator(".ms-compose input[type=file]").setInputFiles("public/design-assets/samples/" + (await import("node:fs")).readdirSync("public/design-assets/samples")[0]);
  await p.locator(".ms-files li").first().waitFor({ timeout: 20000 });
  await p.getByRole("button", { name: "Send" }).click();
  await p.locator(".ms-msgs li.me").last().locator(".ms-imgs img").waitFor({ timeout: 20000 });
  const last = await p.locator(".ms-msgs li.me").last().innerText();
  check("Sent message has names filled in and an emoji", /^Hi \S+/.test(last) && !last.includes("{{") && !last.includes("[Their") && /\p{Extended_Pictographic}/u.test(last), last.split("\n")[0]);
  check("Image attachment shows inline", await p.locator(".ms-msgs li.me").last().locator(".ms-imgs img").isVisible());
  // Contrast on both sides.
  const meC = await p.locator(".ms-msgs li.me .ms-bubble p").last().evaluate(e => [getComputedStyle(e).color, getComputedStyle(e.closest(".ms-bubble")).backgroundColor]);
  check("Sent bubble text is readable (≥ 4.5:1)", contrast(...meC) >= 4.5, `${contrast(...meC).toFixed(1)}:1`);
  const them = p.locator(".ms-msgs li.them .ms-bubble p");
  if (await them.count()) { const c = await them.last().evaluate(e => [getComputedStyle(e).color, getComputedStyle(e.closest(".ms-bubble")).backgroundColor]); check("Received bubble text is readable (≥ 4.5:1)", contrast(...c) >= 4.5, `${contrast(...c).toFixed(1)}:1`); }
  // Profile card + save contact.
  await p.locator(".ms-thread-head .ms-who").click();
  await p.getByRole("dialog", { name: /profile/ }).getByRole("heading").waitFor({ timeout: 15000 });
  check("Clicking the name opens their profile", await p.locator(".ms-prof h2").isVisible(), await p.locator(".ms-prof h2").innerText());
  await p.getByRole("button", { name: /Save contact/ }).click();
  await p.getByRole("button", { name: /Saved contact/ }).waitFor({ timeout: 15000 });
  check("Save contact works", true);
  await p.getByRole("button", { name: "Close profile" }).click();
  await p.reload({ waitUntil: "load" }); await p.getByRole("button", { name: "New message" }).click();
  check("Saved contacts listed first in New message", await p.locator(".ms-pick-head").isVisible() && (await p.locator(".ms-pick li").first().innerText()).includes("Saved contact"), (await p.locator(".ms-pick li").first().innerText()).replace(/\s+/g, " "));
  await p.getByRole("button", { name: "Cancel" }).click();
  // Top-bar dropdown.
  await p.getByRole("button", { name: /^Messages/ }).click();
  const item = p.locator(".ms-drop-item").first();
  check("Dropdown shows name and avatar", await item.locator(".ms-av").isVisible() && (await item.locator("b").innerText()).length > 1);
  check("Dropdown links to the inbox", (await item.getAttribute("href")).startsWith("/provider/inbox?c="));
  await p.screenshot({ path: "artifacts/tmp/inbox.png" });
  check("No page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} catch (e) { await p.screenshot({ path: "artifacts/tmp/inbox-fail.png" }); check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  if (convId) await admin.from("conversation_messages").delete().eq("conversation_id", convId).gte("created_at", started);
  if (!process.env.KEEP) await admin.from("saved_contacts").delete().gte("created_at", started);
  await b.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
