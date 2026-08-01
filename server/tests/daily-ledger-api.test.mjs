import test from "node:test";
import assert from "node:assert/strict";
import {
  isDailyLedgerApiPath,
  isDailyLedgerFrappePath,
  routeDailyLedgerApi,
} from "../dist/apps/tenant-worker/src/daily-ledger-api.js";

function makeRequest(path, body, method = "POST") {
  return new Request(`https://tenant.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function makeContext(actor) {
  return {
    db: {},
    tenantId: "tenant-from-server",
    actor,
    traceId: "trace-daily-ledger-test",
  };
}

function service(overrides = {}) {
  return {
    async generate() { throw new Error("unexpected generate"); },
    async read() { throw new Error("unexpected read"); },
    async reconcile() { throw new Error("unexpected reconcile"); },
    async freeze() { throw new Error("unexpected freeze"); },
    async adjust() { throw new Error("unexpected adjust"); },
    ...overrides,
  };
}

test("daily ledger route classification covers REST and Frappe contracts", () => {
  assert.equal(isDailyLedgerApiPath("/api/v1/daily-ledger/generate"), true);
  assert.equal(isDailyLedgerApiPath("/api/v1/reports/daily-detailed-ledger"), true);
  assert.equal(isDailyLedgerFrappePath("/api/method/metaforge.accounts.daily_detailed_ledger"), true);
  assert.equal(isDailyLedgerApiPath("/api/resource/Sales Order"), false);
});

test("daily ledger tenant scope comes only from authenticated server context", async () => {
  let seenTenant = "";
  const fake = service({
    async generate(tenantId) {
      seenTenant = tenantId;
      return {
        snapshot_id: "DLS-1",
        context_key: "ctx",
        source_fingerprint: "a".repeat(64),
        line_count: 0,
        existing: false,
        frozen: false,
      };
    },
  });

  const actor = { user_id: "accounts@example.test", roles: ["Accounts User"] };
  const request = makeRequest("/api/v1/daily-ledger/generate", {
    ledger_date: "2026-08-01",
    company: "ALUMDOOR",
  });
  const response = await routeDailyLedgerApi(request, new URL(request.url), makeContext(actor), { service: fake });
  assert.equal(response?.status, 200);
  assert.equal(seenTenant, "tenant-from-server");

  const injected = makeRequest("/api/v1/daily-ledger/generate", {
    tenant_id: "attacker-tenant",
    ledger_date: "2026-08-01",
    company: "ALUMDOOR",
  });
  await assert.rejects(
    () => routeDailyLedgerApi(injected, new URL(injected.url), makeContext(actor), { service: fake }),
    (error) => error?.code === "VALIDATION_ERROR" && /server context/i.test(error.message),
  );
});

test("Daily Detailed Ledger report uses centralized accounting permission", async () => {
  const fake = service({
    async read(tenantId, snapshotId) {
      assert.equal(tenantId, "tenant-from-server");
      assert.equal(snapshotId, "DLS-1");
      return [{ snapshot_id: snapshotId, domain: "Finance" }];
    },
  });

  const allowed = { user_id: "accountant@example.test", roles: ["Accounts User"] };
  const request = makeRequest("/api/v1/reports/daily-detailed-ledger", { snapshot_id: "DLS-1" });
  const response = await routeDailyLedgerApi(request, new URL(request.url), makeContext(allowed), { service: fake });
  assert.equal(response?.status, 200);
  const payload = await response.json();
  assert.equal(payload[0].snapshot_id, "DLS-1");

  const denied = { user_id: "stock@example.test", roles: ["Stock Manager"] };
  const deniedRequest = makeRequest("/api/v1/reports/daily-detailed-ledger", { snapshot_id: "DLS-1" });
  await assert.rejects(
    () => routeDailyLedgerApi(deniedRequest, new URL(deniedRequest.url), makeContext(denied), { service: fake }),
    (error) => error?.code === "PERMISSION_DENIED" && error.status === 403,
  );
});

test("Daily Detailed Ledger Frappe report unwraps args and wraps result in message", async () => {
  const fake = service({
    async read(tenantId, snapshotId) {
      assert.equal(tenantId, "tenant-from-server");
      assert.equal(snapshotId, "DLS-FRAPPE");
      return [{ snapshot_id: snapshotId, domain: "Sales" }];
    },
  });
  const actor = { user_id: "chief@example.test", roles: ["Chief Accountant"] };
  const request = makeRequest("/api/method/metaforge.accounts.daily_detailed_ledger", {
    args: JSON.stringify({ snapshot_id: "DLS-FRAPPE" }),
  });
  const response = await routeDailyLedgerApi(request, new URL(request.url), makeContext(actor), { service: fake });
  assert.equal(response?.status, 200);
  assert.deepEqual(await response.json(), { message: [{ snapshot_id: "DLS-FRAPPE", domain: "Sales" }] });
});

test("daily ledger REST endpoints reject non-POST methods without invoking storage", async () => {
  const actor = { user_id: "accounts@example.test", roles: ["Accounts User"] };
  const request = makeRequest("/api/v1/daily-ledger/reconcile", undefined, "GET");
  const response = await routeDailyLedgerApi(request, new URL(request.url), makeContext(actor), { service: service() });
  assert.equal(response?.status, 405);
  assert.equal(response?.headers.get("allow"), "POST");
});
