import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const khoDir = path.join(here, "..", "apps", "kho");
const port = process.env.FORGE_WAREHOUSE_QA_PORT ?? "4194";

export default defineConfig({
  testDir: "./warehouse-tests",
  outputDir: "./test-results/warehouse-mobile",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/warehouse-mobile", open: "never" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "compact-phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --config vite.mobile.config.ts --host 127.0.0.1 --port ${port}`,
    cwd: khoDir,
    url: `http://127.0.0.1:${port}/mobile/warehouse/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
