// Gala Dock — apply a SQL file to the linked Supabase project via the Management API.
// Usage: node scripts/db/apply-sql.mjs <path-to-sql>
// Reads SUPABASE_ACCESS_TOKEN (PAT) from .env.local / .env. Never prints the token.
import { readFileSync } from "node:fs";

const REF = "yepewcsuuaanoiabwscf";

function loadEnv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return env;
}

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error("Usage: node scripts/db/apply-sql.mjs <path-to-sql>");
    process.exit(1);
  }
  const env = loadEnv();
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("Missing SUPABASE_ACCESS_TOKEN in .env.local/.env");
    process.exit(2);
  }
  const query = readFileSync(sqlPath, "utf8");
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, text.slice(0, 800));
    process.exit(1);
  }
  console.log(`Applied ${sqlPath} — HTTP ${res.status}. Response:`, text.slice(0, 400) || "(no rows)");
}

main().catch((e) => {
  console.error("Error:", e?.message ?? e);
  process.exit(1);
});
