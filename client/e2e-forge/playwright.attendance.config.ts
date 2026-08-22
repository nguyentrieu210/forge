import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The QR attendance spec only needs the generic Runtime bundle.  It intentionally does
 * not start the warehouse visual-QA preview from playwright.ui.config.ts: that preview
 * is unrelated and would make this isolated contract test fail before the page loads.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const appDist = path.join(here, "..", "apps", "runtime", "dist");
const port = process.env.FORGE_ATTENDANCE_QA_PORT ?? "4198";

export default defineConfig({
  testDir: "./ui-tests",
  testMatch: ["alumdoor-attendance-kiosk.spec.ts", "alumdoor-hr-lite.spec.ts"],
  outputDir: "./test-results/attendance-qr",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "attendance-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "attendance-mobile", use: { ...devices["Pixel 7"] } },
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
