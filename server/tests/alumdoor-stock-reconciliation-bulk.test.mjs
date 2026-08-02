import assert from "node:assert/strict";
import test from "node:test";

import { handleBulkStockReconciliationRequest } from "../dist/apps-src/alumdoor-worker/src/bulk-stock-reconciliation.js";

function dataResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function nativeResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function identity(row) {
  return `${String(row.item_code ?? "")}\u0000${String(row.batch_no ?? "")}`;
}

function callbackPath(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/\/+$/, "");
  const resourceIndex = decoded.lastIndexOf("/resource/");
  if (resourceIndex >= 0) return decoded.slice(resourceIndex);
  const apiIndex = decoded.lastIndexOf("/api/v1/");
  return apiIndex >= 0 ? decoded.slice(apiIndex) : decoded;
}

function draft(overrides = {}) {
  return {
    name: "RECON-1",
    modified: "2026-08-02 10:00:00.000001",
    docstatus: 0,
    warehouse: "KHO-1",
    scope: "Toàn kho",
    snapshot_at: "2026-08-02T09:00:00.000Z",
    counted_by: "counter@example.test",
    witnessed_by: "witness@example.test",
    recon_state: "Đang đếm",
    items: [
      { row_id: "ROW-1", item_code: "AL71", batch_no: "B1", book_qty: 10, book_qty_micros: 10_000_000, counted_qty: 10, variance_qty: 0 },
      { row_id: "ROW-2", item_code: "AL72", batch_no: "B2", book_qty: 5, book_qty_micros: 5_000_000, counted_qty: 5, variance_qty: 0 },
    ],
    ...overrides,
  };
}

function createPlatform({ initial = draft(), itemGroups = {}, previewSideEffects = {} } = {}) {
  let current = structuredClone(initial);
  let previews = 0;
  let updates = 0;
  let submits = 0;
  let lastPreviewItems = [];

  const platform = {
    async fetch(outbound) {
      const url = new URL(outbound.url);
      const path = callbackPath(url.pathname);
      if (outbound.method === "GET" && path === `/resource/Stock Reconciliation/${current.name}`) {
        return dataResponse(structuredClone(current));
      }
      if (outbound.method === "GET" && path.startsWith("/resource/Item/")) {
        const itemCode = path.slice("/resource/Item/".length);
        return dataResponse({ item_code: itemCode, item_group: itemGroups[itemCode] ?? "Nhôm" });
      }
      if (outbound.method === "POST" && path === "/api/v1/inventory/stock-reconciliation/preview") {
        previews += 1;
        const body = await outbound.json();
        assert.equal(body.name, current.name);
        assert.equal(body.modified, current.modified, "preview must lock the version read by the bulk worker");
        lastPreviewItems = structuredClone(body.document.items ?? []);
        const currentByIdentity = new Map((current.items ?? []).map((row) => [identity(row), row]));
        const items = lastPreviewItems.map((row) => {
          const original = currentByIdentity.get(identity(row));
          const bookQty = Number(row.book_qty ?? original?.book_qty ?? 0);
          const countedQty = Number(row.counted_qty ?? 0);
          const varianceQty = countedQty - bookQty;
          if (varianceQty !== 0 && !row.variance_reason) {
            throw new Error(`mock controller: ${row.item_code} requires variance reason`);
          }
          return {
            ...row,
            book_qty: bookQty,
            book_qty_micros: Math.round(bookQty * 1_000_000),
            variance_qty: varianceQty,
            variance_qty_micros: Math.round(varianceQty * 1_000_000),
          };
        });
        return nativeResponse({
          doctype: "Stock Reconciliation",
          name: current.name,
          expected_version: 1,
          planned_version: 2,
          document: { ...body.document, items },
          side_effects: {
            gl_entries: 0,
            stock_entries: 0,
            payment_entries: 0,
            fulfillment_entries: 0,
            stock_bundle_usages: 0,
            ...previewSideEffects,
          },
        });
      }
      if (outbound.method === "PUT" && path === `/resource/Stock Reconciliation/${current.name}`) {
        updates += 1;
        const body = await outbound.json();
        assert.equal(body.modified, current.modified, "commit must use optimistic modified token from the draft read");
        current = {
          ...current,
          ...body,
          name: current.name,
          docstatus: 0,
          modified: `2026-08-02 10:00:00.${String(updates + 1).padStart(6, "0")}`,
        };
        return dataResponse(structuredClone(current));
      }
      if (path.includes("frappe.client.submit")) {
        submits += 1;
        throw new Error("bulk reconciliation must never submit");
      }
      throw new Error(`unexpected ${outbound.method} ${path}`);
    },
  };

  return {
    platform,
    get current() { return current; },
    get previews() { return previews; },
    get updates() { return updates; },
    get submits() { return submits; },
    get lastPreviewItems() { return lastPreviewItems; },
  };
}

