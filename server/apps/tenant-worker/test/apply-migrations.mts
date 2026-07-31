import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll } from "vitest";
import * as vitest from "vitest";

const TEST_SYSTEM_TIME = new Date("2026-07-30T12:00:00.000Z");
const vi = (vitest as unknown as {
  vi: { setSystemTime(value: Date): void };
}).vi;

beforeAll(async () => {
  // The integration suite asserts Frappe's `Today` defaults and year-based naming.
  // Pin Date for the complete tenant-worker test process; the worker pool is disposed
  // after the suite, so no global clock state survives into another command.
  vi.setSystemTime(TEST_SYSTEM_TIME);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
