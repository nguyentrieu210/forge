import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDist = path.join(here, "..", "apps", "runtime", "dist");
const port = process.env.FORGE_OPERATOR_QA_PORT ?? "4194";
const backend = process.env.FORGE_OPERATOR_BACKEND ?? "http://127.0.0.1:8801";
const resultsDir = path.join(here, "test-results", "operator-e2e");
const reportDir = path.join(here, "playwright-report", "operator-e2e");

export default defineConfig({
  testDir: "./operator-tests",
  outputDir: resultsDir,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(resultsDir, "playwright-results.json") }],
    ["html", { outputFolder: reportDir, open: "never" }],
    ["./operator-tests/operator-reporter.ts"],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "desktop-operator",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-operator",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "node serve-cookie-proxy.mjs",
    cwd: here,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_DIST: appDist,
      BACKEND: backend,
      PORT: port,
    },
  },
});
