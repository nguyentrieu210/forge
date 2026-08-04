import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-r5-capability",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm --dir ../apps/runtime exec vite preview --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/app-factory/capabilities",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
