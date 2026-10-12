// Runs SQL against the linked project through the Supabase Management API.
// Usage: node --env-file=.env --env-file=.env.local scripts/supabase-sql.mjs <file.sql | -e "sql">
import fs from "node:fs/promises";
const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY."); process.exit(1); }
const query = (process.argv[2] === "-e" ? process.argv[3] : await fs.readFile(process.argv[2], "utf8")).replace(/^\uFEFF/, "");
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }), signal: AbortSignal.timeout(60_000),
});
const text = await response.text();
if (!response.ok) { console.error(`HTTP ${response.status}: ${text}`); process.exit(1); }
console.log(text);
