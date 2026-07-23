// Read-only check: does DEV_QA_EMAIL already exist, and does it have a workspace?
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEV_QA_EMAIL;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw listErr;

const user = usersPage.users.find((u) => u.email === email);
console.log(`DEV_QA_EMAIL=${email}`);
console.log(user ? `EXISTS: id=${user.id} created_at=${user.created_at} last_sign_in_at=${user.last_sign_in_at}` : "NOT FOUND");

if (user) {
  const { data: memberships, error: memberErr } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (memberErr) throw memberErr;
  console.log(`Workspace memberships: ${memberships?.length ?? 0}`, memberships ?? []);
}
