import test from "node:test";
import assert from "node:assert/strict";
import { StockReservationIntegrityController } from "../dist/packages/clouderp-erpnext/src/stock-reservation-integrity.js";

const NOW = "2026-08-03T10:00:00.000Z";
const RESERVED_AT = "2026-08-03T08:00:00.000Z";

function reservation(overrides = {}) {
  return {
    item_code: "AL548", color: "Ghi", condition: "Đã sơn", min_length_m: "4.5",
    warehouse: "KHO-1", qty_reserved: "51", source_doctype: "Production Order", source_name: "LSX-1",
    reserved_at: RESERVED_AT, expires_at: "2026-08-04T08:00:00.000Z", state: "Đang giữ", ...overrides,
  };
}

function reader({ warehouseCompany, sourceCompany, disabled = 0, isGroup = 0 } = {}) {
  return {
    async getMasterRecordData(_tenantId, type, name) {
      if (type === "Item") return { item_code: name, has_batch_no: 1 };
      if (type === "Warehouse") return { stock_role: "Kho chính", is_group: isGroup, disabled, ...(warehouseCompany ? { company: warehouseCompany } : {}) };
      if (type === "Batch") return { item_code: "AL548", length_m: "4.6", color: "Ghi", condition: "Đã sơn" };
      return null;
    },
    async getDocument() {
      return { tenant_id: "tenant-a", doctype: "Production Order", name: "LSX-1", docstatus: 1, data: sourceCompany ? { company: sourceCompany } : {} };
    },
    async listTrackedStockPositions() {
      return [{ item_code: "AL548", warehouse: "KHO-1", batch_no: "LO-46", qty_micros: 100_000_000 }];
    },
    async listDocumentsByDoctype() { return []; },
  };
}

function context({ document = reservation(), existing, actor, action = existing ? "save" : "create", now = NOW, sourceReader = reader() } = {}) {
  return {
    command: { schema_version: 1, command_id: `reservation-${action}`, tenant_id: "tenant-a",
      actor: actor ?? { user_id: "planner@example.test", roles: ["Kế hoạch"] },
      aggregate: { doctype: "Stock Reservation", name: "GC-2026-00001" }, action,
      expected_version: existing ? 1 : null, payload_hash: "a".repeat(64), document },
    ...(existing ? { existing: { tenant_id: "tenant-a", doctype: "Stock Reservation", name: "GC-2026-00001",
      owner: "planner@example.test", docstatus: 0, status: String(existing.state ?? "Đang giữ"), version: 1,
      created_at: RESERVED_AT, modified_at: RESERVED_AT, data: existing, children: [] } } : {}),
    nextVersion: existing ? 2 : 1, now, reader: sourceReader,
  };
}

test("reservation mới không được sinh thẳng ở trạng thái terminal", async () => {
  const controller = new StockReservationIntegrityController();
  await assert.rejects(() => controller.normalize(context({ document: reservation({ state: "Đã nhả", released_reason: "Huỷ lệnh" }) })), /phải bắt đầu ở trạng thái Đang giữ/);
});

test("reservation key và source không được đổi trên cùng audit record", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation();
  await assert.rejects(() => controller.normalize(context({ existing, document: reservation({ min_length_m: "3.8" }) })), /không được đổi min_length_m/);
  await assert.rejects(() => controller.normalize(context({ existing, document: reservation({ source_name: "LSX-2" }) })), /không được đổi source_name/);
  await assert.rejects(() => controller.normalize(context({ existing, document: reservation({ item_code: "AL71" }) })), /không được đổi item_code/);
});

test("giảm một phần qty giữ nguyên Đang giữ và vẫn đi qua availability validation", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation();
  const normalized = await controller.normalize(context({ existing, document: reservation({ qty_reserved: "21" }) }));
  assert.equal(normalized.qty_reserved, "21.000000");
  assert.equal(normalized.state, "Đang giữ");
});

test("release reservation bắt buộc lý do và terminal record không được hồi sinh", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation();
  await assert.rejects(
    () => controller.normalize(context({ existing, document: reservation({ state: "Đã nhả", released_reason: "" }) })),
    /Phải nhập lý do nhả giữ chỗ/,
  );
  const released = await controller.normalize(context({ existing, document: reservation({ state: "Đã nhả", released_reason: "Huỷ kế hoạch" }) }));
  assert.equal(released.state, "Đã nhả");
  assert.equal(released.released_reason, "Huỷ kế hoạch");
  await assert.rejects(
    () => controller.normalize(context({ existing: released, document: { ...released, state: "Đang giữ", qty_reserved: "20" } })),
    /đã kết thúc và không thể sửa/,
  );
});

test("reservation đã quá hạn không được chỉnh để sống lại; system chỉ được chuyển Hết hạn", async () => {
  const controller = new StockReservationIntegrityController();
  const expired = reservation({ expires_at: "2026-08-03T09:00:00.000Z" });
  await assert.rejects(() => controller.normalize(context({ existing: expired, document: { ...expired, qty_reserved: "20" } })), /đã quá hạn.*Hết hạn/);
  const normalized = await controller.normalize(context({ existing: expired, document: { ...expired, state: "Hết hạn" }, actor: { user_id: "scheduler@example.test", roles: ["System Manager"] } }));
  assert.equal(normalized.state, "Hết hạn");
});

test("reservation warehouse phải là leaf active và cùng company với chứng từ nguồn", async () => {
  const controller = new StockReservationIntegrityController();
  await assert.rejects(() => controller.normalize(context({ sourceReader: reader({ sourceCompany: "COMP-A", warehouseCompany: "COMP-B" }) })), /belongs to COMP-B, not COMP-A/);
  await assert.rejects(() => controller.normalize(context({ sourceReader: reader({ sourceCompany: "COMP-A", warehouseCompany: "COMP-A", isGroup: 1 }) })), /disabled or is a group/);
});
