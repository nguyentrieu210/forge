import { defineConfig, devices } from "@playwright/test";

/**
 * MetaForge UI PR gate.
 * The config is JavaScript so loading the runner does not traverse app project
 * references. Test files are pinned to the isolated E2E tsconfig below.
 */
export default defineConfig({
  testDir: "./e2e",
  tsconfig: "./e2e/tsconfig.json",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8099",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-pixel7", use: { ...devices["Pixel 7"] } },
    { name: "mobile-iphone13", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm dev -- --host 127.0.0.1 --port 8099",
    url: "http://127.0.0.1:8099",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
