export const NOW = "2026-08-02T10:30:00.000Z";

export function canonical(doctype, name, data, docstatus = 0, tenant = "demo") {
  return {
    tenant_id: tenant,
    doctype,
    name,
    owner: "tester@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : "Draft",
    version: 1,
    created_at: "2026-08-02T07:00:00.000Z",
    modified_at: "2026-08-02T07:00:00.000Z",
    data,
    children: [],
  };
}

export function manufactureStockEntry(overrides = {}, docstatus = 1) {
  return canonical("Stock Entry", "MFG-1", {
    company: "Demo",
    posting_at: "2026-08-02T10:00:00.000Z",
    purpose: "Manufacture",
    work_order: "WO-1",
    target_warehouse: "FG-WH",
    finished_good_item: "FG",
    finished_good_qty: "8",
    finished_good_qty_micros: 8_000_000,
    finished_good_bundle: "FG-BUNDLE",
    finished_good_physical_identity: {
      physical_lot_refs: [{ batch_no: "FG-BATCH", qty_micros: 8_000_000 }],
    },
    items: [
      {
        row_id: "RM-1",
        item_code: "RM",
        qty: "9",
        qty_micros: 9_000_000,
        source_warehouse: "RM-WH",
        serial_and_batch_bundle: "RM-BUNDLE",
        physical_lot_refs: [{ batch_no: "RM-BATCH", qty_micros: 9_000_000 }],
        manufacturing_kind: "Consumption",
      },
      {
        row_id: "REC-1",
        item_code: "REGRIND",
        qty: "1",
        qty_micros: 1_000_000,
        target_warehouse: "SCRAP-WH",
        serial_and_batch_bundle: "REC-BUNDLE",
        physical_lot_refs: [{ batch_no: "RG-BATCH", qty_micros: 1_000_000 }],
        manufacturing_kind: "Scrap",
      },
    ],
    ...overrides,
  }, docstatus);
}

export function baseDocuments(extra = []) {
  const documents = new Map();
  const put = (doc) => documents.set(`${doc.doctype}:${doc.name}`, doc);
  put(canonical("Work Order", "WO-1", {
    company: "Demo", production_item: "FG", bom_no: "BOM-FG-1", qty: "10", qty_micros: 10_000_000,
  }, 1));
  put(canonical("Plastic Recipe Policy", "PRCP-1", {
    company: "Demo", bom: "BOM-FG-1", output_item: "FG", process_profile: "PROC-INJ",
    effective_from: "2026-01-01", effective_to: "2026-12-31",
  }, 1));
  put(canonical("Plastic Process Profile", "PROC-INJ", { process_type: "Injection", uses_tool: 1 }));
  put(canonical("Plastic Machine", "PM-1", {
    company: "Demo", branch: "Plant-1", process_profile: "PROC-INJ", operational_state: "Active", exclusive_resource: 1,
  }));
  put(canonical("Plastic Machine", "PM-2", {
    company: "Demo", branch: "Plant-1", process_profile: "PROC-INJ", operational_state: "Active", exclusive_resource: 1,
  }));
  put(canonical("Plastic Tool", "PT-1", {
    company: "Demo", process_profile: "PROC-INJ", operational_state: "Available", compatible_machines: [{ machine: "PM-1" }],
  }));
  put(manufactureStockEntry());
  for (const doc of extra) put(doc);
  return documents;
}

function standardMasters() {
  return new Map([["Batch:FG-BATCH", { item_code: "FG" }]]);
}

export function makeReader({ documents = baseDocuments(), runs = [], manufactured = 10_000_000, masters = standardMasters() } = {}) {
  return {
    async getDocument(tenant, doctype, name) {
      if (tenant !== "demo") throw new Error("unexpected tenant");
      const document = documents.get(`${doctype}:${name}`) ?? null;
      return document?.tenant_id === tenant ? document : null;
    },
    async listDocumentsByDoctype(tenant, doctype) {
      if (tenant !== "demo") throw new Error("unexpected tenant");
      return doctype === "Plastic Production Run" ? runs.filter((run) => run.tenant_id === tenant) : [];
    },
    async getManufacturedQuantityMicros(tenant) {
      if (tenant !== "demo") throw new Error("unexpected tenant");
      return manufactured;
    },
    async getMasterRecordData(tenant, type, name) {
      if (tenant !== "demo") throw new Error("unexpected tenant");
      return masters.get(`${type}:${name}`) ?? null;
    },
  };
}

export function materialRows(overrides = {}) {
  return [{
    item_code: "RM", source_warehouse: "RM-WH", serial_and_batch_bundle: "RM-BUNDLE",
    batch_no: "RM-BATCH", consumed_qty: "9", ...overrides,
  }];
}

export function outputRows(recoveryOverrides = {}) {
  return [
    {
      output_type: "Good", item_code: "FG", target_warehouse: "FG-WH",
      serial_and_batch_bundle: "FG-BUNDLE", batch_no: "FG-BATCH", qty: "8",
    },
    {
      output_type: "Regrind", item_code: "REGRIND", target_warehouse: "SCRAP-WH",
      serial_and_batch_bundle: "REC-BUNDLE", batch_no: "RG-BATCH", qty: "1", ...recoveryOverrides,
    },
  ];
}

export function runDocument(overrides = {}) {
  return {
    company: "Demo", branch: "Plant-1", work_order: "WO-1", recipe_policy: "PRCP-1",
    process_profile: "PROC-INJ", machine: "PM-1", tool: "PT-1",
    planned_start: "2026-08-02T08:00:00.000Z", planned_end: "2026-08-02T12:00:00.000Z",
    planned_qty: "10", materials: [], outputs: [], run_status: "Planned", ...overrides,
  };
}

export function context({ action = "create", document = runDocument(), existing = null, domainReader = makeReader(), now = NOW } = {}) {
  return {
    command: {
      command_id: `CMD-${action}-${now}`, tenant_id: "demo", action,
      aggregate: { doctype: "Plastic Production Run", name: "PRUN-1" },
      actor: { user_id: "tester@example.com", roles: ["Plastic Production Manager"] },
      document,
    },
    existing,
    now,
    nextVersion: existing ? existing.version + 1 : 1,
    reader: domainReader,
  };
}

export function runningExisting(overrides = {}) {
  return canonical("Plastic Production Run", "PRUN-1", runDocument({
    run_status: "Running", started_at: "2026-08-02T08:05:00.000Z", ...overrides,
  }));
}

export function completedDocument(overrides = {}) {
  return runDocument({
    run_status: "Completed", manufacture_stock_entry: "MFG-1",
    materials: materialRows(), outputs: outputRows(), actual_cycle_seconds: "28.5", shot_count: 250,
    ...overrides,
  });
}
