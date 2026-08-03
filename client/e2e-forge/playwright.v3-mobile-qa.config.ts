import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDist = path.join(here, "..", "apps", "runtime", "dist");
const port = process.env.FORGE_V3_QA_PORT ?? "4192";

export default defineConfig({
  testDir: ".",
  testMatch: "ui-tests/v3-mobile-qa.spec.ts",
  outputDir: "./test-results/v3-mobile-qa",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/v3-mobile-qa", open: "never" }],
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
      name: "mobile-pixel-7",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-compact",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "reduced-motion-dark",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
        reducedMotion: "reduce",
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
      BACKEND: "http://127.0.0.1:9",
      PORT: port,
    },
  },
});
