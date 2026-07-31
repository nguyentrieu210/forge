import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import { InMemoryMetadataStore, MetadataPermissionService } from "../dist/packages/frappe-model/src/index.js";

const tenantId = "demo";
const now = "2026-07-31T00:00:00.000Z";
const salesActor = { user_id: "sales@example.test", roles: ["Kinh doanh"] };
const accountantActor = { user_id: "accounting@example.test", roles: ["Kế toán"] };

async function salesPricingPermissions() {
  const source = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
  const app = compileBrief(source);
  const metadata = new InMemoryMetadataStore();
  for (const name of ["Price List", "Item Price"]) {
    const doctype = app.doctypes.find((entry) => entry.name === name);
    assert.ok(doctype, `${name} must be declared by the Alumdoor brief`);
    await metadata.putDocType(tenantId, doctype, "Administrator", now);
  }
  return new MetadataPermissionService(metadata);
}

test("Kinh doanh can read Price List and Item Price but cannot create or edit either master", async () => {
  const permissions = await salesPricingPermissions();

  await assert.doesNotReject(permissions.assert({
    tenantId,
    actor: salesActor,
    doctype: "Price List",
    action: "read",
  }));
  await assert.doesNotReject(permissions.assert({
    tenantId,
    actor: salesActor,
    doctype: "Item Price",
    action: "read",
  }));

  await assert.rejects(permissions.assert({
    tenantId,
    actor: salesActor,
    doctype: "Price List",
    action: "create",
    data: { price_list_name: "Bảng giá tự sửa" },
  }), (error) => error?.code === "PERMISSION_DENIED");

  await assert.rejects(permissions.assert({
    tenantId,
    actor: salesActor,
    doctype: "Item Price",
    action: "save",
    name: "BANG-GIA:ITEM-1:Cái",
    owner: "accounting@example.test",
    data: { rate: 1 },
    existingData: { rate: 120000 },
  }), (error) => error?.code === "PERMISSION_DENIED");
});

test("Kế toán retains create and edit authority for sales price masters", async () => {
  const permissions = await salesPricingPermissions();

  await assert.doesNotReject(permissions.assert({
    tenantId,
    actor: accountantActor,
    doctype: "Price List",
    action: "create",
    data: { price_list_name: "Bảng giá đại lý" },
  }));

  await assert.doesNotReject(permissions.assert({
    tenantId,
    actor: accountantActor,
    doctype: "Item Price",
    action: "save",
    name: "BANG-GIA:ITEM-1:Cái",
    owner: "accounting@example.test",
    data: { rate: 120000 },
    existingData: { rate: 110000 },
  }));
});
