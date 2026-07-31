import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDist = path.join(here, "..", "apps", "runtime", "dist");
const port = process.env.FORGE_AUTH_QA_PORT ?? "4193";
const backend = process.env.FORGE_AUTH_BACKEND ?? "http://127.0.0.1:8801";

export default defineConfig({
  testDir: "./auth-tests",
  outputDir: "./test-results/auth-session",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/auth-session", open: "never" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
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
