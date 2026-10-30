import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

// Runs against an already-running dev server (npm run dev -- -p 3107) and the linked Supabase project.
// Load env with: node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test
// Specs that need server secrets kept in .env (e.g. TICKET_QR_SECRET for tests/release/ticket-credentials.spec.ts) failed when
// only .env.local was passed. Fill any variable that is still missing from .env.local, then .env (Next.js precedence); values
// already in the environment always win and nothing is printed.
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, "utf8")))) if (process.env[k] === undefined) process.env[k] = v;
}
export default defineConfig({
  testDir: "tests",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "artifacts/testing/playwright-results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3107",
    trace: "retain-on-failure",
    launchOptions: { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" },
    // W01 cookie banner: suites start with a recorded choice so the fixed banner never covers controls (tests/e2e/cookie-consent.spec.ts clears it).
    storageState: { cookies: [{ name: "gd_cc", value: "1", domain: new URL(process.env.E2E_BASE_URL ?? "http://localhost:3107").hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive/ },
    { name: "responsive", testMatch: /responsive/ },
  ],
});
