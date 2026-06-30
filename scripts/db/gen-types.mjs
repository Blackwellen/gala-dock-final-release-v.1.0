// Gala Dock — regenerate src/lib/supabase/database.types.ts from the live schema.
// Usage: node scripts/db/gen-types.mjs
import { readFileSync, writeFileSync } from "node:fs";

const REF = "yepewcsuuaanoiabwscf";
const OUT = "src/lib/supabase/database.types.ts";

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
  const token = loadEnv().SUPABASE_ACCESS_TOKEN;
  if (!token) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(2); }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/types/typescript?included_schemas=public`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status}:`, text.slice(0, 600)); process.exit(1); }
  let types;
  try { types = JSON.parse(text).types; } catch { types = text; }
  if (!types || types.length < 1000) { console.error("Unexpected types payload length:", types?.length); process.exit(1); }
  writeFileSync(OUT, types, "utf8");
  const hasType = types.includes("workspace_type");
  const hasStage = types.includes("release_stage");
  console.log(`Wrote ${OUT} (${types.length} bytes). workspace_type:${hasType} release_stage:${hasStage}`);
}

main().catch((e) => { console.error("Error:", e?.message ?? e); process.exit(1); });
