import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCutApplyBomAuthority,
  validateCutDraftBomAuthority,
} from "../dist/apps-src/alumdoor-worker/src/cut-bom-authority.js";

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
      items: [
        { item_code: "NVL-NHOM-A", qty: 6, source_warehouse: "KHO-NVL" },
        { item_code: "NVL-NHOM-B", qty: 2, source_warehouse: "KHO-SON" },
      ],
    },
    "resource/Cut%20Order/CUT-001": {
      name: "CUT-001",
      work_order: "WO-001",
      items: [{ item_code: "NVL-NHOM-A", source_warehouse: "KHO-NVL" }],
    },
    ...overrides,
  };
  const requests = [];
  const call = async (path, init = {}) => {
    requests.push({ path, init });
    if (!(path in docs)) return response({ message: `unexpected ${path}` }, 404);
    return response({ data: docs[path] });
  };
  return { call, requests };
}

test("cut draft accepts material and warehouse from the Work Order BOM", async () => {
  const { call } = makeCall();
  await validateCutDraftBomAuthority(call, {
    work_order: "WO-001",
    item_code: "NVL-NHOM-A",
    warehouse: "KHO-NVL",
  });
});

test("cut draft rejects a material outside the Work Order BOM", async () => {
  const { call } = makeCall();
  await assert.rejects(
    () => validateCutDraftBomAuthority(call, {
      work_order: "WO-001",
      item_code: "NVL-NGOAI-BOM",
      warehouse: "KHO-NVL",
    }),
    /NVL-NGOAI-BOM không thuộc BOM BOM-001 của Work Order WO-001/i,
  );
});

test("cut draft rejects a warehouse outside the BOM material source warehouses", async () => {
  const { call } = makeCall();
  await assert.rejects(
    () => validateCutDraftBomAuthority(call, {
      work_order: "WO-001",
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-SAI",
    }),
    /KHO-SAI không khớp kho nguồn BOM cho NVL-NHOM-A/i,
  );
});

test("cut authority fails closed when Work Order has no bom_no", async () => {
  const { call } = makeCall({
    "resource/Work%20Order/WO-001": { production_item: "TP-DOOR" },
  });
  await assert.rejects(
    () => validateCutDraftBomAuthority(call, {
      work_order: "WO-001",
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-NVL",
    }),
    /Work Order WO-001 thiếu bom_no/i,
  );
});

test("cut authority rejects an unsubmitted BOM", async () => {
  const { call } = makeCall({
    "resource/Bill%20of%20Materials/BOM-001": {
      name: "BOM-001",
      docstatus: 0,
      item: "TP-DOOR",
      items: [{ item_code: "NVL-NHOM-A", source_warehouse: "KHO-NVL" }],
    },
  });
  await assert.rejects(
    () => validateCutDraftBomAuthority(call, {
      work_order: "WO-001",
      item_code: "NVL-NHOM-A",
      warehouse: "KHO-NVL",
    }),
    /BOM BOM-001 chưa ghi sổ/i,
  );
});

test("cut apply revalidates stored Cut Order rows against BOM authority", async () => {
  const { call } = makeCall({
    "resource/Cut%20Order/CUT-001": {
      name: "CUT-001",
      work_order: "WO-001",
      items: [{ item_code: "NVL-NGOAI-BOM", source_warehouse: "KHO-NVL" }],
    },
  });
  await assert.rejects(
    () => validateCutApplyBomAuthority(call, { cut_order: "CUT-001" }),
    /NVL-NGOAI-BOM không thuộc BOM BOM-001 của Work Order WO-001/i,
  );
});

test("legacy manual cutting without Work Order remains available", async () => {
  const { call, requests } = makeCall();
  await validateCutDraftBomAuthority(call, {
    item_code: "NVL-NHOM-A",
    warehouse: "KHO-NVL",
  });
  assert.equal(requests.length, 0);
});
