// Applies only the reviewed event-map version-lock migration. Never logs credentials or database records.
import fs from "node:fs/promises";
if (!process.argv.includes("--apply")) throw new Error("Use --apply to apply the reviewed migration");
if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_PAT_KEY) throw new Error("Missing database management configuration");
const query = await fs.readFile("supabase/migrations/202610280038_event_plan_version_lock.sql", "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Migration application failed: HTTP ${response.status}`);
if (!Array.isArray(await response.json())) throw new Error("Unexpected database result");
console.log("Applied 202610280038_event_plan_version_lock.sql");
