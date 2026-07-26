import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The HRM app — App-mode, in a real browser, against a real tenant.
 *
 * A separate config rather than a second project in `playwright.config.ts`: that suite
 * serves the DEMO bundle, and one config cannot serve two different `APP_DIST` values
 * from one static server. Keeping them apart also means a failure names which app broke.
 *
 * What this proves that the Desk suite cannot: an operational screen — hand-written
 * React, not generated from metadata — drives real workflow transitions through the
 * SAME generic API surface, with no app-specific endpoint anywhere.
 *
 * Prerequisites:
 *   client/apps/hrm/  npx vite build
 *   a tenant with the `hrm` app installed and at least one Leave Application
 *   pending approval (workflow_state = "Chờ duyệt")
 */
const here = path.dirname(fileURLToPath(import.meta.url));

const BACKEND = process.env.FORGE_BACKEND ?? "http://127.0.0.1:8801";
const APP_DIST = process.env.FORGE_APP_DIST ?? path.join(here, "..", "apps", "hrm", "dist");
const PORT = process.env.FORGE_PORT ?? "4193";

export default defineConfig({
  testDir: "./tests-hrm",
  timeout: 90_000,
  reporter: [["list"]],
  // One worker: the tests act on the same documents through the same Durable Object,
  // and parallel approvals of one queue contend in ways that read as product flake.
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "off" },
  projects: [{ name: "hrm-app-mode", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `node serve-cookie-proxy.mjs`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { APP_DIST, BACKEND, PORT },
  },
});
