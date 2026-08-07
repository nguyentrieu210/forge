import test from "node:test";
import assert from "node:assert/strict";
import { calculateSalesProductionLine } from "../dist/apps-src/alumdoor-worker/src/sales-production.js";
import { calculateSalesWizardLineContext } from "../dist/apps-src/alumdoor-worker/src/sales-wizard-context.js";
import { handleSalesOrderOperationalSummary } from "../dist/apps-src/alumdoor-worker/src/sales-order-operational-summary.js";

const policy = {
  name: "POL-DUC-U75",
  policy_name: "Cửa Đức U75",
  door_type: "Cửa Đức",
  item_group: "Cửa CN Đức",
  ray_type: "U75",
  height_pb_offset_m: 0.5,
  dealer_width_basis: "Phủ bì nhựa",
  retail_width_basis: "Phủ bì ray",
  dealer_cut_deduction_m: 0.02,
  retail_cut_deduction_m: 0.08,
  butterfly_cut_deduction_m: 0.08,
  dealer_split_sales_basis: "Rộng cắt lá",
  dealer_full_sales_basis: "Rộng cắt lá",
  retail_sales_basis: "Phủ bì ray",
  purchase_formula: "Kg thực tế",
  priority: 10,
  disabled: 0,
  leaf_formula: "Kiểu Đức",
  leaf_height_deduction_m: 0.13,
  leaf_divisor_source: "Hằng số của chính sách",
  leaf_divisor_const: 0.055,
  leaf_rounding: "Ngưỡng trừ-một-lá",
  leaf_round_threshold: 0.6,
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function platform(overrides = {}) {
  const call = async (path) => {
    if (path === "resource/Item/CUA-DUC") return json({ data: {
      item_code: "CUA-DUC",
      item_group: "Cửa CN Đức",
      door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2",
      min_area_sqm: 0,
    } });
    if (path === "resource/Item/AL71N-RAW") return json({ data: {
      item_code: "AL71N-RAW",
      inventory_mode: "Nhôm cây/lá",
    } });
    if (path.startsWith("resource/Cutting%20Policy?")) return json({ data: overrides.policies ?? [policy] });
    if (path.startsWith("resource/Bill%20of%20Materials?")) return json({ data: overrides.boms ?? [{
      name: "BOM-DUC-1",
      item: "CUA-DUC",
      color: "TRANG",
      docstatus: 1,
      bom_status: "Active",
      revision: 2,
      effective_from: "2026-01-01",
    }] });
    if (path === "resource/Bill%20of%20Materials/BOM-DUC-1") return json({ data: overrides.bom ?? {
      name: "BOM-DUC-1",
      item: "CUA-DUC",
      items: [{ item_code: "AL71N-RAW", qty_basis: "Theo số lá" }],
    } });
    throw new Error(`unexpected platform read: ${path}`);
  };
  return call;
}

async function body(response) {
  return JSON.parse(await response.text());
}

test("public basis-only route trả đúng loại rộng/cao và CK mặc định Cửa Đức theo loại khách", async () => {
  const dealer = await body(await calculateSalesProductionLine(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Đại lý",
    sales_mode: "Trọn bộ",
    basis_only: true,
  }));
  const retail = await body(await calculateSalesProductionLine(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    basis_only: true,
  }));
  assert.equal(dealer.width_basis, "Phủ bì nhựa");
  assert.equal(retail.width_basis, "Phủ bì ray");
  assert.equal(dealer.input_height_basis, "Cao phủ bì");
  assert.equal(retail.input_height_basis, "Cao lọt lòng");
  assert.equal(dealer.default_discount_pct, 15);
  assert.equal(retail.default_discount_pct, 15);
  assert.equal(dealer.input_width_m, undefined);
  assert.equal(retail.billable_area_sqm, undefined);
});

test("khách lẻ nhập RLL/CLL được đổi server-side sang phủ bì, rộng cắt và mã nhôm BOM", async () => {
  const response = await calculateSalesWizardLineContext(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U75",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
    color: "TRANG",
    delivery_date: "2026-08-10",
  });
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.cover_width_m, 4.08);
  assert.equal(result.cut_width_m, 4);
  assert.equal(result.cover_height_m, 2.8);
  assert.equal(result.billable_area_sqm, 11.424);
  assert.equal(result.default_discount_pct, 15);
  assert.equal(result.bom_no, "BOM-DUC-1");
  assert.equal(result.stock_profile_item, "AL71N-RAW");
  assert.equal(result.stock_profile_error, null);
  assert.ok(result.leaf_count > 0);
  assert.equal(result.total_leaf_count, result.leaf_count);
});

test("ATP demand nhân đúng số bộ thay vì chỉ kiểm tồn cho một bộ", async () => {
  const one = await body(await calculateSalesWizardLineContext(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U75",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
    color: "TRANG",
  }));
  const three = await body(await calculateSalesWizardLineContext(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U75",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 3,
    color: "TRANG",
  }));
  assert.equal(three.leaf_count, one.leaf_count);
  assert.equal(three.total_leaf_count, one.leaf_count * 3);
  assert.equal(three.billable_area_sqm, one.billable_area_sqm * 3);
});

