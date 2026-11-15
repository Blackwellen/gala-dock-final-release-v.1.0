# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: marketplace\agent.spec.ts >> gala agent runtime >> policy modes map risk to auto / approval / suggest / blocked
- Location: tests\marketplace\agent.spec.ts:33:7

# Error details

```
AuthApiError: captcha protection: request disallowed (no captcha_token found)
```

# Test source

```ts
  1  | import { createHmac, randomBytes } from "node:crypto";
  2  | import { createClient, type SupabaseClient } from "@supabase/supabase-js";
  3  | import { expect, type Page } from "@playwright/test";
  4  | import type { Database } from "../../src/types/database";
  5  | 
  6  | export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3107";
  7  | const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  8  | const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  9  | const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  10 | 
  11 | /** Service-role client: test setup and teardown only. Never used for the assertions under test. */
  12 | export const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  13 | export const anon = () => createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  14 | 
  15 | export const PASSWORD = "Gala-Dock-Test-9!";
  16 | const created: string[] = [];
  17 | 
  18 | /** Disposable, email-confirmed identity. Removed by cleanup(). */
  19 | export async function createUser(label: string, name = "Test User") {
  20 |   const email = `p1-${label}-${randomBytes(4).toString("hex")}@gala-dock.test`;
  21 |   const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name, terms_version: "2026-10" } });
  22 |   if (error) throw error;
  23 |   created.push(data.user.id);
  24 |   return { id: data.user.id, email };
  25 | }
  26 | 
  27 | /** A client authenticated as the given user, subject to RLS exactly like the browser. */
  28 | export async function signedIn(email: string, password = PASSWORD): Promise<SupabaseClient<Database>> {
  29 |   const client = anon();
> 30 |   const { error } = await client.auth.signInWithPassword({ email, password });
     |                     ^ AuthApiError: captcha protection: request disallowed (no captcha_token found)
  31 |   if (error) throw error;
  32 |   return client;
  33 | }
  34 | 
  35 | export async function cleanup() {
  36 |   for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id);
  37 | }
  38 | 
  39 | /** Creates an active, completed workspace owned by `ownerId` (setup shortcut for authorization tests). */
  40 | export async function seedWorkspace(ownerId: string, kind: "organizer" | "provider", name: string) {
  41 |   const { data, error } = await admin.from("workspaces").insert({ owner_id: ownerId, kind, name, capabilities: kind === "provider" ? ["venue"] : [], settings: {} }).select("id").single();
  42 |   if (error) throw error;
  43 |   await admin.from("workspaces").update({ onboarding_complete: true, onboarding_step: "complete" }).eq("id", data.id);
  44 |   return data.id;
  45 | }
  46 | 
  47 | export async function login(page: Page, email: string, next?: string) {
  48 |   await page.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  49 |   await page.getByLabel("Email").fill(email);
  50 |   await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  51 |   await page.getByRole("button", { name: "Log in" }).click();
  52 | }
  53 | 
  54 | /** RFC 6238 TOTP (SHA-1, 30s, 6 digits) for authenticator enrolment in tests. */
  55 | export function totp(secret: string, offset = 0) {
  56 |   const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  57 |   let bits = "";
  58 |   for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  59 |   const key = Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  60 |   const counter = Buffer.alloc(8);
  61 |   counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + offset));
  62 |   const hmac = createHmac("sha1", key).update(counter).digest();
  63 |   const o = hmac[hmac.length - 1] & 0xf;
  64 |   return String((hmac.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
  65 | }
  66 | 
  67 | export async function expectPath(page: Page, path: RegExp) {
  68 |   await expect(page).toHaveURL(path, { timeout: 60_000 });
  69 | }
  70 | 
```