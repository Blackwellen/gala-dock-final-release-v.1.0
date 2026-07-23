// One-off dev helper: ensure the DEV_QA_EMAIL user exists with a workspace so
// /api/dev/auto-signin (Chrome MCP visual QA) can establish a session.
// Safe to re-run — it's idempotent (checks before creating).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnvLocal() {
  const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEV_QA_EMAIL;

if (!url || !anonKey || !serviceKey || !email) {
  console.error("Missing one of NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / DEV_QA_EMAIL");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const tempPassword = `Qa-${randomUUID()}!`;

async function main() {
  console.log(`Checking for existing QA user: ${email}`);
  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;

  let user = usersPage.users.find((u) => u.email === email);

  if (!user) {
    console.log("Not found — creating auth user…");
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: "QA Tester" },
    });
    if (createErr) throw createErr;
    user = created.user;
    console.log(`Created auth user ${user.id}`);
  } else {
    console.log(`Found existing auth user ${user.id} — setting a fresh password so we can sign in.`);
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password: tempPassword });
    if (updateErr) throw updateErr;
  }

  // Does this user already belong to a workspace?
  const { data: memberships, error: memberErr } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (memberErr) throw memberErr;

  if (memberships && memberships.length > 0) {
    console.log(`User already has ${memberships.length} workspace membership(s) — nothing else to do.`);
    console.log("DONE: QA user ready.");
    return;
  }

  console.log("No workspace yet — signing in as the QA user to call create_workspace_for_current_user…");
  const anon = createClient(url, anonKey);
  const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({ email, password: tempPassword });
  if (signInErr) throw signInErr;

  const slug = `qa-team-staffing-${Date.now().toString(36)}`;
  const { data: ws, error: rpcErr } = await anon.rpc("create_workspace_for_current_user", {
    _name: "QA Test Workspace",
    _slug: slug,
    _timezone: "Europe/London",
    _currency: "GBP",
  });
  if (rpcErr) throw rpcErr;
  console.log("Created workspace:", ws);

  await anon.auth.signOut();
  console.log("DONE: QA user ready with a fresh workspace.");
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exit(1);
});
