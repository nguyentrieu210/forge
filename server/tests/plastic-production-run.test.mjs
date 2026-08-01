import assert from "node:assert/strict";
import test from "node:test";
import { PlasticProductionRunController } from "../dist/packages/clouderp-erpnext/src/plastic-production.js";

const controller = new PlasticProductionRunController();
const NOW = "2026-08-02T08:00:00.000Z";

function canonical(doctype, name, data, docstatus = 0) {
  return {
    tenant_id: "demo",
    doctype,
    name,
    owner: "tester@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : "Draft",
    version: 1,
    created_at: NOW,
    modified_at: NOW,
    data,
    children: [],
  };
}

function baseDocuments(overrides = {}) {
  const documents = new Map();
  const put = (doc) => documents.set(`${doc.doctype}:${doc.name}`, doc);
  put(canonical("Work Order", "WO-1", {
    company: "Demo",
    production_item: "FG",
    bom_no: "BOM-FG-1",
    qty: "10",
    qty_micros: 10_000_000,
  }, 1));
  put(canonical("Plastic Recipe Policy", "PRCP-1", {
    company: "Demo",
    bom: "BOM-FG-1",
    process_profile: "PROC-INJ",
  }, 1));
  put(canonical("Plastic Process Profile", "PROC-INJ", {
    process_type: "Injection",
    uses_tool: 1,
  }));
  put(canonical("Plastic Machine", "PM-1", {
    company: "Demo",
    process_profile: "PROC-INJ",
    status: "Active",
    exclusive_resource: 1,
  }));
  put(canonical("Plastic Machine", "PM-2", {
    company: "Demo",
    process_profile: "PROC-INJ",
    status: "Active",
    exclusive_resource: 1,
  }));
  put(canonical("Plastic Tool", "PT-1", {
    company: "Demo",
    process_profile: "PROC-INJ",
    status: "Available",
    compatible_machines: [{ machine: "PM-1" }],
  }));
  put(canonical("Stock Entry", "MFG-1", {
    company: "Demo",
    purpose: "Manufacture",
    work_order: "WO-1",
  }, 1));
  put(canonical("Batch", "BATCH-FG-1", { item: "FG" }, 0));
  for (const doc of overrides.documents ?? []) put(doc);
  return documents;
}

function reader(options = {}) {
  const documents = options.documents ?? baseDocuments();
  const runs = options.runs ?? [];
  const manufactured = options.manufactured ?? 10_000_000;
  return {
    async getDocument(_tenant, doctype, name) {
      return documents.get(`${doctype}:${name}`) ?? null;
    },
    async listDocumentsByDoctype(_tenant, doctype) {
      return doctype === "Plastic Production Run" ? runs : [];
    },
    async getManufacturedQuantityMicros() {
      return manufactured;
    },
  };
}

function runDocument(overrides = {}) {
  return {
    company: "Demo",
    branch: "Plant-1",
    work_order: "WO-1",
    recipe_policy: "PRCP-1",
    process_profile: "PROC-INJ",
    machine: "PM-1",
    tool: "PT-1",
    planned_start: "2026-08-02T08:00:00.000Z",
    planned_end: "2026-08-02T10:00:00.000Z",
    planned_qty: "10",
    good_qty: "0",
    scrap_qty: "0",
    regrind_qty: "0",
    run_status: "Planned",
    ...overrides,
  };
}

function context({ action = "create", document = runDocument(), existing = null, domainReader = reader() } = {}) {
  return {
    command: {
      command_id: `CMD-${action}`,
      tenant_id: "demo",
      action,
      aggregate: { doctype: "Plastic Production Run", name: "PRUN-1" },
      actor: { user_id: "tester@example.com", roles: ["Plastic Production Manager"] },
      document,
    },
    existing,
    now: NOW,
    nextVersion: existing ? existing.version + 1 : 1,
    reader: domainReader,
  };
}

test("new Production Run must begin Planned", async () => {
  await assert.rejects(
    controller.normalize(context({ document: runDocument({ run_status: "Running", started_at: NOW }) })),
    /must start in Planned state/i,
  );
});

test("Production Run rejects tool on an unapproved machine", async () => {
  await assert.rejects(
    controller.normalize(context({ document: runDocument({ machine: "PM-2" }) })),
    /not approved for machine PM-2/i,
  );
});

test("Production Run rejects overlapping exclusive machine or tool allocation", async () => {
  const overlap = canonical("Plastic Production Run", "PRUN-OTHER", {
    machine: "PM-1",
    tool: "PT-1",
    planned_start: "2026-08-02T09:00:00.000Z",
    planned_end: "2026-08-02T11:00:00.000Z",
    run_status: "Planned",
  });
  await assert.rejects(
    controller.normalize(context({ domainReader: reader({ runs: [overlap] }) })),
    /already has an overlapping Production Run/i,
  );
});

test("completed Production Run cannot report more good output than posted manufacture", async () => {
  const existing = canonical("Plastic Production Run", "PRUN-1", runDocument({
    run_status: "Running",
    started_at: NOW,
  }));
  await assert.rejects(
    controller.normalize(context({
      action: "submit",
      existing,
      document: runDocument({
        run_status: "Completed",
        started_at: NOW,
        ended_at: "2026-08-02T09:30:00.000Z",
        good_qty: "8",
        scrap_qty: "1",
        regrind_qty: "0.5",
        manufacture_stock_entry: "MFG-1",
        output_batch: "BATCH-FG-1",
      }),
      domainReader: reader({ manufactured: 7_000_000 }),
    })),
    /exceeds posted manufactured quantity/i,
  );
});

test("completed Production Run reconciles to canonical Work Order and Manufacture Stock Entry", async () => {
  const existing = canonical("Plastic Production Run", "PRUN-1", runDocument({
    run_status: "Running",
    started_at: NOW,
  }));
  const normalized = await controller.normalize(context({
    action: "submit",
    existing,
    document: runDocument({
      run_status: "Completed",
      started_at: NOW,
      ended_at: "2026-08-02T09:30:00.000Z",
      good_qty: "8",
      scrap_qty: "1",
      regrind_qty: "0.5",
      manufacture_stock_entry: "MFG-1",
      output_batch: "BATCH-FG-1",
      actual_cycle_seconds: "28.5",
      shot_count: 250,
      downtime_minutes: 12,
    }),
  }));
  assert.equal(normalized.good_qty, "8.000000");
  assert.equal(normalized.scrap_qty, "1.000000");
  assert.equal(normalized.regrind_qty, "0.500000");
  assert.equal(normalized.run_status, "Completed");
  assert.equal(normalized.manufacture_stock_entry, "MFG-1");
});
