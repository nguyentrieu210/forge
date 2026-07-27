import { defineConfig, devices } from "@playwright/test";

/**
 * The generic runtime, in a real browser, against the LIVE Cloudflare deployment.
 *
 * No `webServer`. That absence is the point of this config: every other browser suite here
 * starts `serve-cookie-proxy.mjs` on loopback, because the client bundle lived on a
 * developer's machine while the API lived on Cloudflare, and the session cookie is
 * `Secure`+`SameSite=Lax` — a browser will not send it across origins. The proxy existed
 * only to fake same-origin.
 *
 * The gateway now serves the bundle itself, so the origin under test is the real one. What
 * that proves is not cosmetic: it means an app installed on a tenant is reachable by a user
 * with a URL and nothing else — no build, no host, no proxy.
 *
 *   FORGE_ORIGIN=https://…workers.dev FORGE_USER=… FORGE_PASSWORD=… \
 *     npx playwright test --config playwright.runtime.config.ts
 */
const ORIGIN = process.env.FORGE_ORIGIN;
if (!ORIGIN) throw new Error("FORGE_ORIGIN is required — the deployed gateway to test against");

export default defineConfig({
  testDir: "./tests-runtime",
  timeout: 90_000,
  reporter: [["list"]],
  // One worker: the tests act on the same documents through the same Durable Object, and
  // parallel writes to one queue contend in ways that read as product flake.
  workers: 1,
  use: { baseURL: ORIGIN, trace: "off" },
  projects: [
    { name: "runtime-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "runtime-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
