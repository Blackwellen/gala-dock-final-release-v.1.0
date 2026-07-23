// Development workspace fixture seeder for the Gala Dock typed shell namespaces.
// Uses the local service-role credential only on the server; it is idempotent and never overwrites rows.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const TARGET_EMAIL = "jamahlthomas1996@gmail.com";
const FIXTURES = [
  ["Jamahl Event Management", "organizer"],
  ["Jamahl Event Agency", "organizer"],
  ["Jamahl Corporate Events", "organizer"],
  ["Jamahl Venue Group", "venue"],
  ["Jamahl Supplier Studio", "supplier"],
  ["Jamahl Supplier Collective", "supplier"],
  ["Jamahl Live Entertainment", "supplier"],
];

function loadLocalEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server credentials in .env.local");

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const user = users.users.find((candidate) => candidate.email?.toLowerCase() === TARGET_EMAIL);
  if (!user) throw new Error(`Target user ${TARGET_EMAIL} does not exist. Run scripts/provision-jamahl-access.mjs first.`);

  const report = [];
  for (const [name, workspaceType] of FIXTURES) {
    const slug = slugify(name);
    const { data: existing, error: existingError } = await admin
      .from("workspaces")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();
    if (existingError) throw existingError;

    const workspace = existing ?? (await admin
      .from("workspaces")
      .insert({
        name,
        slug,
        owner_user_id: user.id,
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
      .single());

    if ("error" in workspace && workspace.error) throw workspace.error;
    const record = "data" in workspace ? workspace.data : workspace;
    if (!record) throw new Error(`Could not resolve workspace ${name}`);

    const { data: membership, error: memberError } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", record.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!membership) {
      const { error: insertMemberError } = await admin.from("workspace_members").insert({
        workspace_id: record.id,
        user_id: user.id,
        role: "owner",
        joined_at: new Date().toISOString(),
      });
      if (insertMemberError) throw insertMemberError;
    }

    report.push({ name: record.name, workspaceType, workspaceId: record.id, created: !existing });
  }

  console.log(JSON.stringify({ user: TARGET_EMAIL, workspaceCount: report.length, workspaces: report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
