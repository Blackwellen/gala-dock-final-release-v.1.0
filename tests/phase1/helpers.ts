import { createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../../src/types/database";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Service-role client: test setup and teardown only. Never used for the assertions under test. */
export const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
export const anon = () => createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

export const PASSWORD = "Gala-Dock-Test-9!";
const created: string[] = [];

/** Disposable, email-confirmed identity. Removed by cleanup(). */
export async function createUser(label: string, name = "Test User") {
  const email = `p1-${label}-${randomBytes(4).toString("hex")}@gala-dock.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name, terms_version: "2026-10" } });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email };
}

/** A client authenticated as the given user, subject to RLS exactly like the browser. */
export async function signedIn(email: string, password = PASSWORD): Promise<SupabaseClient<Database>> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function cleanup() {
  for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id);
}

/** Creates an active, completed workspace owned by `ownerId` (setup shortcut for authorization tests). */
export async function seedWorkspace(ownerId: string, kind: "organizer" | "provider", name: string) {
  const { data, error } = await admin.from("workspaces").insert({ owner_id: ownerId, kind, name, capabilities: kind === "provider" ? ["venue"] : [], settings: {} }).select("id").single();
  if (error) throw error;
  await admin.from("workspaces").update({ onboarding_complete: true, onboarding_step: "complete" }).eq("id", data.id);
  return data.id;
}

export async function login(page: Page, email: string, next?: string) {
  await page.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** RFC 6238 TOTP (SHA-1, 30s, 6 digits) for authenticator enrolment in tests. */
export function totp(secret: string, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offset));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const o = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function expectPath(page: Page, path: RegExp) {
  await expect(page).toHaveURL(path, { timeout: 60_000 });
}
