import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * MetaForge Desk in a REAL BROWSER against the Forge Frappe-compatible façade.
 *
 * Every other suite proves the façade returns the right bytes. Only this one proves
 * the client AGREES with the contract: a response can be byte-correct and still leave
 * a blank screen if a flag arrives as a boolean where the client's types expect 0/1,
 * or a field is spelled `required` instead of `reqd`.
 *
 * `serve-cookie-proxy.mjs` injects NO Authorization header and forwards only the
 * browser's own cookie, same-origin, exactly like an nginx deploy. A token-injecting
 * proxy would prove the app can run while leaving the cookie path — the one the Desk
 * actually uses — untested. See that file for why e2e-factory's proxy is not reused.
 *
 * The local `tsconfig.json` exists to stop Playwright walking up to
 * `client/tsconfig.json`, whose project references its loader cannot resolve — see the
 * note inside that file.
 *
 * Prerequisites:
 *   server/  npx wrangler d1 migrations apply cloudforge-demo --local --config apps/tenant-worker/wrangler.jsonc
 *   server/  npm run dev:seed
 *   server/  npx wrangler dev --config apps/tenant-worker/wrangler.jsonc --port 8801 --local
 *   client/apps/demo/  VITE_LIVE=1 vite build --outDir dist-live
 */
const here = path.dirname(fileURLToPath(import.meta.url));

// 127.0.0.1, not "localhost": Node's fetch prefers ::1 while wrangler dev binds IPv4.
const BACKEND = process.env.FORGE_BACKEND ?? "http://127.0.0.1:8801";
const APP_DIST = process.env.FORGE_APP_DIST ?? path.join(here, "..", "apps", "demo", "dist-live");
const PORT = process.env.FORGE_PORT ?? "4191";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  reporter: [["list"]],
  // One worker: every test drives the same local backend and, for a given document,
  // the same Durable Object. Parallel files contend and produce timeouts that read as
  // product flake but are harness contention.
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "off" },
  projects: [{ name: "forge-cookie-auth", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node serve-cookie-proxy.mjs`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { APP_DIST, BACKEND, PORT },
  },
});
