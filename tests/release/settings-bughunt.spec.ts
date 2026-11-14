import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DELETION_GRACE_DAYS, deletionDate, memberRoleError, passwordUpdateError, removeMemberError, stepUpError, workspacePatchProblem, workspaceSettingsError } from "../../src/lib/settings/rules";

// Q60 settings bug hunt (Phase A, code + DB). Pure / source checks only: no network, no dev server.
const src = (f: string) => readFileSync(f, "utf8");

test("change password no longer signs in again on the cookie client (captcha + MFA broke it); it verifies via verify_my_password", () => {
  const a = src("src/lib/actions/account.ts");
  const fn = a.slice(a.indexOf("export async function changePassword"), a.indexOf("export async function accountDeletion"));
  expect(fn).not.toMatch(/signInWithPassword/);
  expect(fn).toMatch(/rpc\("verify_my_password", \{ p_password: current \}\)/);
  expect(fn).toMatch(/passwordUpdateError\(error\)/);
  expect(fn).toMatch(/rpc\("revoke_other_sessions"\)/);          // the success copy promises other devices are signed out
  expect(fn).toMatch(/writeAudit\(ctx\.user\.id, null, "auth\.password_changed"/);
  const m = src("supabase/migrations/202611146031_settings_verify_password.sql");
  expect(m).toMatch(/security definer set search_path = ''/);
  expect(m).toMatch(/where u\.id = uid/);                          // own row only
  expect(m).toMatch(/hit_rate_limit\('verify-password:'/);
  expect(m).toMatch(/revoke all on function public\.verify_my_password\(text\) from public, anon/);
});

test("password update errors map to actionable copy (insufficient_aal for MFA users, same/weak password)", () => {
  expect(passwordUpdateError({ code: "insufficient_aal" })).toMatch(/authenticator/);
  expect(passwordUpdateError({ code: "same_password" })).toMatch(/haven't used/);
  expect(passwordUpdateError({ code: "weak_password" })).toMatch(/too weak/);
  expect(passwordUpdateError({ code: "reauthentication_needed" })).toMatch(/sign back in/);
  expect(passwordUpdateError({ message: "boom" })).toBe("Could not change your password.");
});

test("deletion grace period matches the worker (14 days) everywhere the user is told", () => {
  expect(DELETION_GRACE_DAYS).toBe(14);
  expect(src("supabase/migrations/202610270008_privacy.sql")).toMatch(/deletion_requested_at < now\(\) - interval '14 days'/);
  expect(deletionDate("2026-11-01T00:00:00Z").toISOString()).toBe("2026-11-15T00:00:00.000Z");
  for (const f of ["src/components/customer/account-client.tsx", "src/lib/actions/account.ts", "src/app/(customer)/account/page.tsx"]) {
    expect(src(f)).not.toMatch(/30 days|30-day|30 \* 864e5/);
  }
  expect(src("src/app/(legal)/data-retention/page.tsx")).toMatch(/14 days after you ask us to delete your account/);
});

test("scheduling deletion checks blockers and step-up first, and is audited", () => {
  const a = src("src/lib/actions/account.ts");
  const fn = a.slice(a.indexOf("export async function accountDeletion"), a.indexOf("export async function calendarFeed"));
  expect(fn.indexOf('rpc("require_step_up"')).toBeGreaterThan(-1);
  expect(fn.indexOf('rpc("deletion_blockers")')).toBeGreaterThan(-1);
  expect(fn.indexOf('rpc("deletion_blockers")')).toBeLessThan(fn.indexOf('rpc("request_account_deletion"'));
  expect(fn).toMatch(/privacy\.deletion_requested/);
});

test("step-up and settings errors are explained instead of 'Could not save'", () => {
  expect(stepUpError("step_up_required")).toMatch(/authenticator/);
  expect(stepUpError("mfa_required")).toMatch(/requires two-step/);
  expect(stepUpError("other")).toBeNull();
  expect(workspaceSettingsError("invalid_timezone")).toMatch(/timezone/);
  expect(workspaceSettingsError("invalid_currency")).toMatch(/currency/);
  expect(workspaceSettingsError("not_authorized")).toMatch(/owners and managers/);
  expect(memberRoleError("step_up_required")).toMatch(/authenticator/);
  expect(memberRoleError("owner_locked")).toMatch(/owner's role/);
  expect(removeMemberError("cannot_change_owner")).toMatch(/owner can't be removed/);
});

test("workspace patches the database would silently ignore are refused up front", () => {
  expect(workspacePatchProblem({ name: "A" })).toMatch(/2 and 80/);
  expect(workspacePatchProblem({ name: "Acme Events" })).toBeNull();
  expect(workspacePatchProblem({ cover_image: "http://example.com/x.png" })).toMatch(/https/);
  expect(workspacePatchProblem({ cover_image: "" })).toBeNull();
  expect(workspacePatchProblem({ cover_image: "https://cdn.example.com/x.png" })).toBeNull();
  expect(workspacePatchProblem({ brand_color: "blue" })).toMatch(/hex/);
  expect(workspacePatchProblem({ brand_color: "#2563EB" })).toBeNull();
  expect(src("src/lib/actions/workspace-settings.ts")).toMatch(/workspacePatchProblem\(p\.data\)/);
});

test("team actions audit through the service role (clients have no INSERT on audit_events) and detect no-op updates", () => {
  const t = src("src/lib/actions/team.ts");
  expect(t).not.toMatch(/from\("audit_events"\)\.insert/);
  expect(t).toMatch(/await writeAudit\(ctx\.user\.id, ctx\.workspace\.id, event, metadata\)/);
  expect((t.match(/if \(!saved\) return \{ ok: false, error: "Person not found\." \}/g) ?? []).length).toBe(2);
});

test("owners can remove and restore members in organiser and provider settings; provider invite link is absolute", () => {
  const ws = src("src/lib/actions/workspace-settings.ts");
  expect(ws).toMatch(/rpc\("revoke_workspace_member", \{ p_ws: ctx\.workspace\.id, p_user: userId, p_status: restore \? "active" : "revoked"/);
  expect(ws).toMatch(/if \(ctx\.role !== "owner"\)/);
  expect(src("src/app/organizer/settings/page.tsx")).toMatch(/<RemoveMember userId=\{m\.user_id\}/);
  const pa = src("src/app/provider/settings/actions.ts");
  expect(pa).toMatch(/export async function removeMember\(userId: string, restore = false\)/);
  expect(pa).toMatch(/\$\{siteUrl\(\)\}\/invite\/\$\{created\.token\}/);
  expect(src("src/app/provider/settings/page.tsx")).toMatch(/action=\{removeMember\} args=\{\[m\.user_id\]\}/);
});

test("data export includes the personal records that were missing", () => {
  const e = src("src/app/api/account/export/route.ts");
  for (const k of ["following", "enquiries", "merch_orders", "support_cases", "form_responses", "waivers_signed", "private_uploads", "consents", "privacy_subject_records"]) expect(e).toContain(`q("${k}"`);
  expect(e).toMatch(/avatar_url/);
  expect(e).toMatch(/terms_accepted_at/);
  expect(e).not.toMatch(/token_hash|stripe_customer_id|calendar_token|encrypted_password/);
});

test("organiser locale card shows the effective business country and offers lists, not free text", () => {
  const p = src("src/app/organizer/settings/page.tsx");
  expect(p).toMatch(/workspaceCountryValue\(s\)/);
  expect(p).toMatch(/key: "timezone", label: "Default timezone", value: String\(s\.timezone \?\? "Europe\/London"\), options: tzOptions/);
  expect(p).toMatch(/\.\.\.\(fixedCountry \? \[\] :/);
});
