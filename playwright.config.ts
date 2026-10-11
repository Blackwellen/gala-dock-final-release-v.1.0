import { defineConfig, devices } from "@playwright/test";

// Runs against an already-running dev server (npm run dev -- -p 3107) and the linked Supabase project.
// Load env with: node --env-file=.env.local node_modules/@playwright/test/cli.js test
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
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive/ },
    { name: "responsive", testMatch: /responsive/ },
  ],
});