function request(lines, overrides = {}, tenant = true) {
  const headers = {
    "content-type": "application/json",
    "x-cloudforge-callback": "https://gateway.local/api",
    authorization: "Bearer qa",
    "x-cloudforge-app": "alumdoor",
    "x-cloudforge-identity": "qa-user",
    "x-cloudforge-identity-signature": "signed",
  };
  if (tenant) headers["x-cloudforge-tenant"] = "alu";
  return new Request("https://app.local/api/method/alumdoor.inventory.bulk_reconciliation", {
    method: "POST",
    headers,
    body: JSON.stringify({ args: { reconciliation: "RECON-1", lines, ...overrides } }),
  });
}

const counted = (itemCode, batchNo, qty, reason = "") => ({
  item_code: itemCode,
  batch_no: batchNo,
  counted_qty: qty,
  ...(reason ? { variance_reason: reason } : {}),
});

test("bulk reconciliation preview requires full snapshot coverage, preserves snapshot order and appends surplus rows", async () => {
  const state = createPlatform();
  const result = await handleBulkStockReconciliationRequest(request([
    counted("AL72", "B2", 4, "Sai số đếm"),
    counted("AL71", "B1", 10),
    { ...counted("AL73", "B3", 2, "Khác"), variance_note: "Tìm thấy lô chưa ghi nhận", valuation_rate: 100000 },
  ]), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 200, body.message);
  assert.deepEqual(state.lastPreviewItems.map((row) => [row.item_code, row.batch_no]), [
    ["AL71", "B1"],
    ["AL72", "B2"],
    ["AL73", "B3"],
  ]);
  assert.deepEqual(body.items.map((row) => [row.item_code, row.book_qty, row.counted_qty, row.variance_qty]), [
    ["AL71", 10, 10, 0],
    ["AL72", 5, 4, -1],
    ["AL73", 0, 2, 2],
  ]);
  assert.equal(body.existing_rows, 2);
  assert.equal(body.extra_rows, 1);
  assert.equal(state.previews, 1);
  assert.equal(state.updates, 0, "preview must not mutate the draft");
  assert.equal(state.submits, 0);
});

test("bulk reconciliation fails closed when pasted data omits a snapshot row", async () => {
  const state = createPlatform();
  const result = await handleBulkStockReconciliationRequest(request([
    counted("AL71", "B1", 10),
  ]), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 422);
  assert.match(body.message, /đủ mọi dòng đã chốt sổ|thiếu 1 dòng/i);
  assert.equal(state.previews, 0);
  assert.equal(state.updates, 0);
});

