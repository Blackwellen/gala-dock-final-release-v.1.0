import { mkdir, writeFile } from "node:fs/promises";

const pat = process.env.SUPABASE_PAT_KEY;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!pat || !ref) {
  console.error("Missing SUPABASE_PAT_KEY or SUPABASE_PROJECT_REF.");
  process.exit(1);
}

try {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
    {
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}.`);
  const result = await response.json();
  if (typeof result.types !== "string" || !result.types.includes("export type Database")) {
    throw new Error("Supabase did not return valid database types.");
  }
  const destination = new URL("../src/types/database.ts", import.meta.url);
  await mkdir(new URL("../src/types/", import.meta.url), { recursive: true });
  await writeFile(destination, result.types);
  console.log("Updated src/types/database.ts from the live public schema.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Type generation failed.");
  process.exitCode = 1;
}
