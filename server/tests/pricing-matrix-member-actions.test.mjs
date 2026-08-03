import assert from "node:assert/strict";
import test from "node:test";

import { addItemUom, PRICING_ITEM_UOM_ADD_ACTION } from "../dist/packages/clouderp-pricing/src/member-actions.js";
import { CloudForgeError } from "../dist/packages/core/src/index.js";

const actor = { user_id: "u1", roles: ["Sales Master Manager"] };

function context() {
  const updates = [];
  const records = new Map([
    ["Item:ITEM-1", { name: "ITEM-1", version: 4, modifiedAt: "2026-08-03T00:00:04Z", data: {
      item_name: "Thanh nhôm", stock_uom: "Cái", default_sales_uom: "Cái", default_purchase_uom: "Cái",
      uom_conversions: [], disabled: 0,
    } }],
    ["UOM:Cái", { name: "Cái", version: 1, modifiedAt: "2026-08-03T00:00:01Z", data: { uom_name: "Cái", disabled: 0 } }],
    ["UOM:Thùng", { name: "Thùng", version: 1, modifiedAt: "2026-08-03T00:00:01Z", data: { uom_name: "Thùng", disabled: 0 } }],
  ]);
  const authority = {
    tenantId: "tenant-a",
    actor,
    records: {
      async get({ doctype, name }) { return structuredClone(records.get(`${doctype}:${name}`) ?? null); },
      async list({ doctype }) { return { rows: doctype === "Item Price" ? [] : [] }; },
    },
    permissions: {
      async assert() {},
      async can() { return true; },
    },
    mutations: {
      async create() { throw new Error("unexpected create"); },
      async update(input) {
        updates.push(structuredClone(input));
        const current = records.get(`${input.doctype}:${input.name}`);
        const next = {
          ...current,
          version: current.version + 1,
          modifiedAt: "2026-08-03T00:00:05Z",
          data: { ...current.data, ...structuredClone(input.patch) },
        };
        records.set(`${input.doctype}:${input.name}`, next);
        return { record: structuredClone(next) };
      },
    },
  };
  return { authority, updates, records };
}

test("pricing.item_uom.add delegates to canonical Matrix commit authority", async () => {
  assert.equal(PRICING_ITEM_UOM_ADD_ACTION, "pricing.item_uom.add");
  const { authority, updates, records } = context();
  const result = await addItemUom(authority, {
    requestId: "req-add-thung",
    itemCode: "ITEM-1",
    itemVersion: 4,
    uom: "Thùng",
    conversionFactor: 10,
  });
  assert.equal(result.item_version, 5);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].doctype, "Item");
  assert.equal(updates[0].name, "ITEM-1");
  assert.equal(updates[0].expectedVersion, 4);
  assert.deepEqual(updates[0].patch.uom_conversions, [{ uom: "Thùng", conversion_factor: 10 }]);
  assert.deepEqual(records.get("Item:ITEM-1").data.uom_conversions, [{ uom: "Thùng", conversion_factor: 10 }]);
});

test("pricing.item_uom.add inherits stock-UOM safety and OCC from Matrix authority", async () => {
  const first = context();
  await assert.rejects(
    addItemUom(first.authority, {
      requestId: "req-stock-invalid",
      itemCode: "ITEM-1",
      itemVersion: 4,
      uom: "Cái",
      conversionFactor: 2,
    }),
    (error) => error instanceof CloudForgeError && error.code === "VALIDATION_ERROR" && /Stock UOM/.test(error.message),
  );
  assert.equal(first.updates.length, 0);

  const stale = context();
  await assert.rejects(
    addItemUom(stale.authority, {
      requestId: "req-stale",
      itemCode: "ITEM-1",
      itemVersion: 3,
      uom: "Thùng",
      conversionFactor: 10,
    }),
    (error) => error instanceof CloudForgeError && error.code === "VERSION_CONFLICT",
  );
  assert.equal(stale.updates.length, 0);
});
