import assert from "node:assert/strict";
import test from "node:test";

import { previewDocument } from "../dist/apps-src/alumdoor-worker/src/ui-document-preview.js";

test("Sales Order document totals include canonical line surcharge before VAT", async () => {
  const result = await previewDocument(async () => new Response(JSON.stringify({ data: null }), {
    headers: { "content-type": "application/json" },
  }), {
    doctype: "Sales Order",
    changed_field: "items",
    doc: {
      vat_rate: 10,
      deposit_amount: 1_000_000,
      items: [{
        item_code: "ITEM-AREA",
        qty: 4.4,
        rate: 580_000,
        amount: 2_552_000,
        discount_amount: 0,
        adjustment_amount: 300_000,
      }],
    },
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.patch.total_amount, 2_552_000);
  assert.equal(body.patch.discount_amount, 0);
  assert.equal(body.patch.surcharge_amount, 300_000);
  assert.equal(body.patch.vat_base_amount, 2_852_000);
  assert.equal(body.patch.vat_amount, 285_200);
  assert.equal(body.patch.grand_total, 3_137_200);
  assert.equal(body.patch.deposit_amount, 1_000_000);
  assert.equal(body.patch.outstanding_amount, 2_137_200);
});

test("changing customer defaults price group but changing another header field preserves the selected group", async () => {
  const customerChanged = await previewDocument(async (path) => {
    assert.match(path, /resource\/Customer\/KH-DAI-LY$/);
    return Response.json({ data: { price_group: "Đại lý", contact_person: "Anh A" } });
  }, {
    doctype: "Sales Order",
    changed_field: "customer",
    doc: { customer: "KH-DAI-LY", items: [] },
  });
  assert.equal(customerChanged.status, 200);
  const customerBody = await customerChanged.json();
  assert.equal(customerBody.patch.customer_group, "Đại lý");

  let reads = 0;
  const dateChanged = await previewDocument(async () => {
    reads += 1;
    return Response.json({ data: { price_group: "Đại lý" } });
  }, {
    doctype: "Sales Order",
    changed_field: "transaction_date",
    doc: { customer: "KH-DAI-LY", customer_group: "Lẻ", transaction_date: "2026-08-19", items: [] },
  });
  assert.equal(dateChanged.status, 200);
  const dateBody = await dateChanged.json();
  assert.equal(reads, 0, "non-customer preview must not reload and overwrite the selected price group");
  assert.equal(dateBody.patch.customer_group, undefined);
  assert.equal(dateBody.patch.selling_price_list, "ALUMDOOR-SELLING");
});
