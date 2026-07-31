import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDist = path.join(here, "..", "apps", "runtime", "dist");
const port = process.env.FORGE_UI_QA_PORT ?? "4192";

export default defineConfig({
  testDir: "./ui-tests",
  outputDir: "./test-results/ui-visual",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/ui-visual", open: "never" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "tablet-chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } },
    },
    {
      name: "mobile-chrome",
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
      BACKEND: "http://127.0.0.1:9",
      PORT: port,
    },
  },
});
