// Seeds 48 demo team members into the QA workspace for Team & Staffing QA.
// Idempotent: safe to re-run (checks by email before creating auth users;
// upserts profile/skills/certs/regions rows).
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
const qaEmail = process.env.DEV_QA_EMAIL;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const DEPARTMENTS = ["Events", "Production", "Operations", "Technical", "Creative", "Management"];
const ROLES = [
  { name: "Event Manager", dept: "Events" },
  { name: "Event Producer", dept: "Events" },
  { name: "Production Lead", dept: "Production" },
  { name: "Stage Manager", dept: "Production" },
  { name: "Onsite Coordinator", dept: "Operations" },
  { name: "Logistics Coordinator", dept: "Operations" },
  { name: "Audio Technician", dept: "Technical" },
  { name: "Lighting Director", dept: "Technical" },
  { name: "Video Technician", dept: "Technical" },
  { name: "Rigging Technician", dept: "Technical" },
  { name: "AV Technician", dept: "Technical" },
  { name: "Client Experience Lead", dept: "Creative" },
  { name: "Hospitality Lead", dept: "Operations" },
  { name: "Security Officer", dept: "Operations" },
  { name: "Marketing Coordinator", dept: "Creative" },
];
const SKILL_POOL = [
  "Leadership", "Client Management", "Budgeting", "Vendor Coordination", "Risk Management",
  "Event Planning", "Team Leadership", "Problem Solving", "Audio Systems", "Lighting Systems",
  "Video Systems", "Stage & Rigging", "Live Streaming", "RF & Comms", "Hospitality",
  "Crowd Management", "First Aid", "Health & Safety", "Contract Negotiation", "CRM",
];
const CERT_POOL = [
  { name: "First Aid / CPR", issuer: "Red Cross" },
  { name: "IOSH Working Safely", issuer: "IOSH" },
  { name: "PMP", issuer: "PMI" },
  { name: "Rigging & Truss Safety", issuer: "ETCP" },
  { name: "SIA Door Supervisor", issuer: "SIA" },
  { name: "Working at Heights", issuer: "NEBOSH" },
  { name: "Manual Handling", issuer: "RoSPA" },
];
const REGIONS = ["London, UK", "New York, USA", "Toronto, Canada", "Los Angeles, USA", "Sydney, Australia", "Dublin, Ireland", "Singapore", "Berlin, Germany"];
const EMPLOYMENT_TYPES = ["employee", "employee", "employee", "contractor", "freelancer"];

const NAMED = [
  "Olivia Bennett", "Ethan Carter", "Maya Patel", "Noah Ramirez", "Ava Johnson",
  "Liam O'Connor", "Sophia Nguyen", "James Wilson", "Grace Williams", "Isabella Nguyen",
];
const FIRST = ["Aiden", "Chloe", "Lucas", "Zara", "Mason", "Ruby", "Leo", "Freya", "Oscar", "Nina",
  "Elijah", "Priya", "Daniel", "Amelia", "Marcus", "Hana", "Felix", "Layla", "Jack", "Ines",
  "Theo", "Sasha", "Owen", "Mia", "Kai", "Elena", "Finn", "Nadia", "Cole", "Aria",
  "Milo", "Iris", "Rhys", "Talia", "Sam", "Nora", "Ben", "Ivy", "Dean"];
const LAST = ["Brooks", "Reed", "Foster", "Diaz", "Hayes", "Morgan", "Ellis", "Cross", "Bright", "Quinn",
  "Marsh", "Wren", "Sloan", "Vance", "Pierce", "Rowe", "Kane", "Doyle", "Blake", "Hart",
  "Fox", "Lane", "Grant", "Webb", "Byrne", "Shaw", "Wood", "Neal", "Stone", "Frost",
  "Ash", "Lowe", "Rey", "Vega", "Court", "Snow", "Wolfe", "Gray", "Finch"];

function pick(arr, i) { return arr[i % arr.length]; }

async function ensureWorkspace() {
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 200 });
  const qaUser = usersPage.users.find((u) => u.email === qaEmail);
  if (!qaUser) throw new Error(`QA user ${qaEmail} not found — run seed-qa-user.mjs first`);
  const { data: memberships, error } = await admin
    .from("workspace_members").select("workspace_id").eq("user_id", qaUser.id).is("deleted_at", null).limit(1);
  if (error) throw error;
  if (!memberships?.length) throw new Error("QA user has no workspace");
  return { workspaceId: memberships[0].workspace_id, qaUserId: qaUser.id };
}

