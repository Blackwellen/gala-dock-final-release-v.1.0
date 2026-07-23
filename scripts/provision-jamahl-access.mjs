// Idempotent provisioning script for jamahlthomas1996@gmail.com — creates/attaches
// all five access contexts described in the auth/onboarding rebuild spec:
//   1. Event Manager workspace (owner)
//   2. Venue Manager workspace (owner)
//   3. Supplier workspace (owner)
//   4. Customer portal profile (standalone, no workspace)
//   5. Affiliate account (standalone, no workspace, pre-approved/active)
//
// Uses the Supabase service-role client directly (bypasses RLS by design — this
// is an admin provisioning script, not a user-facing flow) rather than the
// create_workspace_for_current_user RPC, because that RPC requires signing in
// as the target user, and this script must NEVER touch/reset an existing
// user's real password to do so.
//
// Safe to re-run: every step checks-before-creating. Existing rows are left
// untouched (never overwritten), so reruns cannot clobber real user data.
//
// Usage: node scripts/provision-jamahl-access.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = "jamahlthomas1996@gmail.com".toLowerCase();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  authUser: null,
  authUserCreated: false,
  magicLink: null,
  workspaces: {},
  customerProfile: null,
  affiliateAccount: null,
  errors: [],
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(baseName) {
  const base = slugify(baseName);
  let candidate = base;
  let suffix = 0;
  // Small bounded loop — collisions on a hand-picked seed name are extremely
  // unlikely, but this stays correct/idempotent if the script is ever rerun
  // after a manual rename.
  while (suffix < 50) {
    const { data, error } = await admin.from("workspaces").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  throw new Error(`Could not find a free slug for "${baseName}"`);
}

async function resolveOrCreateAuthUser() {
  console.log(`Resolving auth user for ${TARGET_EMAIL}…`);
  let page = 1;
  let found = null;
  while (page <= 10 && !found) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    found = data.users.find((u) => (u.email ?? "").toLowerCase() === TARGET_EMAIL) ?? null;
    if (data.users.length < 200) break;
    page += 1;
  }

  if (found) {
    console.log(`Found existing auth user ${found.id} — leaving credentials untouched.`);
    report.authUser = found.id;
    report.authUserCreated = false;
    return found;
  }

  console.log("Not found — creating a new auth user (no password set).");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TARGET_EMAIL,
    email_confirm: true,
    user_metadata: { display_name: "Jamahl Thomas" },
  });
  if (createError) throw createError;
  report.authUser = created.user.id;
  report.authUserCreated = true;

  // No plaintext password is ever set. Generate a one-time magic link so the
  // operator can hand it to Jamahl to establish his own password securely.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TARGET_EMAIL,
  });
  if (!linkError) report.magicLink = linkData.properties?.action_link ?? null;

  return created.user;
}

async function ensureProfile(userId) {
  const { data: existing, error: fetchError } = await admin
    .from("profiles")
    .select("user_id, active_workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (!existing) {
    const { error: insertError } = await admin
      .from("profiles")
      .insert({ user_id: userId, display_name: "Jamahl Thomas", timezone: "Europe/London" });
    if (insertError) throw insertError;
  }
  return existing;
}

async function ensureOperatorWorkspace(userId, workspaceType, name) {
  // An "active operator workspace" here means: a non-deleted workspace_members
  // row for this user pointing at a workspace of this workspace_type. Filtered
  // in JS after the fetch rather than via a dotted embedded-resource filter,
  // to keep the query shape unambiguous.
  const { data: memberships, error: memberError } = await admin
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name, workspace_type)")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (memberError) throw memberError;

  const existingMembership = (memberships ?? []).find((m) => m.workspaces?.workspace_type === workspaceType);
  if (existingMembership) {
    const ws = existingMembership.workspaces;
    console.log(`Found existing ${workspaceType} workspace "${ws.name}" (${ws.id}) — leaving as-is.`);
    report.workspaces[workspaceType] = { id: ws.id, name: ws.name, created: false };
    return ws.id;
  }

  console.log(`No ${workspaceType} workspace found — creating "${name}"…`);
  const slug = await uniqueSlug(name);
  const { data: workspace, error: createError } = await admin
    .from("workspaces")
    .insert({
      name,
      slug,
      owner_user_id: userId,
      workspace_type: workspaceType,
      release_stage: "v1",
      plan: "enterprise",
      country: "GB",
      currency: "GBP",
      locale: "en-GB",
      timezone: "Europe/London",
      activated_at: new Date().toISOString(),
    })
    .select("id, name")
    .single();
  if (createError) throw createError;

  // A DB trigger on workspaces auto-creates the owner workspace_members row
  // (same as create_workspace_for_current_user does) — only insert if it's
  // somehow missing, to stay idempotent against that trigger.
  const { data: autoMember } = await admin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!autoMember) {
    const { error: memberInsertError } = await admin.from("workspace_members").insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: "owner",
      joined_at: new Date().toISOString(),
    });
    if (memberInsertError) throw memberInsertError;
  }

  // Record onboarding as complete for this portal so /auth/resolve never
  // tries to route Jamahl back into a wizard for an already-provisioned
  // workspace.
  const portalType = workspaceType === "organizer" ? "event_manager" : workspaceType === "venue" ? "venue_manager" : "supplier";
  await admin.from("onboarding_sessions").insert({
    user_id: userId,
    portal_type: portalType,
    status: "completed",
    current_step: "complete",
    completed_steps: ["account", "workspace", "complete"],
    workspace_draft_id: workspace.id,
    completed_at: new Date().toISOString(),
  });

  report.workspaces[workspaceType] = { id: workspace.id, name: workspace.name, created: true };
  return workspace.id;
}

