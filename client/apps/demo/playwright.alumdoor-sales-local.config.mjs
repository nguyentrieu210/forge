import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "alumdoor-sales-create.local.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.FORGE_ALUMDOOR_E2E_ORIGIN ?? "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1500, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
