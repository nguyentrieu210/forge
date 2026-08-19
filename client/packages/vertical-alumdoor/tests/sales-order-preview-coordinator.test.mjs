import assert from "node:assert/strict";
import test from "node:test";
import {
  applySalesOrderDocumentPreview,
  beginSalesOrderDocumentPreview,
  canApplySalesOrderDocumentPreview,
  createSalesOrderPreviewClock,
  finishSalesOrderDocumentPreview,
  isSalesOrderPersistenceBlocked,
  markSalesOrderDocumentChanged,
} from "../dist/sales-order-v2/preview-coordinator.js";

test("older preview is stale after a newer document mutation", () => {
  const clock = createSalesOrderPreviewClock();
  const oldRevision = beginSalesOrderDocumentPreview(clock);

  markSalesOrderDocumentChanged(clock);
  const currentRevision = beginSalesOrderDocumentPreview(clock);

  assert.equal(canApplySalesOrderDocumentPreview(clock, oldRevision), false);
  assert.equal(canApplySalesOrderDocumentPreview(clock, currentRevision), true);
  assert.equal(clock.pending, 2);

  finishSalesOrderDocumentPreview(clock);
  finishSalesOrderDocumentPreview(clock);
  assert.equal(clock.pending, 0);
});

test("interactive preview patch is merged onto the live header instead of an old request snapshot", () => {
  const liveHeader = {
    customer: "CUSTOMER-B",
    customer_group: "DEALER-B",
    selling_price_list: "PRICE-B",
    grand_total: 10_000_000,
  };

  const next = applySalesOrderDocumentPreview(liveHeader, {
    patch: { grand_total: 12_000_000, vat_amount: 1_000_000 },
    clear: ["customer_group"],
  });

  assert.equal(next.customer, "CUSTOMER-B");
  assert.equal(next.selling_price_list, "PRICE-B");
  assert.equal(next.customer_group, undefined);
  assert.equal(next.grand_total, 12_000_000);
  assert.equal(next.vat_amount, 1_000_000);
});

test("pending preview or preview error blocks persistence", () => {
  const clock = createSalesOrderPreviewClock();
  assert.equal(isSalesOrderPersistenceBlocked(clock, ""), false);

  beginSalesOrderDocumentPreview(clock);
  assert.equal(isSalesOrderPersistenceBlocked(clock, ""), true);

  finishSalesOrderDocumentPreview(clock);
  assert.equal(isSalesOrderPersistenceBlocked(clock, "preview failed"), true);
  assert.equal(isSalesOrderPersistenceBlocked(clock, ""), false);
});
