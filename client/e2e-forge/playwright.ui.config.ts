import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDist = path.join(here, "..", "apps", "runtime", "dist");
const khoDir = path.join(here, "..", "apps", "kho");
const port = process.env.FORGE_UI_QA_PORT ?? "4192";
const warehousePort = process.env.FORGE_WAREHOUSE_QA_PORT ?? "4194";

export default defineConfig({
  testDir: ".",
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
      testMatch: "ui-tests/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "tablet-chrome",
      testMatch: "ui-tests/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } },
    },
    {
      name: "mobile-chrome",
      testMatch: "ui-tests/**/*.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-compact-qa",
      testMatch: "ui-tests/v3-mobile-qa.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "reduced-motion-dark-qa",
      testMatch: "ui-tests/v3-mobile-qa.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
        reducedMotion: "reduce",
      },
    },
    {
      name: "warehouse-pixel-7",
      testMatch: "warehouse-tests/**/*.spec.ts",
      use: {
        ...devices["Pixel 7"],
        baseURL: `http://127.0.0.1:${warehousePort}`,
      },
    },
    {
      name: "warehouse-compact-phone",
      testMatch: "warehouse-tests/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${warehousePort}`,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
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
    {
      command: `pnpm exec vite preview --config vite.mobile.config.ts --host 127.0.0.1 --port ${warehousePort}`,
      cwd: khoDir,
      url: `http://127.0.0.1:${warehousePort}/mobile/warehouse/`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
