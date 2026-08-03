import { defineConfig, devices } from "@playwright/test";

const FULL_DESKTOP_SUITE = [
  "**/a11y.spec.ts",
  "**/list-responsive.spec.ts",
  "**/metaforge-ui.spec.ts",
  "**/ui-v3-mobile-qa.spec.ts",
];
const RESPONSIVE_SUITE = ["**/ui-v3-mobile-qa.spec.ts"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/v3-mobile-qa", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:8099",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: FULL_DESKTOP_SUITE,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "tablet-chromium",
      testMatch: RESPONSIVE_SUITE,
      use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } },
    },
    {
      name: "mobile-android",
      testMatch: RESPONSIVE_SUITE,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-compact",
      testMatch: RESPONSIVE_SUITE,
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
      testMatch: RESPONSIVE_SUITE,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
        reducedMotion: "reduce",
      },
    },
  ],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 8099 --strictPort",
    url: "http://127.0.0.1:8099",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
