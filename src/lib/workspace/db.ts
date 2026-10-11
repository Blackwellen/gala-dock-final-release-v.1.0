import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

/**
 * Phase 3 tables are newer than the generated `Database` types. Queries still run through the
 * caller's RLS-scoped client; only the TypeScript row typing is relaxed until types are regenerated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, "public", "public", any, any>;
export const untyped = (client: Awaited<ReturnType<typeof createClient>>) => client as unknown as Db;

/** Throws on query errors so pages fail visibly instead of rendering empty operational data. */
type Result = { data: unknown; error: { message: string } | null };
// Row shapes are asserted by the caller (dynamic select strings defeat supabase-js inference).
export async function rows<T>(query: PromiseLike<Result>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as T[] | null) ?? [];
}
export async function one<T>(query: PromiseLike<Result>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as T | null) ?? null;
}
export async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count: n, error } = await query;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

/** Route params are untrusted: reject non-UUIDs before they reach Postgres (404, not 500). */
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
