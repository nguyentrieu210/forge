import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { afterAll, beforeAll, vi } from "vitest";

const TEST_SYSTEM_TIME = new Date("2026-07-30T12:00:00.000Z");

beforeAll(async () => {
  // The integration suite asserts Frappe's `Today` defaults and year-based naming.
  // Pin Date only so the test remains deterministic while real timers keep working.
  vi.setSystemTime(TEST_SYSTEM_TIME);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

afterAll(() => {
  vi.useRealTimers();
});
