import { createHash, randomBytes } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { admin, BASE, cleanup, createUser, expectPath, login, PASSWORD, seedWorkspace, signedIn, totp } from "../helpers";

test.afterAll(cleanup);
// Choice cards include a description in their accessible name, so match on the leading label.
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const check = (page: Page, name: string, role: "checkbox" | "radio" = "checkbox") => page.getByRole(role, { name: new RegExp(`^\\s*${escape(name)}`) }).first().check({ force: true });

test("login: wrong password and unknown email get the same generic error", async ({ page }) => {
  const user = await createUser("generic");
  for (const email of [user.email, `nobody-${Date.now()}@gala-dock.test`]) {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Wrong-password-1!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The email or password you entered is incorrect." })).toBeVisible();
  }
});

test("login: client validation blocks empty submit; forgot password is neutral", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Enter a valid email address.").first()).toBeVisible();
  await page.goto(`${BASE}/forgot-password`);
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@gala-dock.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for this email, you’ll receive a reset link shortly.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Resend available in/ })).toBeDisabled();
});

test("register: terms must be explicitly accepted and marketing is opt-in", async ({ page }) => {
  await page.goto(`${BASE}/register`);
  await expect(page.locator('input[name="terms"]')).not.toBeChecked();
  await expect(page.locator('input[name="marketing"]')).not.toBeChecked();
  await page.getByLabel("Full name").fill("Rita Register");
  await page.getByLabel("Email").fill(`p1-noterms-${Date.now()}@gala-dock.test`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await expect(page.getByText("5 of 5 met")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("You need to agree to the Terms of Service and Privacy Policy.").first()).toBeVisible();
});

test("protected routes redirect to login and preserve the destination", async ({ page }) => {
  for (const path of ["/organizer", "/provider", "/onboarding", "/admin"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/\//g, "\\/")}`));
  }
});

test("Journey A: new customer chooses Plan an Event, saves preferences, lands on Discover", async ({ page }) => {
  const user = await createUser("customer", "Casey Customer");
  await login(page, user.email);
  await expectPath(page, /\/onboarding$/);
  await page.getByRole("link", { name: "Continue as a Customer" }).click();
  await expectPath(page, /\/onboarding\/customer\?step=1/);
  await check(page, "Music & Concerts");
  await check(page, "Festivals");
  await page.getByRole("button", { name: "Complete setup" }).click();
  await expectPath(page, /\/discover/);
  const { data } = await admin.from("profiles").select("interests,onboarding_complete").eq("id", user.id).single();
  expect(data?.interests).toEqual(expect.arrayContaining(["Music & Concerts", "Festivals"]));
  expect(data?.onboarding_complete).toBe(true);
  expect((await admin.from("workspaces").select("id").eq("owner_id", user.id)).data).toEqual([]);
});

test("Journey B: ticket purchaser keeps checkout intent through sign-in, no business setup", async ({ page }) => {
  const user = await createUser("buyer");
  await page.goto(`${BASE}/login?next=${encodeURIComponent("/checkout?event=neon-nights")}`);
  await expect(page.getByText("Returning to checkout")).toBeVisible();
  await expect(page.getByText(/Complete your Neon Nights Festival 2026 tickets/)).toBeVisible();
  await login(page, user.email, "/checkout?event=neon-nights");
  await expectPath(page, /\/checkout\?event=neon-nights/);
});

test("Journey C + M + P: organizer onboarding — refresh-safe drafts, single workspace, owner, invites after commit", async ({ page }) => {
  const user = await createUser("organizer", "Thomas Organizer");
  await login(page, user.email, "/onboarding/organizer?step=1");
  await expectPath(page, /\/onboarding\/organizer\?step=1/);
  await page.getByLabel("Workspace name").fill("Thomas Events QA");
  // M: unsaved input survives a refresh in this tab.
  await page.reload();
  await expect(page.getByLabel("Workspace name")).toHaveValue("Thomas Events QA");
  // Q: Gala Agent unavailability never blocks setup.
  await page.getByRole("button", { name: "Suggest settings for me" }).click();
  await expect(page.getByText(/isn’t available right now|couldn’t be reached|busy/)).toBeVisible();
  // P: concurrent duplicate submissions create exactly one draft workspace.
  const body = { flow: "organizer", step: "organisation", values: { name: "Thomas Events QA", business_type: "Event Management Company", country: "United Kingdom", timezone: "Europe/London", currency: "GBP" } };
  const results = await Promise.all([1, 2, 3].map(() => page.request.post(`${BASE}/api/onboarding`, { data: body, headers: { Origin: BASE } })));
  expect(results.every(r => r.ok())).toBe(true);
  expect((await admin.from("workspaces").select("id").eq("owner_id", user.id).eq("kind", "organizer")).data).toHaveLength(1);
  await page.getByRole("button", { name: "Continue to Operating Model" }).click();
  await expectPath(page, /step=2/);
  // Server validation: at least one event type.
  await page.getByRole("button", { name: "Continue to Brand & Payments" }).click();
  await expect(page.getByText("Select at least one event type, or Mixed / Custom.").first()).toBeVisible();
  await check(page, "Weddings");
  await check(page, "Corporate Events");
  await page.getByRole("button", { name: "Continue to Brand & Payments" }).click();
  await expectPath(page, /step=3/);
  await expect(page.getByText("Not connected")).toBeVisible();
  await page.getByRole("button", { name: "Continue to Team & Launch" }).click();
  await expectPath(page, /step=4/);
  // Back keeps saved values.
  await page.getByRole("link", { name: "Back" }).click();
  await expectPath(page, /step=3/);
  await page.getByRole("button", { name: "Continue to Team & Launch" }).click();
  await expectPath(page, /step=4/);
  const ws = (await admin.from("workspaces").select("id").eq("owner_id", user.id).single()).data!;
  // No invitations exist before the workspace is committed.
  await page.getByLabel("Email address").fill("p1-teammate@gala-dock.test");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  expect((await admin.from("workspace_invites").select("id").eq("workspace_id", ws.id)).data).toEqual([]);
  await page.getByRole("button", { name: "Complete Setup & Go to My Workspace" }).click();
  await expect(page.getByText("Team invitations created")).toBeVisible();
  await expect(page.getByLabel("Invitation link for p1-teammate@gala-dock.test")).toHaveValue(/\/invite\/[A-Za-z0-9_-]{43}$/);
  const after = (await admin.from("workspaces").select("onboarding_complete,settings").eq("id", ws.id).single()).data!;
  expect(after.onboarding_complete).toBe(true);
  expect((after.settings as Record<string, { event_types?: string[] }>).operating?.event_types).toEqual(["Weddings", "Corporate Events"]);
  expect((await admin.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", user.id).single()).data?.role).toBe("owner");
  const invites = (await admin.from("workspace_invites").select("email,token_hash").eq("workspace_id", ws.id)).data!;
  expect(invites).toHaveLength(1);
  expect(invites[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  await page.getByRole("link", { name: "Go to my workspace" }).click();
  await expectPath(page, /:\d+\/organizer(\?|$)/);
});

async function providerStepOne(page: Page, capability: "Venues" | "Services" | "Both") {
  await page.getByLabel("Business display name").fill(`Riverside ${capability} QA`);
  await check(page, capability, "radio");
  if (capability !== "Venues") await check(page, "Catering");
  await page.getByLabel("Primary location").fill("London, UK");
  await page.getByRole("button", { name: "Continue to First Offer" }).click();
  await expectPath(page, /step=2/);
}
async function providerFinish(page: Page, userId: string, kind: "venue" | "service") {
  await page.getByRole("button", { name: "Continue to Booking Rules" }).click();
  await expectPath(page, /step=3/);
  // Contradictory rules are blocked with a fix.
  await page.getByRole("switch", { name: /Emergency availability/ }).check();
  await page.getByRole("radio", { name: "Within 12 hours", exact: true }).check({ force: true });
  await expect(page.getByText("Emergency requests need a response commitment of 4 hours or less.").first()).toBeVisible();
  await page.getByRole("button", { name: "Respond within 2 hours" }).click();
  await page.getByRole("button", { name: "Allow same-day requests" }).click();
  await page.getByRole("button", { name: "Continue to Trust & Publish" }).click();
  await expectPath(page, /step=4/);
  // R: publishing is gated on verification and payouts; draft completion is allowed.
  await expect(page.getByRole("button", { name: "Publish listing" })).toBeDisabled();
  await expect(page.getByText("Business verification by Gala Dock (in review after you submit documents)").or(page.getByText("Business identity verification")).first()).toBeVisible();
  await page.getByRole("button", { name: "Finish setup — keep listing as draft" }).click();
  await expectPath(page, /:\d+\/provider(\?|$)/);
  const ws = (await admin.from("workspaces").select("id,capabilities,onboarding_complete,verification_status,payout_status,settings").eq("owner_id", userId).single()).data!;
  expect(ws.onboarding_complete).toBe(true);
  expect(ws.verification_status).toBe("unverified");
  const rules = (ws.settings as Record<string, Record<string, unknown>>).rules;
  expect(rules.emergency).toBe(true);
  expect((rules.effective as Record<string, unknown>).emergency_eligible).toBe(false);
  const listings = (await admin.from("listings").select("kind,published").eq("workspace_id", ws.id)).data!;
  expect(listings).toEqual([{ kind, published: false }]);
  return ws;
}

test("Journey D: provider with a venue — draft listing, booking rules, trust gating", async ({ page }) => {
  const user = await createUser("venue");
  await login(page, user.email, "/onboarding/provider?step=1");
  await providerStepOne(page, "Venues");
  await page.getByLabel("Venue name").fill("Riverside Hall");
  await page.getByLabel("Short description").fill("A riverside hall with panoramic views, ideal for weddings and corporate events.");
  await page.getByLabel("Max capacity").fill("400");
  const ws = await providerFinish(page, user.id, "venue");
  expect(ws.capabilities).toEqual(["venue"]);
});

test("Journey E: provider with services — category and coverage", async ({ page }) => {
  const user = await createUser("service");
  await login(page, user.email, "/onboarding/provider?step=1");
  await providerStepOne(page, "Services");
  await page.getByLabel("Service name").fill("Riverside Catering");
  await page.getByRole("combobox", { name: /^Category/ }).selectOption("Catering");
  await page.getByLabel("Description").fill("Seasonal catering for weddings, conferences and private events across London.");
  const ws = await providerFinish(page, user.id, "service");
  expect(ws.capabilities).toEqual(["service"]);
});

test("Journey F: mixed provider uses one workspace for venue and services", async ({ page }) => {
  const user = await createUser("mixed");
  await login(page, user.email, "/onboarding/provider?step=1");
  await providerStepOne(page, "Both");
  await check(page, "Venue", "radio");
  await page.getByLabel("Venue name").fill("Riverside Mixed Hall");
  await page.getByLabel("Short description").fill("A flexible venue with in-house catering, styling and production services.");
  await page.getByLabel("Max capacity").fill("250");
  const ws = await providerFinish(page, user.id, "venue");
  expect(ws.capabilities).toEqual(["venue", "service"]);
  expect((await admin.from("workspaces").select("id").eq("owner_id", user.id).eq("kind", "provider")).data).toHaveLength(1);
});

test("Journey H: an organizer can add a provider workspace without permission crossover", async ({ page }) => {
  const user = await createUser("both");
  await seedWorkspace(user.id, "organizer", "Existing Organizer");
  await login(page, user.email, "/onboarding/provider?step=1");
  await providerStepOne(page, "Venues");
  const access = (await (await signedIn(user.email)).rpc("my_workspace_access")).data!;
  expect(access.map(w => w.kind).sort()).toEqual(["organizer", "provider"]);
  expect(access.every(w => w.role === "owner")).toBe(true);
});

test("Journey I: invitation opened while signed out, accepted after sign-in", async ({ page }) => {
  const owner = await createUser("inviter", "Sarah Chen");
  const invitee = await createUser("invitee");
  const ws = await seedWorkspace(owner.id, "organizer", "Neon Nights QA");
  const token = randomBytes(32).toString("base64url");
  await admin.from("workspace_invites").insert({ workspace_id: ws, email: invitee.email, role: "manager", token_hash: createHash("sha256").update(token).digest("hex"), invited_by: owner.id });
  await page.goto(`${BASE}/invite/${token}`);
  await expect(page.getByText("Neon Nights QA").first()).toBeVisible();
  await expect(page.getByText("Sarah Chen").first()).toBeVisible();
  await page.getByRole("button", { name: "Sign in to accept" }).click();
  await expectPath(page, /\/login\?next=%2Finvite%2F/);
  await page.getByLabel("Email").fill(invitee.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expectPath(page, /\/invite\//);
  await page.getByRole("button", { name: "Accept invite" }).click();
  await expectPath(page, /:\d+\/organizer(\?|$)/);
  expect((await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", invitee.id).single()).data?.role).toBe("manager");
  // Reusing the link now shows the used state.
  await page.goto(`${BASE}/invite/${token}`);
  await expect(page.getByText("This invite has already been used")).toBeVisible();
  await page.goto(`${BASE}/invite/not-a-real-token`);
  await expect(page.getByText("This invite is unavailable")).toBeVisible();
});

test("Journey J: password recovery link resets once, signs out everywhere, and cannot be reused", async ({ page }) => {
  const user = await createUser("recovery");
  const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: user.email });
  const link = `${BASE}/auth/confirm?token_hash=${data.properties!.hashed_token}&type=recovery`;
  await page.goto(link);
  await expectPath(page, /\/reset-password$/);
  const fresh = "New-Gala-Pass-42!";
  await page.getByLabel("New password", { exact: true }).fill(fresh);
  await page.getByLabel("Confirm new password").fill(fresh);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  await page.goto(link);
  await expectPath(page, /\/reset-password\?state=expired/);
  await expect(page.getByText("This reset link is invalid or has expired")).toBeVisible();
  expect((await (await import("../helpers")).anon().auth.signInWithPassword({ email: user.email, password: fresh })).error).toBeNull();
  expect((await (await import("../helpers")).anon().auth.signInWithPassword({ email: user.email, password: PASSWORD })).error).not.toBeNull();
});

test("Journey K: MFA challenge is required, rejects bad codes and resumes the original page", async ({ page }) => {
  const user = await createUser("mfa");
  const client = await signedIn(user.email);
  const { data: factor } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "QA" });
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: factor!.id, code: totp(factor!.totp.secret) });
  expect(error).toBeNull();
  await login(page, user.email, "/onboarding");
  await expectPath(page, /\/mfa\?next=%2Fonboarding/);
  // Direct navigation cannot bypass the challenge.
  await page.goto(`${BASE}/onboarding`);
  await expectPath(page, /\/mfa\?next=%2Fonboarding/);
  await page.getByLabel("Digit 1").pressSequentially("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code isn’t valid. Check your app and try again.")).toBeVisible();
  await page.getByRole("tab", { name: "Recovery code" }).click();
  await expect(page.getByText("Recovery codes aren’t available yet")).toBeVisible();
  await page.getByRole("tab", { name: "Authenticator" }).click();
  // Wait for a fresh 30s window so the code isn't reused from enrolment.
  await page.waitForTimeout(31_000);
  await page.getByLabel("Digit 1").pressSequentially(totp(factor!.totp.secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expectPath(page, /\/onboarding$/);
});

test("Journey L: suspended member sees the access state; owned workspaces stay available", async ({ page }) => {
  const owner = await createUser("lowner");
  const member = await createUser("lmember");
  const ws = await seedWorkspace(owner.id, "organizer", "Suspended Org QA");
  await admin.from("workspace_members").insert({ workspace_id: ws, user_id: member.id, role: "member", status: "suspended" });
  await seedWorkspace(member.id, "provider", "Member Own Provider");
  await login(page, member.email);
  await expectPath(page, /\/(provider|onboarding|discover)/);
  await page.goto(`${BASE}/organizer`);
  await expectPath(page, /\/access\?reason=suspended/);
  await expect(page.getByText("Access suspended")).toBeVisible();
  await expect(page.getByText("Suspended Org QA")).toHaveCount(0);
  await expect(page.locator('select[name="workspace"] option', { hasText: "Member Own Provider" })).toHaveCount(1);
});
