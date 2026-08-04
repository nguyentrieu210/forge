import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityProfileService } from "../dist/packages/app-registry/src/index.js";

class FakeD1 {
  constructor() {
    this.contracts = [];
    this.revisions = [];
    this.activeRows = new Map();
  }
  withSession() { return this; }
  prepare(sql) {
    return {
      bind: (...args) => ({
        sql,
        args,
        run: async () => this.run(sql, args),
        first: async () => this.first(sql, args),
        all: async () => this.all(sql, args),
      }),
    };
  }
  async batch(statements) {
    const snapshots = {
      contracts: structuredClone(this.contracts),
      revisions: structuredClone(this.revisions),
      activeRows: new Map(structuredClone([...this.activeRows.entries()])),
    };
    try {
      const results = [];
      for (const statement of statements) results.push(await this.run(statement.sql, statement.args));
      return results;
    } catch (error) {
      this.contracts = snapshots.contracts;
      this.revisions = snapshots.revisions;
      this.activeRows = snapshots.activeRows;
      throw error;
    }
  }
  async run(sql, args) {
    if (sql.includes("INSERT INTO app_capability_contracts")) {
      const [tenant_id, app_id, app_version, content_hash, contract_json, registered_at] = args;
      const existing = this.contracts.find((row) => row.tenant_id === tenant_id && row.app_id === app_id && row.content_hash === content_hash);
      const next = { tenant_id, app_id, app_version, content_hash, contract_json, registered_at };
      if (existing) Object.assign(existing, next); else this.contracts.push(next);
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO capability_profile_revisions")) {
      const [tenant_id, profile_id, version, proposal_json, resolution_json, content_hash, applied_by, applied_at] = args;
      if (this.revisions.some((row) => row.tenant_id === tenant_id && row.profile_id === profile_id && (row.version === version || row.content_hash === content_hash))) {
        throw new Error("UNIQUE constraint failed: capability_profile_revisions");
      }
      this.revisions.push({ tenant_id, profile_id, version, proposal_json, resolution_json, content_hash, applied_by, applied_at });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO capability_profile_active")) {
      const [tenant_id, profile_id, version, modified_at] = args;
      this.activeRows.set(tenant_id, { tenant_id, profile_id, version, modified_at });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unexpected SQL run: ${sql}`);
  }
  async all(sql, args) {
    if (sql.includes("FROM app_capability_contracts")) {
      const [tenant] = args;
      return { results: this.contracts.filter((row) => row.tenant_id === tenant).sort((a, b) => a.app_id.localeCompare(b.app_id) || b.registered_at.localeCompare(a.registered_at)) };
    }
    throw new Error(`Unexpected SQL all: ${sql}`);
  }
  async first(sql, args) {
    if (sql.includes("FROM capability_profile_active a")) {
      const [tenant] = args;
      const active = this.activeRows.get(tenant);
      if (!active) return null;
      return this.revisions.find((row) => row.tenant_id === tenant && row.profile_id === active.profile_id && row.version === active.version) ?? null;
    }
    if (sql.includes("MAX(version)")) {
      const [tenant, profile] = args;
      const versions = this.revisions.filter((row) => row.tenant_id === tenant && row.profile_id === profile).map((row) => row.version);
      return { version: versions.length ? Math.max(...versions) : 0 };
    }
    throw new Error(`Unexpected SQL first: ${sql}`);
  }
}

const contract = {
  schema_version: 1,
  package_id: "sales",
  package_version: "1.2.0",
  capabilities: [
    {
      id: "sales.core", label: "Core", required: true, default_state: "enabled", requires: [], conflicts_with: [],
      surfaces: { nav: ["sales-home"], actions: [], screens: [], reports: [], charts: [], validators: [], hooks: [], jobs: [], integrations: [], permissions: [] },
    },
    {
      id: "sales.analytics", label: "Analytics", required: false, default_state: "disabled", requires: [{ capability: "sales.core" }], conflicts_with: [],
      surfaces: { nav: ["sales-analytics"], actions: [], screens: [], reports: [], charts: [], validators: [], hooks: [], jobs: [], integrations: [], permissions: [] },
    },
  ],
};
const installed = [{ app_id: "sales", version: "1.2.0", content_hash: "a".repeat(64) }];

test("capability contracts and active profiles are tenant isolated", async () => {
  const db = new FakeD1();
  const service = new CapabilityProfileService(db);
  await service.store.rememberPackageContract("tenant-a", "sales", "1.2.0", "a".repeat(64), contract, "2026-08-04T00:00:00Z");
  assert.equal((await service.store.contractsForInstalled("tenant-a", installed)).length, 1);
  assert.equal((await service.store.contractsForInstalled("tenant-b", installed)).length, 0);
});

test("profile apply is versioned, idempotent and stale previews fail closed", async () => {
  const db = new FakeD1();
  const service = new CapabilityProfileService(db);
  await service.store.rememberPackageContract("tenant-a", "sales", "1.2.0", "a".repeat(64), contract, "2026-08-04T00:00:00Z");
  const proposal = { profile_id: "pilot", expected_version: 0, selections: [{ capability_id: "sales.analytics", state: "enabled" }] };

  const first = await service.apply("tenant-a", installed, proposal, "Administrator", "2026-08-04T01:00:00Z");
  assert.equal(first.outcome, "applied");
  assert.equal(first.version, 1);

  const second = await service.apply("tenant-a", installed, { ...proposal, expected_version: 1 }, "Administrator", "2026-08-04T01:01:00Z");
  assert.equal(second.outcome, "unchanged");
  assert.equal(second.version, 1);
  assert.equal(db.revisions.length, 1);

  await assert.rejects(
    service.apply("tenant-a", installed, { ...proposal, expected_version: 0 }, "Administrator", "2026-08-04T01:02:00Z"),
    (error) => error?.code === "VERSION_CONFLICT",
  );
});
