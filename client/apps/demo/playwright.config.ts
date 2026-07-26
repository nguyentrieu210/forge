import { defineConfig, devices } from "@playwright/test";

/**
 * E2E gate (reviewer): UI req chỉ Done khi có screenshot + spec chạy xanh.
 * webServer tự khởi động vite mock (:8099) rồi chạy chromium. Không cần backend (mock mode).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8099",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "vite --port 8099 --strictPort",
    url: "http://localhost:8099",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
