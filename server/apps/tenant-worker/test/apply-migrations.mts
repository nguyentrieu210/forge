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

  // Some permission tests temporarily remove System Manager from their acting user.
  // Keep a second test-only administrator so the production last-admin trigger remains
  // enforced while those tests exercise the lower-privilege catalog response.
  const now = TEST_SYSTEM_TIME.toISOString();
  await env.DB.prepare(
    `INSERT INTO roles(tenant_id,role,modified_at) VALUES('demo','System Manager',?1)
     ON CONFLICT(tenant_id,role) DO NOTHING`,
  ).bind(now).run();
  await env.DB.prepare(
    `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
     VALUES('demo','backup-admin@example.com','Backup Admin','backup-admin@example.com','test-only-password-hash','en','UTC',?1,?1)
     ON CONFLICT(tenant_id,user_id) DO NOTHING`,
  ).bind(now).run();
  await env.DB.prepare(
    `INSERT INTO user_roles(tenant_id,user_id,role) VALUES('demo','backup-admin@example.com','System Manager')
     ON CONFLICT DO NOTHING`,
  ).run();
});
