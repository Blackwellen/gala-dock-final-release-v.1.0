# Gala Dock

A blank Next.js app with TypeScript, App Router, and ESLint.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000. Edit `src/app/page.tsx` to build your home page.
The existing `Designs/` directory contains project design assets.

## Checks and production

```bash
npm run lint
npm run build
npm start
```

## Supabase

Connected project: **Gala Dock** (`sgonzfolwjlcaiggrbbj`, London).
Local credentials are in `.env.local`, which Git ignores. The management PAT
stays in `.env`. `.env.example` documents the required variable names.

- Browser components: `createClient` from `@/lib/supabase/client`.
- Server Components, Server Actions, and Route Handlers: await `createClient`
  from `@/lib/supabase/server` for the signed-in user's permissions.
- Trusted server operations: `createAdminClient` from `@/lib/supabase/admin`.
  This uses the service role, bypasses RLS, and is blocked from browser imports.
  Authenticate and authorize callers before performing admin operations.

The proxy refreshes and verifies cookie-based sessions. Clients support database
queries, Auth, Storage, Realtime, and Edge Functions through the Supabase SDK.
Database types in `src/types/database.ts` come from the project's public schema.
The public schema currently has no application tables.

```bash
npm run supabase:check
npm run supabase:types
```

The connection check verifies the Database API, Auth admin, Storage admin, and
public key without modifying records. Regenerate types after schema changes.
For deployment, configure the variables from `.env.local` on your host; the
management PAT is needed only for regenerating types locally.

Client setup follows the [Supabase Next.js SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