async function ensureLookup(table, workspaceId, name, extra = {}) {
  const { data: existing } = await admin.from(table).select("id").eq("workspace_id", workspaceId).eq("name", name).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin.from(table).insert({ workspace_id: workspaceId, name, ...extra }).select("id").single();
  if (error) throw error;
  return created.id;
}

async function main() {
  const { workspaceId } = await ensureWorkspace();
  console.log(`Seeding into workspace ${workspaceId}`);

  const deptIdByName = {};
  for (const d of DEPARTMENTS) deptIdByName[d] = await ensureLookup("team_departments", workspaceId, d);

  const roleIdByName = {};
  for (const r of ROLES) roleIdByName[r.name] = await ensureLookup("staffing_roles", workspaceId, r.name, { department_id: deptIdByName[r.dept] });

  const skillIdByName = {};
  for (const s of SKILL_POOL) skillIdByName[s] = await ensureLookup("skills", workspaceId, s);

  const certIdByName = {};
  for (const c of CERT_POOL) certIdByName[c.name] = await ensureLookup("certification_types", workspaceId, c.name, { issuer: c.issuer });

  const { data: existingUsersPage } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existingByEmail = new Map(existingUsersPage.users.map((u) => [u.email, u]));

  let created = 0;
  for (let i = 0; i < 48; i++) {
    let name, email;
    if (i < NAMED.length) {
      name = NAMED[i];
      email = `demo.${name.toLowerCase().replace(/[^a-z]+/g, ".")}@galadock-demo.example.com`;
    } else {
      const first = pick(FIRST, i - NAMED.length);
      const last = pick(LAST, i - NAMED.length);
      name = `${first} ${last}`;
      email = `demo.${first}.${last}@galadock-demo.example.com`.toLowerCase();
    }

    let user = existingByEmail.get(email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: `Demo-${Math.random().toString(36).slice(2)}!Aa1`,
        email_confirm: true,
        user_metadata: { display_name: name },
      });
      if (error) { console.error(`Failed to create ${email}:`, error.message); continue; }
      user = data.user;
      created++;
    }

    // profile row (idempotent via display_name upsert)
    await admin.from("profiles").upsert({ user_id: user.id, display_name: name }, { onConflict: "user_id" });

    const { data: existingMember } = await admin
      .from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (!existingMember) {
      const role = pick(ROLES, i);
      await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: user.id, role: "member" });
      await admin.from("team_member_profiles").upsert({
        user_id: user.id,
        workspace_id: workspaceId,
        member_code: `TM-${(10000 + i).toString()}`,
        department_id: deptIdByName[role.dept],
        primary_role_id: roleIdByName[role.name],
        employment_type: pick(EMPLOYMENT_TYPES, i),
        home_location: pick(REGIONS, i),
        standard_weekly_hours: 40,
        travel_radius_miles: [25, 50, 100, 150][i % 4],
        willing_to_travel: i % 5 !== 0,
        day_rate_cents: (450 + (i % 12) * 45) * 100,
        hour_rate_cents: (35 + (i % 10) * 6) * 100,
        overtime_rate_cents: (50 + (i % 10) * 8) * 100,
        currency: "GBP",
        rating: Math.round((4.2 + (i % 8) * 0.1) * 10) / 10,
      });

      const skillPicks = [SKILL_POOL[i % SKILL_POOL.length], SKILL_POOL[(i + 3) % SKILL_POOL.length], SKILL_POOL[(i + 7) % SKILL_POOL.length]];
      for (const s of skillPicks) {
        await admin.from("team_member_skills").upsert(
          { workspace_id: workspaceId, user_id: user.id, skill_id: skillIdByName[s], proficiency: ["intermediate", "advanced", "expert"][i % 3] },
          { onConflict: "user_id,skill_id" },
        );
      }

      const cert = CERT_POOL[i % CERT_POOL.length];
      const expiresAt = new Date(Date.now() + (i % 6 === 0 ? -5 : 30 + i * 5) * 86400000);
      await admin.from("team_member_certifications").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        certification_type_id: certIdByName[cert.name],
        status: i % 6 === 0 ? "expired" : i % 5 === 0 ? "expiring_soon" : "valid",
        issued_at: new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
        expires_at: expiresAt.toISOString().slice(0, 10),
      });

      await admin.from("team_member_regions").upsert(
        { workspace_id: workspaceId, user_id: user.id, region_name: pick(REGIONS, i), tier: "primary" },
        { onConflict: "user_id,region_name" },
      );
    }

    if ((i + 1) % 12 === 0) console.log(`  …${i + 1}/48`);
  }

  console.log(`DONE: ${created} new auth users created, 48 profiles ensured in workspace ${workspaceId}.`);
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err, err);
  process.exit(1);
});