test("bulk reconciliation rejects duplicate and aggregate-vs-batch physical identities", async () => {
  const duplicateState = createPlatform();
  const duplicate = await handleBulkStockReconciliationRequest(request([
    counted("AL71", "B1", 10),
    counted("AL71", "B1", 10),
    counted("AL72", "B2", 5),
  ]), { PLATFORM: duplicateState.platform }, false);
  assert.equal(duplicate.status, 422);
  assert.match((await duplicate.json()).message, /trùng dòng/i);
  assert.equal(duplicateState.previews, 0);

  const ambiguousState = createPlatform();
  const ambiguous = await handleBulkStockReconciliationRequest(request([
    counted("AL71", "B1", 10),
    counted("AL72", "B2", 5),
    counted("AL71", "", 1, "Sai số đếm"),
  ]), { PLATFORM: ambiguousState.platform }, false);
  assert.equal(ambiguous.status, 422);
  assert.match((await ambiguous.json()).message, /vừa có dòng tổng vừa có dòng theo lô/i);
  assert.equal(ambiguousState.previews, 0);
});

test("bulk reconciliation commit updates one canonical draft and exact retry is idempotent", async () => {
  const state = createPlatform();
  const lines = [
    counted("AL71", "B1", 9, "Sai số đếm"),
    counted("AL72", "B2", 5),
  ];
  const first = await handleBulkStockReconciliationRequest(request(lines), { PLATFORM: state.platform }, true);
  const firstBody = await first.json();
  assert.equal(first.status, 200, firstBody.message);
  assert.equal(firstBody.reconciliation, "RECON-1");
  assert.equal(firstBody.draft, true);
  assert.equal(firstBody.replayed, false);
  assert.equal(state.updates, 1);
  assert.equal(state.submits, 0, "bulk commit must not submit or post stock ledger");
  assert.equal(state.current.docstatus, 0);
  assert.equal(state.current.items[0].counted_qty, 9);

  const retry = await handleBulkStockReconciliationRequest(request(lines), { PLATFORM: state.platform }, true);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200, retryBody.message);
  assert.equal(retryBody.replayed, true);
  assert.equal(state.previews, 2, "retry still revalidates permission/controller plan");
  assert.equal(state.updates, 1, "exact retry must not create another draft version");
  assert.equal(state.submits, 0);
});

test("bulk reconciliation enforces existing scope for new physical surplus rows", async () => {
  const state = createPlatform({
    initial: draft({ scope: "Theo nhóm hàng", item_group: "Nhôm" }),
    itemGroups: { OTHER: "Phụ kiện" },
  });
  const result = await handleBulkStockReconciliationRequest(request([
    counted("AL71", "B1", 10),
    counted("AL72", "B2", 5),
    counted("OTHER", "X1", 1, "Khác"),
  ]), { PLATFORM: state.platform }, false);
  const body = await result.json();
  assert.equal(result.status, 422);
  assert.match(body.message, /nằm ngoài nhóm hàng Nhôm/i);
  assert.equal(state.previews, 0);
  assert.equal(state.updates, 0);
});

test("bulk reconciliation refuses preview plans with side effects", async () => {
  const state = createPlatform({ previewSideEffects: { stock_entries: 1 } });
  const result = await handleBulkStockReconciliationRequest(request([
    counted("AL71", "B1", 10),
    counted("AL72", "B2", 5),
  ]), { PLATFORM: state.platform }, true);
  const body = await result.json();
  assert.equal(result.status, 422);
  assert.match(body.message, /side effect/i);
  assert.equal(state.updates, 0);
  assert.equal(state.submits, 0);
});

test("bulk reconciliation requires platform tenant and caps pasted rows at 500", async () => {
  const state = createPlatform();
  const noTenant = await handleBulkStockReconciliationRequest(request([
    counted("AL71", "B1", 10),
    counted("AL72", "B2", 5),
  ], {}, false), { PLATFORM: state.platform }, false);
  assert.equal(noTenant.status, 403);

  const tooMany = await handleBulkStockReconciliationRequest(request(
    Array.from({ length: 501 }, (_, index) => counted(`ITEM-${index}`, `B-${index}`, 0)),
  ), { PLATFORM: state.platform }, false);
  assert.equal(tooMany.status, 422);
  assert.match((await tooMany.json()).message, /tối đa 500 dòng/i);
});