async function ensureActiveWorkspaceDefault(userId, eventManagerWorkspaceId) {
  const { data: profile } = await admin
    .from("profiles")
    .select("active_workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile && !profile.active_workspace_id) {
    await admin.from("profiles").update({ active_workspace_id: eventManagerWorkspaceId }).eq("user_id", userId);
  }
}

async function ensureCustomerProfile(userId) {
  const { data: existing, error: fetchError } = await admin
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    console.log(`Found existing customer profile (${existing.id}) — leaving as-is.`);
    report.customerProfile = { id: existing.id, created: false };
    return;
  }

  console.log("Creating customer portal profile…");
  const { data: created, error: insertError } = await admin
    .from("customers")
    .insert({
      user_id: userId,
      email: TARGET_EMAIL,
      full_name: "Jamahl Thomas",
      customer_type: "individual",
      onboarding_completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  await admin.from("onboarding_sessions").insert({
    user_id: userId,
    portal_type: "customer",
    status: "completed",
    current_step: "complete",
    completed_steps: ["account", "preferences", "complete"],
    completed_at: new Date().toISOString(),
  });

  report.customerProfile = { id: created.id, created: true };
}

async function ensureAffiliateAccount(userId) {
  const { data: existing, error: fetchError } = await admin
    .from("affiliate_accounts")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    console.log(`Found existing affiliate account (${existing.id}, status=${existing.status}) — leaving as-is.`);
    report.affiliateAccount = { id: existing.id, status: existing.status, created: false };
    return;
  }

  console.log("Creating approved affiliate account…");
  const { data: created, error: insertError } = await admin
    .from("affiliate_accounts")
    .insert({
      user_id: userId,
      status: "active",
      payout_method: "manual_bank",
      default_currency: "GBP",
      min_payout_currency: "GBP",
      terms_accepted_at: new Date().toISOString(),
      terms_version: "v1",
    })
    .select("id, status")
    .single();
  if (insertError) throw insertError;

  await admin.from("onboarding_sessions").insert({
    user_id: userId,
    portal_type: "affiliate",
    status: "completed",
    current_step: "complete",
    completed_steps: ["apply", "complete"],
    completed_at: new Date().toISOString(),
  });

  report.affiliateAccount = { id: created.id, status: created.status, created: true };
}

async function main() {
  const user = await resolveOrCreateAuthUser();
  await ensureProfile(user.id);

  const eventManagerId = await ensureOperatorWorkspace(user.id, "organizer", "Gala Productions — Event Manager");
  await ensureOperatorWorkspace(user.id, "venue", "Gala Venue Operations — Venue Manager");
  await ensureOperatorWorkspace(user.id, "supplier", "Gala Event Supply — Supplier");
  await ensureActiveWorkspaceDefault(user.id, eventManagerId);

  try {
    await ensureCustomerProfile(user.id);
  } catch (err) {
    console.error("Customer profile step failed (continuing):", err.message ?? err);
    report.errors.push(`customerProfile: ${err.message ?? err}`);
  }

  try {
    await ensureAffiliateAccount(user.id);
  } catch (err) {
    console.error("Affiliate account step failed (continuing):", err.message ?? err);
    report.errors.push(`affiliateAccount: ${err.message ?? err}`);
  }

  console.log("\n=== Provisioning report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\nDONE. Operator workspace switcher should show exactly 3 entries");
  console.log("(Event Manager, Venue Manager, Supplier) — Customer and Affiliate are");
  console.log("intentionally standalone and must never appear there.");
  if (report.magicLink) {
    console.log("\nA new auth user was created with no password. Share this one-time");
    console.log("magic link with Jamahl so he can sign in and set his own password:");
    console.log(report.magicLink);
  }
}

main().catch((err) => {
  report.errors.push(err.message ?? String(err));
  console.error("FAILED:", err.message ?? err);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
});
