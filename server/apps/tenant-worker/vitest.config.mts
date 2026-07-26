import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(directory, "wrangler.jsonc") },
      miniflare: {
        // Pin the test runtime to a compat date the locally-installed workerd
        // supports; production keeps its own (newer) date in wrangler.jsonc.
        compatibilityDate: "2026-07-17",
        bindings: {
          AUTH_MODE: "development",
          TENANT_ID: "demo",
          DEV_ACTOR_JSON: JSON.stringify({ user_id: "Administrator", roles: ["System Manager"] }),
          INTERNAL_AUTH_SECRET: "test-internal-auth-secret-at-least-32-characters",
          INTERNAL_SERVICE_TOKEN: "test-internal-service-token",
          TEST_MIGRATIONS: await readD1Migrations(path.join(directory, "../../migrations/tenant")),
        },
      },
    })),
  ],
  // Root the suite at this app dir so include/setup globs resolve here and not
  // at the repo cwd (where `npm run test:workers` is invoked from).
  root: directory,
  test: {
    include: ["test/**/*.integration.test.mts"],
    setupFiles: ["./test/apply-migrations.mts"],
    testTimeout: 30_000,
  },
});
