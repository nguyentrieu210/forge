import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AppHookDispatcher,
  satisfiesMinimumVersionRequirement,
} from "../dist/packages/app-registry/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const repoRoot = path.resolve(serverRoot, "..");

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

test("R5 package version requirement is fail-closed and accepts >= minimum semantics", () => {
  assert.equal(satisfiesMinimumVersionRequirement("1.3.0", "1.3.0"), true);
  assert.equal(satisfiesMinimumVersionRequirement("1.4.0", ">=1.3.0"), true);
  assert.equal(satisfiesMinimumVersionRequirement("1.2.9", ">=1.3.0"), false);
  assert.equal(satisfiesMinimumVersionRequirement("2.0.0", ">=1.3.0"), true);
  assert.throws(() => satisfiesMinimumVersionRequirement("1.3.0", "^1.3.0"), /semantic version/i);
  assert.throws(() => satisfiesMinimumVersionRequirement("1.3.0", ">=1.3"), /semantic version/i);
});

test("R5 HRM package explicitly declares Bank Account as external ERP authority", () => {
  const manifest = JSON.parse(read("server/apps-src/hrm/app.json"));
  assert.ok(
    manifest.externalDocTypes.some((entry) => entry.name === "Bank Account" && entry.app === "erpnext" && entry.kind === "master"),
    "HRM must declare the shared Bank Account master instead of relying on an implicit Link target",
  );
});

test("R5 capability-disabled hook fanout performs no delivery persistence", async () => {
  let touchedDb = false;
  const db = {
    batch() { touchedDb = true; throw new Error("DB must not be touched for disabled hook fanout"); },
    prepare() { touchedDb = true; throw new Error("DB must not be touched for disabled hook fanout"); },
  };
  const dispatcher = new AppHookDispatcher(db, {
    resolveTarget: async () => null,
  });
  const outcomes = await dispatcher.fanOut(
    "tenant-a",
    {
      event_id: "evt-r5-disabled",
      tenant_id: "tenant-a",
      event_type: "sales_order.submitted",
      aggregate_type: "Sales Order",
      aggregate_id: "SO-1",
      occurred_at: "2026-08-04T00:00:00.000Z",
      payload: {},
    },
    [{ appId: "sample", worker: "sample-worker" }],
    "2026-08-04T00:00:00.000Z",
  );
  assert.deepEqual(outcomes, []);
  assert.equal(touchedDb, false);
});

test("R5 tenant runtime composes workplace maintenance and capability-aware hooks", () => {
  const wrapper = read("server/apps/tenant-worker/src/index-core.ts");
  const base = read("server/apps/tenant-worker/src/index-core-base.ts");
  assert.match(wrapper, /runWorkplaceScheduledNotifications/);
  assert.match(wrapper, /resolveTarget:\s*hookResolver\(env\)/);
  assert.match(wrapper, /\/internal\/events/);
  assert.match(wrapper, /\/internal\/maintenance/);
  assert.match(wrapper, /runBaseMaintenance\(withoutDispatcher\(env\), tenantId\)/);
  assert.match(base, /export async function runMaintenance/);
});

test("R5 capability admin facade is session, CSRF and System Manager gated", () => {
  const facade = read("server/apps/tenant-worker/src/index.ts");
  assert.match(facade, /metaforge\.api\.get_capability_profile/);
  assert.match(facade, /metaforge\.api\.preview_capability_profile/);
  assert.match(facade, /metaforge\.api\.apply_capability_profile/);
  assert.match(facade, /establishSession/);
  assert.match(facade, /assertSessionCsrf/);
  assert.match(facade, /System Manager is required/);
  assert.match(facade, /currentCapabilityProfile/);
  assert.match(facade, /previewCapabilityProfile/);
  assert.match(facade, /applyCapabilityProfile/);
});

test("R5 runtime exposes hosted capability profile admin without replacing normal runtime", () => {
  const entry = read("client/apps/runtime/src/main.tsx");
  const base = read("client/apps/runtime/src/main-base.tsx");
  const admin = read("client/apps/runtime/src/CapabilityProfileAdmin.tsx");
  assert.match(entry, /\/app-factory\/capabilities/);
  assert.match(entry, /import\("\.\/main-base\.js"\)/);
  assert.match(base, /function RuntimeRoutes/);
  assert.match(admin, /CapabilityProfileBuilder/);
  assert.match(admin, /get_capability_profile/);
  assert.match(admin, /preview_capability_profile/);
  assert.match(admin, /apply_capability_profile/);
  assert.match(admin, /x-frappe-csrf-token/);
});
