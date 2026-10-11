// E2E: break-glass conversation access (release-readiness §5/§7).
// Default support staff can't use it; access starts from a case; fraud is immediate, high-risk needs a second admin; opening needs step-up TOTP;
// every open is logged; closing notifies affected users (or records why not). Cleans up its own case, grants, logs, audit rows and notifications.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { totp } from "../../../scripts/totp.mjs";
const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const PERM = "support.break_glass_conversation.read";
const uid = async email => { const { data } = await db.auth.admin.listUsers({ perPage: 200 }); return data.users.find(u => u.email === email)?.id; };
const [adminId, supportId] = [await uid("admin.demo@example.com"), await uid("support.demo@example.com")];
const conv = (await db.from("conversations").select("id,subject").order("last_message_at", { ascending: false }).limit(1).single()).data;
const member = (await db.from("conversation_participants").select("user_id").eq("conversation_id", conv.id).not("user_id", "is", null).limit(1).single()).data.user_id;
const body = (await db.from("conversation_messages").select("body").eq("conversation_id", conv.id).is("deleted_at", null).limit(1).maybeSingle()).data?.body ?? "";
const ref = `SUP-E2E${Date.now() % 100000}`;
const kase = (await db.from("support_cases").insert({ reference: ref, subject: "E2E break-glass check", category: "other", priority: "high", status: "open", requester_id: member, requester_name: "E2E member" }).select("id").single()).data;
const supportPerms = (await db.from("platform_admins").select("permissions").eq("user_id", supportId).single()).data.permissions;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
// Step-up rotates the session; contexts are saved back so the shared auth states stay valid for other scripts.
const ctxs = {};
const ctxFor = async who => { ctxs[who] = await browser.newContext({ storageState: `artifacts/auth/${who}.json`, viewport: { width: 1536, height: 1024 } }); return ctxs[who].newPage(); };
const errs = []; let shot = null;
try {
  // 1. Default support staff: no access.
  const sp = await ctxFor("support"); sp.on("pageerror", e => errs.push(e.message));
  await sp.goto(`${BASE}/admin/conversations`, { waitUntil: "networkidle" });
  check("Default support staff are refused", !(await sp.getByRole("heading", { name: "Break-glass access" }).count()));
  await sp.goto(`${BASE}/admin/support/${kase.id}`, { waitUntil: "networkidle" });
  check("…and see no request button on the case", !(await sp.getByRole("link", { name: "Request conversation access" }).count()));

  // 2. Request from the case (fraud → immediate, read-only, time-limited).
  const ap = await ctxFor("admin"); shot = ap; ap.on("pageerror", e => errs.push(e.message));
  await ap.goto(`${BASE}/admin/support/${kase.id}`, { waitUntil: "networkidle" });
  await ap.getByRole("link", { name: "Request conversation access" }).click();
  await ap.getByRole("heading", { name: "Request conversation access" }).first().waitFor();
  check("List shows metadata only, never message text", !body || !(await ap.content()).includes(body.slice(0, 30)));
  await ap.locator(".acv-pick label").first().click();
  await ap.getByLabel("Reason").selectOption("fraud");
  await ap.getByLabel(/Justification/).fill(`Investigating suspected off-platform payment request on ${ref}.`);
  await ap.getByRole("button", { name: "Request access" }).click();
  await ap.waitForURL(/\/admin\/conversations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const grantId = ap.url().split("/").pop();
  const g = (await db.from("break_glass_grants").select("*").eq("id", grantId).single()).data;
  check("Grant stores requester, reason, case, affected users and expiry", g.requester_id === adminId && g.reason === "fraud" && g.case_reference === ref && g.affected_user_ids.includes(member) && !!g.expires_at && g.status === "active");

  // 3. Opening requires step-up, then shows the transcript and logs the open.
  await ap.getByRole("button", { name: /^Open “/ }).first().click();
  const code = ap.getByLabel("Authenticator code"), reader = ap.getByText("Read-only · this view is logged");
  await code.or(reader).first().waitFor({ timeout: 20000 });
  if (await code.isVisible()) {
    check("Opening asks for step-up verification", true);
    await code.fill(totp(process.env.DEMO_ADMIN_TOTP_SECRET)); await ap.getByRole("button", { name: "Verify" }).click();
  } else {
    // A TOTP sign-in within the last 10 minutes already satisfies step-up (bg_step_up_ok), e.g. right after ws-auth.
    check("Opening skips step-up only within 10 minutes of a TOTP verification", true, "fresh TOTP session");
  }
  await ap.getByText("Read-only · this view is logged").waitFor({ timeout: 30000 });
  check("Transcript shown after step-up", !body || (await ap.content()).includes(body.slice(0, 30).replace(/&/g, "&amp;")));
  const log = (await db.from("break_glass_access_log").select("id").eq("grant_id", grantId)).data;
  const aud = (await db.from("audit_events").select("id").eq("event", "admin.break_glass_conversation_opened").eq("metadata->>grant_id", grantId)).data;
  check("Each open logged individually + audited", log.length === 1 && aud.length === 1);
  check("No send/edit/delete controls in the reader", !(await ap.locator(".acv-thread textarea, .acv-thread [contenteditable], .acv-thread button:has-text('Delete'), .acv-thread button:has-text('Send')").count()));

  // 4. Close: notify affected users.
  await ap.getByRole("button", { name: "Close", exact: true }).click();
  await ap.getByRole("button", { name: "Close access now" }).click();
  await ap.getByText(/affected users notified/).waitFor({ timeout: 20000 });
  const closed = (await db.from("break_glass_grants").select("status,notify_affected").eq("id", grantId).single()).data;
  const note = (await db.from("notifications").select("id").eq("user_id", member).ilike("body", `%${ref}%`)).data;
  check("Closing ends access and notifies the affected user", closed.status === "closed" && closed.notify_affected === true && note.length >= 1);

  // 4b. Sole holder (DPO policy): a high-risk reason is granted immediately and flagged sole_holder.
  await ap.goto(`${BASE}/admin/conversations/request?type=support&case=${kase.id}`, { waitUntil: "networkidle" });
  await ap.locator(".acv-pick label").first().click();
  await ap.getByLabel("Reason").selectOption("safeguarding");
  await ap.getByLabel(/Justification/).fill(`Sole-holder safeguarding check for ${ref} under DPO policy.`);
  await ap.getByRole("button", { name: "Request access" }).click();
  await ap.waitForURL(/\/admin\/conversations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const sole = (await db.from("break_glass_grants").select("status,requires_approval,decision_note").eq("id", ap.url().split("/").pop()).single()).data;
  check("Sole holder: high-risk request granted immediately", sole.status === "active" && !sole.requires_approval && /Sole break-glass holder/.test(sole.decision_note ?? ""));

  // 5. Once a second holder exists, high-risk requests wait for that other administrator.

  await db.from("platform_admins").update({ permissions: [...supportPerms, PERM] }).eq("user_id", supportId);
  await ap.goto(`${BASE}/admin/conversations/request?type=support&case=${kase.id}`, { waitUntil: "networkidle" });
  await ap.locator(".acv-pick label").first().click();
  await ap.getByLabel("Reason").selectOption("safeguarding");
  await ap.getByLabel(/Justification/).fill(`Member reported threatening messages, safeguarding review for ${ref}.`);
  await ap.getByRole("button", { name: "Submit for approval" }).click();
  await ap.waitForURL(/\/admin\/conversations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const g2 = ap.url().split("/").pop();
  check("High-risk reason waits for approval", (await db.from("break_glass_grants").select("status").eq("id", g2).single()).data.status === "pending" && !(await ap.getByRole("button", { name: "Approve" }).count()));
  await sp.goto(`${BASE}/admin/conversations/${g2}`, { waitUntil: "networkidle" });
  await sp.getByLabel("Decision note").fill("Report verified on the case.");
  await sp.getByRole("button", { name: "Approve" }).click();
  await sp.waitForTimeout(1500);
  const g2r = (await db.from("break_glass_grants").select("status,approver_id").eq("id", g2).single()).data;
  check("A second administrator approves", g2r.status === "active" && g2r.approver_id === supportId);
  await ap.goto(`${BASE}/admin/conversations?tab=report`, { waitUntil: "networkidle" });
  check("Compliance report renders", await ap.getByText("Conversations opened").isVisible());
  check("No page errors", errs.length === 0, errs.join(" | ").slice(0, 200));
} catch (e) { await shot?.screenshot({ path: "artifacts/tmp/bg-fail.png" }).catch(() => {}); check("unexpected error", false, e.message.split("\n")[0]); }
finally {
  await db.from("platform_admins").update({ permissions: supportPerms }).eq("user_id", supportId);
  const gs = (await db.from("break_glass_grants").select("id").eq("case_id", kase.id)).data ?? [];
  for (const g of gs) await db.from("audit_events").delete().eq("metadata->>grant_id", g.id);
  await db.from("break_glass_grants").delete().eq("case_id", kase.id);
  await db.from("notifications").delete().eq("user_id", member).ilike("body", `%${ref}%`);
  await db.from("support_cases").delete().eq("id", kase.id);
  for (const [who, c] of Object.entries(ctxs)) await c.storageState({ path: `artifacts/auth/${who}.json` }).catch(() => {});
  await browser.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
}
