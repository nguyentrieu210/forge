import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { InMemoryMetadataStore, MetadataPermissionService } from "../dist/packages/frappe-model/src/index.js";

const tenantId = "demo";
const now = "2026-07-31T00:00:00.000Z";
const salesActor = { user_id: "sales@example.test", roles: ["Kinh doanh"] };
const accountantActor = { user_id: "accounting@example.test", roles: ["Kế toán"] };

const pricingMasters = [
  {
    doctype: "Price List",
    name: "Bảng giá đại lý",
    createData: { price_list_name: "Bảng giá đại lý" },
    existingData: { price_list_name: "Bảng giá đại lý", currency: "VND" },
    saveData: { currency: "USD" },
  },
  {
    doctype: "Item Price",
    name: "BANG-GIA:ITEM-1:Cái",
    createData: { price_list: "BANG-GIA", item_code: "ITEM-1", uom: "Cái", rate: 120000, currency: "VND" },
    existingData: { price_list: "BANG-GIA", item_code: "ITEM-1", uom: "Cái", rate: 110000, currency: "VND" },
    saveData: { rate: 120000 },
  },
];

async function salesPricingPermissions() {
  const source = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
  const app = compileBrief(source);
  const metadata = new InMemoryMetadataStore();
  for (const { doctype: name } of pricingMasters) {
    const doctype = app.doctypes.find((entry) => entry.name === name);
    assert.ok(doctype, `${name} must be declared by the Alumdoor brief`);
    await metadata.putDocType(tenantId, doctype, "Administrator", now);
  }
  return new MetadataPermissionService(metadata);
}

test("Kinh doanh can read pricing masters but cannot create or edit them", async () => {
  const permissions = await salesPricingPermissions();

  for (const master of pricingMasters) {
    await assert.doesNotReject(permissions.assert({
      tenantId,
      actor: salesActor,
      doctype: master.doctype,
      action: "read",
    }), `${master.doctype} should remain readable to Kinh doanh`);

    await assert.rejects(permissions.assert({
      tenantId,
      actor: salesActor,
      doctype: master.doctype,
      action: "create",
      data: master.createData,
    }), (error) => error?.code === "PERMISSION_DENIED", `${master.doctype} create must be denied`);

    await assert.rejects(permissions.assert({
      tenantId,
      actor: salesActor,
      doctype: master.doctype,
      action: "save",
      name: master.name,
      owner: "accounting@example.test",
      data: master.saveData,
      existingData: master.existingData,
    }), (error) => error?.code === "PERMISSION_DENIED", `${master.doctype} save must be denied`);
  }
});

test("Kế toán retains create and edit authority for pricing masters", async () => {
  const permissions = await salesPricingPermissions();

  for (const master of pricingMasters) {
    await assert.doesNotReject(permissions.assert({
      tenantId,
      actor: accountantActor,
      doctype: master.doctype,
      action: "create",
      data: master.createData,
    }), `${master.doctype} create should remain available to Kế toán`);

    await assert.doesNotReject(permissions.assert({
      tenantId,
      actor: accountantActor,
      doctype: master.doctype,
      action: "save",
      name: master.name,
      owner: "accounting@example.test",
      data: master.saveData,
      existingData: master.existingData,
    }), `${master.doctype} save should remain available to Kế toán`);
  }
});
