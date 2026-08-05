import assert from "node:assert/strict";
import test from "node:test";

import { PurchaseReceiptController } from "../dist/packages/clouderp-core/src/controllers.js";

function context(document, action = "create") {
  return {
    command: {
      tenant_id: "alu",
      action,
      aggregate: { doctype: "Purchase Receipt", name: "PR-DIRECT-TEST" },
      actor: { user_id: "qa", roles: ["Stock User"] },
      document,
      command_id: "cmd-direct-receipt",
    },
    reader: {
      async getMasterRecordData(_tenant, doctype, name) {
        if (doctype === "Currency" && name === "VND") return { name: "VND", currency_scale: 0 };
        if (doctype === "Company" && name === "ALUMDOOR") return { name: "ALUMDOOR", default_currency: "VND" };
        if (doctype === "Item" && name === "PK-01") return {
          item_code: "PK-01", stock_uom: "Cái", default_purchase_uom: "Cái", inventory_mode: "Hàng thường", uom_conversions: [],
        };
        return null;
      },
    },
  };
}

const document = {
  supplier: "NCC-A",
  company: "ALUMDOOR",
  currency: "VND",
  posting_at: "2026-08-05T13:30:00.000Z",
  items: [{ row_id: "R1", item_code: "PK-01", warehouse: "KHO-1", qty: 5, uom: "Cái", rate: 120000 }],
};

test("Purchase Receipt normalize accepts a direct supplier receipt without Purchase Order", async () => {
  const controller = new PurchaseReceiptController();
  const normalized = await controller.normalize(context(document));
  assert.equal(normalized.against_purchase_order, undefined);
  assert.equal(normalized.items[0].purchase_order, undefined);
  assert.equal(normalized.items[0].stock_qty, "5.000000");
});

test("purchase_order.progressed event is emitted only when a receipt actually references an order", () => {
  const controller = new PurchaseReceiptController();
  const directEvents = controller.eventTypes(context(document, "submit"), document);
  assert.deepEqual(directEvents, ["stock.posted", "purchase_receipt.submitted"]);

  const linked = { ...document, against_purchase_order: "PO-001" };
  const linkedEvents = controller.eventTypes(context(linked, "submit"), linked);
  assert.deepEqual(linkedEvents, ["stock.posted", "purchase_receipt.submitted", "purchase_order.progressed"]);
});
