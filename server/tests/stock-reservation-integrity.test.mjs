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

function reservationDocument(name, data) {
  return {
    tenant_id: "tenant-a", doctype: "Stock Reservation", name,
    owner: "planner@example.test", docstatus: 0, status: String(data.state ?? "Đang giữ"), version: 1,
    created_at: RESERVED_AT, modified_at: RESERVED_AT, data, children: [],
  };
}

function reader({
  warehouseCompany,
  sourceCompany,
  disabled = 0,
  isGroup = 0,
  positions = [{ item_code: "AL548", warehouse: "KHO-1", batch_no: "LO-46", qty_micros: 100_000_000 }],
  reservations = [],
  batches = {},
} = {}) {
  return {
    async getMasterRecordData(_tenantId, type, name) {
      if (type === "Item") return { item_code: name, has_batch_no: 1 };
      if (type === "Warehouse") return { stock_role: "Kho chính", is_group: isGroup, disabled, ...(warehouseCompany ? { company: warehouseCompany } : {}) };
      if (type === "Batch") return batches[name] ?? { item_code: "AL548", length_m: "4.6", color: "Ghi", condition: "Đã sơn" };
      if (type === "Lý do huỷ") {
        if (name === "THAY_DOI_KE_HOACH") return { reason_code: name, reason_name: "Thay đổi kế hoạch", applies_to_doctype: "Phiếu kho" };
        if (name === "CAT_NHAM") return { reason_code: name, reason_name: "Cắt nhầm", applies_to_doctype: "Phiếu cắt" };
      }
      return null;
    },
    async getDocument() {
      return { tenant_id: "tenant-a", doctype: "Production Order", name: "LSX-1", docstatus: 1, data: sourceCompany ? { company: sourceCompany } : {} };
    },
    async listTrackedStockPositions() { return positions; },
    async listDocumentsByDoctype() { return reservations; },
  };
}

function context({ document = reservation(), existing, actor, action = existing ? "save" : "create", now = NOW, sourceReader = reader() } = {}) {
  return {
    command: { schema_version: 1, command_id: `reservation-${action}`, tenant_id: "tenant-a",
      actor: actor ?? { user_id: "planner@example.test", roles: ["Kế hoạch"] },
      aggregate: { doctype: "Stock Reservation", name: "GC-2026-00001" }, action,
      expected_version: existing ? 1 : null, payload_hash: "a".repeat(64), document },
    ...(existing ? { existing: reservationDocument("GC-2026-00001", existing) } : {}),
    nextVersion: existing ? 2 : 1, now, reader: sourceReader,
  };
}

test("reservation mới không được sinh thẳng ở trạng thái terminal", async () => {
  const controller = new StockReservationIntegrityController();
  await assert.rejects(() => controller.normalize(context({ document: reservation({ state: "Đã nhả", released_reason: "THAY_DOI_KE_HOACH" }) })), /phải bắt đầu ở trạng thái Đang giữ/);
});

test("reservation mới chụp số lượng ban đầu do server sở hữu", async () => {
  const controller = new StockReservationIntegrityController();
  const normalized = await controller.normalize(context({ document: reservation({ initial_qty_reserved: "1", initial_qty_reserved_micros: 1 }) }));
  assert.equal(normalized.qty_reserved, "51.000000");
  assert.equal(normalized.initial_qty_reserved, "51.000000");
  assert.equal(normalized.initial_qty_reserved_micros, 51_000_000);
  assert.equal(normalized.cumulative_released_qty_micros, 0);
});

test("reservation key và source không được đổi trên cùng audit record", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation();
  await assert.rejects(() => controller.normalize(context({ existing, document: reservation({ min_length_m: "3.8" }) })), /không được đổi min_length_m/);
  await assert.rejects(() => controller.normalize(context({ existing, document: reservation({ source_name: "LSX-2" }) })), /không được đổi source_name/);
  await assert.rejects(() => controller.normalize(context({ existing, document: reservation({ item_code: "AL71" }) })), /không được đổi item_code/);
});