test("ray được chọn fail-closed nếu tenant chưa có Cutting Policy tương ứng", async () => {
  const response = await calculateSalesWizardLineContext(platform(), {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U100",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
  });
  assert.equal(response.status, 422);
  assert.match((await body(response)).message, /ray U100/);
});

test("BOM nhiều nhôm cây/lá mà không khai dòng Theo số lá không được đoán ATP", async () => {
  const call = platform({ bom: {
    name: "BOM-DUC-1",
    item: "CUA-DUC",
    items: [
      { item_code: "AL71N-RAW" },
      { item_code: "AL72-RAW" },
    ],
  } });
  const wrapped = async (path) => {
    if (path === "resource/Item/AL72-RAW") return json({ data: { item_code: "AL72-RAW", inventory_mode: "Nhôm cây/lá" } });
    return call(path);
  };
  const response = await calculateSalesWizardLineContext(wrapped, {
    item_code: "CUA-DUC",
    customer_group: "Lẻ",
    sales_mode: "Trọn bộ",
    ray_type: "U75",
    width_input_basis: "Rộng lọt lòng",
    height_input_basis: "Cao lọt lòng",
    width_m: 4,
    height_m: 2.3,
    set_count: 1,
    color: "TRANG",
  });
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.stock_profile_item, null);
  assert.match(result.stock_profile_error, /nhiều vật tư Nhôm cây\/lá/);
});

function summaryRequest(args) {
  return new Request("https://app.local/api/method/alumdoor.sales.order_operational_summary", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-callback": "https://gateway.local/api",
      "x-cloudforge-tenant": "alu",
    },
    body: JSON.stringify({ args }),
  });
}

function hasFilter(url, field, operator, value) {
  const filters = JSON.parse(url.searchParams.get("filters") ?? "[]");
  return filters.some((entry) => Array.isArray(entry) && entry[0] === field && entry[1] === operator && entry[2] === value);
}

test("work queue summary ghép giữ hàng, sản xuất và cắt chỉ cho Sales Order đúng Company", async () => {
  const env = {
    PLATFORM: {
      async fetch(outbound) {
        const url = new URL(outbound.url);
        const resource = decodeURIComponent(url.pathname).replace(/^\/api\/resource\//, "");
        if (resource === "Sales Order") {
          assert.ok(hasFilter(url, "docstatus", "=", 1));
          assert.ok(hasFilter(url, "company", "=", "ALUMDOOR"));
          return json({ data: [
            { name: "SO-A", company: "ALUMDOOR", docstatus: 1, status: "To Deliver", modified: "2026-08-06T10:00:00Z" },
            { name: "SO-B", company: "ALUMDOOR", docstatus: 1, status: "To Deliver", modified: "2026-08-06T09:00:00Z" },
          ] });
        }
        if (resource === "Stock Reservation") {
          assert.ok(hasFilter(url, "source_doctype", "=", "Sales Order"));
          return json({ data: [
            { name: "RES-A1", source_name: "SO-A", state: "Đang giữ", modified: "2026-08-06T10:02:00Z" },
            { name: "RES-OTHER", source_name: "SO-OTHER-COMPANY", state: "Đang giữ", modified: "2026-08-06T10:03:00Z" },
          ] });
        }
        if (resource === "Production Request") {
          return json({ data: [
            { name: "PR-A", sales_order: "SO-A", request_state: "Đã phát hành", modified: "2026-08-06T11:00:00Z" },
            { name: "PR-OTHER", sales_order: "SO-OTHER-COMPANY", request_state: "Đã phát hành", modified: "2026-08-06T11:01:00Z" },
          ] });
        }
        if (resource === "Cut Order") {
          assert.ok(hasFilter(url, "company", "=", "ALUMDOOR"));
          return json({ data: [{ name: "CUT-A", so_reference: "SO-A", cut_state: "Nháp", company: "ALUMDOOR", modified: "2026-08-06T12:00:00Z" }] });
        }
        throw new Error(`unexpected callback ${url.pathname}`);
      },
    },
  };

  const response = await handleSalesOrderOperationalSummary(summaryRequest({ company: "ALUMDOOR" }), env);
  const result = await body(response);
  assert.equal(response.status, 200, result.message);
  assert.equal(result.rows.length, 2);
  const a = result.rows.find((row) => row.sales_order === "SO-A");
  const b = result.rows.find((row) => row.sales_order === "SO-B");
  assert.equal(a.reservation_state, "Đang giữ");
  assert.equal(a.production_request, "PR-A");
  assert.equal(a.production_state, "Đã phát hành");
  assert.equal(a.cut_order, "CUT-A");
  assert.equal(a.cut_state, "Nháp");
  assert.equal(b.reservation_state, "Chưa giữ");
  assert.equal(result.rows.some((row) => row.sales_order === "SO-OTHER-COMPANY"), false);
});

test("work queue summary fail-closed trước callback nếu thiếu Company", async () => {
  let calls = 0;
  const response = await handleSalesOrderOperationalSummary(summaryRequest({}), {
    PLATFORM: { async fetch() { calls += 1; return json({ data: [] }); } },
  });
  assert.equal(response.status, 422);
  assert.match((await body(response)).message, /Công ty/);
  assert.equal(calls, 0);
});
