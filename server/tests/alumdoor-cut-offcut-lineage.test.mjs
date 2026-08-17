import assert from "node:assert/strict";
import test from "node:test";

import { validateCutApplyBomAuthority } from "../dist/apps-src/alumdoor-worker/src/cut-bom-authority.js";

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function makeCall(overrides = {}) {
  const docs = {
    "resource/Work%20Order/WO-001": {
      bom_no: "BOM-001",
      production_item: "TP-DOOR",
    },
    "resource/Bill%20of%20Materials/BOM-001": {
      name: "BOM-001",
      docstatus: 1,
      item: "TP-DOOR",
      items: [{ item_code: "NVL-NHOM-A", source_warehouse: "KHO-NVL" }],
    },
    "resource/Cut%20Order/CUT-001": {
      name: "CUT-001",
      work_order: "WO-001",
      items: [{
        row_id: "ROW-1",
        item_code: "NVL-NHOM-A",
        source_warehouse: "KHO-NVL",
        source_batch_no: "BATCH-A",
        serial_and_batch_bundle: "BUNDLE-OUT",
        offcut_bundle: "BUNDLE-IN",
        sheets_cut: 2,
      }],
    },
    "resource/Serial%20and%20Batch%20Bundle/BUNDLE-OUT": {
      name: "BUNDLE-OUT",
      docstatus: 1,
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-NVL",
      type: "Outward",
      entries: [{ row_id: "ROW-1", qty: 2, batch_no: "BATCH-A" }],
    },
    "resource/Serial%20and%20Batch%20Bundle/BUNDLE-IN": {
      name: "BUNDLE-IN",
      docstatus: 1,
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-DAU-THUA",
      type: "Inward",
      entries: [{ row_id: "ROW-1", qty: 2, batch_no: "BATCH-OFFCUT" }],
    },
    "resource/Batch/BATCH-OFFCUT": {
      name: "BATCH-OFFCUT",
      item_code: "NVL-NHOM-A",
      is_offcut: 1,
      parent_batch: "BATCH-A",
      received_warehouse: "KHO-DAU-THUA",
    },
    ...overrides,
  };
  const call = async (path) => {
    if (!(path in docs)) return response({ message: `unexpected ${path}` }, 404);
    return response({ data: docs[path] });
  };
  return call;
}

test("cut apply accepts an inward offcut bundle whose child batch points to the persisted source batch", async () => {
  await validateCutApplyBomAuthority(makeCall(), { cut_order: "CUT-001" });
});

test("cut apply rejects an outward bundle masquerading as the offcut bundle", async () => {
  const call = makeCall({
    "resource/Serial%20and%20Batch%20Bundle/BUNDLE-IN": {
      name: "BUNDLE-IN",
      docstatus: 1,
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-DAU-THUA",
      type: "Outward",
      entries: [{ row_id: "ROW-1", qty: 2, batch_no: "BATCH-OFFCUT" }],
    },
  });
  await assert.rejects(
    () => validateCutApplyBomAuthority(call, { cut_order: "CUT-001" }),
    /BUNDLE-IN phải là Inward/i,
  );
});

test("cut apply rejects an offcut batch whose parent is not the persisted source batch", async () => {
  const call = makeCall({
    "resource/Batch/BATCH-OFFCUT": {
      name: "BATCH-OFFCUT",
      item_code: "NVL-NHOM-A",
      is_offcut: 1,
      parent_batch: "BATCH-KHAC",
      received_warehouse: "KHO-DAU-THUA",
    },
  });
  await assert.rejects(
    () => validateCutApplyBomAuthority(call, { cut_order: "CUT-001" }),
    /BATCH-KHAC.*không khớp source batch BATCH-A/i,
  );
});

test("cut apply rejects an offcut batch whose receive warehouse differs from its inward bundle", async () => {
  const call = makeCall({
    "resource/Batch/BATCH-OFFCUT": {
      name: "BATCH-OFFCUT",
      item_code: "NVL-NHOM-A",
      is_offcut: 1,
      parent_batch: "BATCH-A",
      received_warehouse: "KHO-SAI",
    },
  });
  await assert.rejects(
    () => validateCutApplyBomAuthority(call, { cut_order: "CUT-001" }),
    /KHO-SAI.*không khớp bundle KHO-DAU-THUA/i,
  );
});

test("cut apply rejects an inward offcut bundle with a different quantity", async () => {
  const call = makeCall({
    "resource/Serial%20and%20Batch%20Bundle/BUNDLE-IN": {
      name: "BUNDLE-IN",
      docstatus: 1,
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-DAU-THUA",
      type: "Inward",
      entries: [{ row_id: "ROW-1", qty: 3, batch_no: "BATCH-OFFCUT" }],
    },
  });
  await assert.rejects(
    () => validateCutApplyBomAuthority(call, { cut_order: "CUT-001" }),
    /BUNDLE-IN có số lá 3, không khớp 2 lá/i,
  );
});