test("nhả một phần giữ active và luôn có audit actor/time/delta/reason", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation({
    initial_qty_reserved: "51.000000",
    initial_qty_reserved_micros: 51_000_000,
    cumulative_released_qty: "0.000000",
    cumulative_released_qty_micros: 0,
  });
  const defaultReason = await controller.normalize(context({
    existing,
    document: reservation({ qty_reserved: "21" }),
  }));
  assert.equal(defaultReason.qty_reserved, "21.000000");
  assert.equal(defaultReason.state, "Đang giữ");
  assert.equal(defaultReason.last_partial_release_qty_micros, 30_000_000);
  assert.equal(defaultReason.cumulative_released_qty_micros, 30_000_000);
  assert.equal(defaultReason.partial_release_reason, "Điều chỉnh giảm giữ chỗ");
  assert.equal(defaultReason.last_partial_released_by, "planner@example.test");
  assert.equal(defaultReason.last_partial_released_at, NOW);

  const explicitReason = await controller.normalize(context({
    existing,
    document: reservation({ qty_reserved: "21", partial_release_reason: "Khách giảm số lượng" }),
  }));
  assert.equal(explicitReason.partial_release_reason, "Khách giảm số lượng");
});

test("client không được tự chuyển Đã dùng", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation({ initial_qty_reserved: "51.000000", initial_qty_reserved_micros: 51_000_000 });
  await assert.rejects(
    () => controller.normalize(context({ existing, document: reservation({ state: "Đã dùng" }) })),
    /Đã dùng do chứng từ tiêu thụ\/cắt xác nhận/,
  );
});

test("tăng qty vẫn phải qua availability và giữ snapshot ban đầu bất biến", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation({ qty_reserved: "20", initial_qty_reserved: "20.000000", initial_qty_reserved_micros: 20_000_000 });
  const normalized = await controller.normalize(context({ existing, document: reservation({ qty_reserved: "25" }) }));
  assert.equal(normalized.qty_reserved, "25.000000");
  assert.equal(normalized.initial_qty_reserved, "20.000000");
  assert.equal(normalized.initial_qty_reserved_micros, 20_000_000);
});

test("release reservation bắt buộc reason master active, đúng scope và terminal record không được hồi sinh", async () => {
  const controller = new StockReservationIntegrityController();
  const existing = reservation();
  await assert.rejects(
    () => controller.normalize(context({ existing, document: reservation({ state: "Đã nhả", released_reason: "" }) })),
    /Phải nhập lý do nhả giữ chỗ/,
  );
  await assert.rejects(
    () => controller.normalize(context({ existing, document: reservation({ state: "Đã nhả", released_reason: "KHONG_TON_TAI" }) })),
    /không tồn tại hoặc đã ngừng dùng/,
  );
  await assert.rejects(
    () => controller.normalize(context({ existing, document: reservation({ state: "Đã nhả", released_reason: "CAT_NHAM" }) })),
    /chỉ áp cho Phiếu cắt, không áp cho Phiếu kho/,
  );
  const released = await controller.normalize(context({ existing, document: reservation({ state: "Đã nhả", released_reason: "THAY_DOI_KE_HOACH" }) }));
  assert.equal(released.state, "Đã nhả");
  assert.equal(released.released_reason, "THAY_DOI_KE_HOACH");
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

test("reservation kiểm mọi breakpoint chiều dài để không hứa cùng một cây cho hai ngưỡng", async () => {
  const controller = new StockReservationIntegrityController();
  const existingShorterPromise = reservationDocument("GC-OLD", reservation({
    min_length_m: "3",
    qty_reserved: "1",
    source_name: "LSX-OLD",
  }));
  const sourceReader = reader({
    positions: [{ item_code: "AL548", warehouse: "KHO-1", batch_no: "LO-50", qty_micros: 1_000_000 }],
    batches: { "LO-50": { item_code: "AL548", length_m: "5", color: "Ghi", condition: "Đã sơn" } },
    reservations: [existingShorterPromise],
  });

  await assert.rejects(
    () => controller.normalize(context({
      document: reservation({ min_length_m: "5", qty_reserved: "1", source_name: "LSX-NEW" }),
      sourceReader,
    })),
    /Không đủ tồn khả dụng theo cơ cấu khổ.*ngưỡng ≥ 3\.000000 m/,
  );
});
