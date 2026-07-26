import type { FormProfileMap } from "@metaforge/core";

/**
 * Form Profile — chọn field nào hiện trên form của từng chứng từ kho.
 *
 * DocType chuẩn ERPNext phải phục vụ mọi ngành, mọi quốc gia nên rất rộng: Purchase Receipt có
 * ~150 field (ngoại tệ, thuế nhiều bậc, subcontracting, chi phí nhập khẩu, điều khoản thanh toán,
 * địa chỉ giao/xuất hoá đơn…). Thủ kho chỉ cần: nhà cung cấp, ngày, kho nhận, danh sách hàng.
 *
 * KHÔNG sửa DocType phía server (BRD §6 nguyên tắc #2). Đây chỉ là lọc hiển thị phía client;
 * field ẩn vẫn giữ nguyên giá trị mặc định/tính toán từ server.
 *
 * Quy tắc an toàn do `applyFormProfile` tự đảm bảo, KHÔNG cần liệt kê ở đây:
 *  - Field `reqd: 1` luôn hiện dù có trong `keep` hay không (ẩn field bắt buộc = form không lưu được).
 *  - Field bị `depends_on` của field đang hiện tham chiếu sẽ tự được kéo vào.
 *  - Section/Column/Tab rỗng sau khi lọc sẽ tự bị dọn.
 *
 * Vì vậy `keep` bên dưới là "những field NGHIỆP VỤ tôi muốn thấy", không phải danh sách đầy đủ
 * field sẽ render. Nếu site có custom field bắt buộc riêng, nó vẫn tự xuất hiện.
 */
export const FORM_PROFILES: FormProfileMap = {
  // ── Nhập hàng (WMS-004) ────────────────────────────────────────────────────
  "Purchase Receipt": {
    keep: [
      "naming_series", "supplier", "posting_date", "posting_time",
      "company", "set_warehouse", "is_return", "return_against",
      "items",
      "total_qty", "grand_total",
      "status", "remarks",
    ],
  },

  // ── Chuyển kho / xuất nhập nội bộ (WMS-007) ────────────────────────────────
  "Stock Entry": {
    keep: [
      "naming_series", "stock_entry_type", "purpose", "posting_date", "posting_time",
      "company", "from_warehouse", "to_warehouse",
      "items",
      "total_outgoing_value", "total_incoming_value",
      "remarks",
    ],
  },

  // ── Xuất hàng (WMS-010) ────────────────────────────────────────────────────
  "Delivery Note": {
    keep: [
      "naming_series", "customer", "posting_date", "posting_time",
      "company", "set_warehouse", "is_return", "return_against",
      "items",
      "total_qty", "grand_total",
      // Delivery Note KHÔNG có `remarks` như Purchase Receipt/Stock Entry — trường ghi chú của nó
      // tên là `instructions` (đã đối chiếu meta thật trên site, ERPNext v16).
      "status", "instructions",
    ],
  },

  // ── Yêu cầu vật tư ─────────────────────────────────────────────────────────
  "Material Request": {
    keep: [
      "naming_series", "material_request_type", "transaction_date", "schedule_date",
      "company", "set_warehouse",
      "items",
      "status",
    ],
  },

  // ── Kiểm kê (WMS-013) ──────────────────────────────────────────────────────
  "Stock Reconciliation": {
    keep: [
      "naming_series", "purpose", "posting_date", "posting_time",
      "company", "set_warehouse",
      "items",
      "difference_amount",
      "expense_account", "cost_center",
    ],
  },

  // ── Lô hàng (WMS-016, WMS-018) ─────────────────────────────────────────────
  "Batch": {
    keep: [
      "batch_id", "item", "item_name",
      "manufacturing_date", "expiry_date",
      "supplier", "reference_doctype", "reference_name",
      "batch_qty", "stock_uom",
      // WMS-018: đây là cần gạt Hold/Release của lô — phải luôn thấy.
      "disabled",
      "description",
    ],
  },

  // ── Vật tư — danh mục nặng nhất của ERPNext (~200 field) ───────────────────
  Item: {
    keep: [
      "naming_series", "item_code", "item_name", "item_group", "stock_uom",
      "disabled", "description", "image", "brand",
      // WMS-016/017: bật lô/serial và cấm tồn âm là quyết định của thủ kho.
      "has_batch_no", "create_new_batch", "has_expiry_date", "shelf_life_in_days",
      "has_serial_no", "serial_no_series",
      "is_stock_item", "include_item_in_manufacturing",
      // WMS-014: mã vạch nhận diện vật tư khi quét.
      "barcodes",
      "item_defaults",
      "min_order_qty", "safety_stock", "lead_time_days",
    ],
  },

  // ── Kho hàng (WMS-002, WMS-003, ORG-003) ───────────────────────────────────
  Warehouse: {
    keep: [
      "warehouse_name", "company", "is_group", "parent_warehouse", "disabled",
      "warehouse_type", "account",
      "address_line_1", "city", "phone_no",
    ],
  },

  // ── Danh mục phụ ───────────────────────────────────────────────────────────
  "Item Group": { keep: ["item_group_name", "parent_item_group", "is_group", "image"] },
  Supplier: {
    keep: [
      "naming_series", "supplier_name", "supplier_group", "supplier_type",
      "country", "tax_id", "disabled",
      "default_currency", "payment_terms",
    ],
  },
  Customer: {
    keep: [
      "naming_series", "customer_name", "customer_group", "customer_type", "territory",
      "tax_id", "disabled",
      "default_currency", "payment_terms",
    ],
  },
  UOM: { keep: ["uom_name", "must_be_whole_number", "enabled"] },
  Brand: { keep: ["brand", "description", "image"] },

  // ── Chất lượng (WMS-005) ───────────────────────────────────────────────────
  "Quality Inspection": {
    keep: [
      "naming_series", "inspection_type", "reference_type", "reference_name",
      "item_code", "item_name", "batch_no", "sample_size", "inspected_by", "report_date",
      "readings", "status", "remarks",
    ],
  },
};
