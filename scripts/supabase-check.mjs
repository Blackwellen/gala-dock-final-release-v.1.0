import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase environment variables in .env.local.");
  process.exit(1);
}

const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
  },
});

try {
  const [database, auth, storage, publicAuth] = await Promise.all([
    fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(30_000),
    }),
    client.auth.admin.listUsers({ page: 1, perPage: 1 }),
    client.storage.listBuckets(),
    fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(30_000),
    }),
  ]);

  if (!database.ok) throw new Error(`Database API returned HTTP ${database.status}.`);
  if (auth.error) throw new Error(`Auth check failed: ${auth.error.code ?? auth.error.status}.`);
  if (storage.error) throw new Error("Storage check failed.");
  if (!publicAuth.ok) throw new Error(`Public key check returned HTTP ${publicAuth.status}.`);

  const schema = await database.json();
  const tablePaths = Object.keys(schema.paths ?? {}).filter((path) => path !== "/" && !path.startsWith("/rpc/"));
  console.log(`Connected to ${new URL(url).hostname}.`);
  console.log(`Database API: OK (${tablePaths.length} exposed tables/views).`);
  console.log("Auth admin, Storage admin, and public key: OK.");
  console.log("Read-only checks completed. No records were changed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Supabase connection check failed.");
  process.exitCode = 1;
}
