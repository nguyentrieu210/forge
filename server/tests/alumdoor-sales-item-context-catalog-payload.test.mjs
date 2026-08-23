import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";

/**
 * Ngữ cảnh danh mục mà màn bán hàng nhận được — hợp đồng ở
 * `docs/audits/ALUMDOOR-BAN-HANG-PAYLOAD-CONTRACT-20260821.md`.
 *
 * Bài kiểm chính của cả file: **`null` không được biến thành `1`**. 33 mã ray/trục `RT_` đang CỐ Ý
 * chưa có hệ số quy đổi Mét→Cây; bất kỳ tầng nào lấp chỗ trống đó bằng một con số đều ghi sai tồn
 * của cả nhóm, và ghi sai trong im lặng.
 */
function platform(records, reports = {}) {
  const calls = [];
  const call = async (path, init = {}) => {
    calls.push({ path, init });
    if (path === "method/frappe.desk.query_report.run") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const rows = reports[body.report_name];
      if (rows === undefined) return new Response(JSON.stringify({ message: "no report" }), { status: 404 });
      if (rows instanceof Error) return new Response(JSON.stringify({ message: rows.message }), { status: 403 });
      return new Response(JSON.stringify({ message: { result: rows } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const listMatch = /^resource\/([^/?]+)\?(.*)$/.exec(path);
    if (listMatch) {
      const doctype = decodeURIComponent(listMatch[1]);
      const query = new URLSearchParams(listMatch[2]);
      const filters = JSON.parse(query.get("filters") ?? "[]");
      const prefix = `${doctype}:`;
      const data = [...records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ name: key.slice(prefix.length), ...value }))
        .filter((row) => filters.every((filter) => row[filter[1]] === filter[3]));
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const match = /^resource\/([^/]+)\/(.+)$/.exec(path);
    if (!match) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    const doctype = decodeURIComponent(match[1]);
    const name = decodeURIComponent(match[2]);
    const record = records.get(`${doctype}:${name}`);
    if (!record) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    return new Response(JSON.stringify({ data: record }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  call.calls = calls;
  return call;
}

/** Đúng hình dạng nhóm `RT_` chốt 20/08/2026: mua Kg · tồn CÂY · bán Mét, cân thực tế, theo lô. */
function rayItem(overrides = {}) {
  return {
    item_name: "Trục 114 dày 1.8",
    item_group: "Ray và trục",
    is_sales_item: 1,
    disabled: 0,
    is_stock_item: 1,
    stock_uom: "Cây",
    default_purchase_uom: "Kg",
    default_sales_uom: "Mét",
    has_catch_weight: 1,
    weight_uom: "Kg",
    has_batch_no: 1,
    measurement_profile: "Ống/trục",
    material_specification: "QC-TRUC114-18",
    // Hệ số Mét→Cây CỐ Ý để trống — chờ chủ xưởng chốt.
    uom_conversions: [],
    ...overrides,
  };
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

const NO_COLORS = { include_color_scope: false };

test("bán theo Mét mà thiếu hệ số quy đổi thì vẫn TỪ CHỐI, nhưng nói rõ vì sao và sửa ở đâu", async () => {
  const call = platform(new Map([["Item:RT_TRUC114_18", rayItem()]]));
  const { status, body } = await read(await salesItemContext(call, {
    item_code: "RT_TRUC114_18", uom: "Mét", price_list: "BẢNG GIÁ", currency: "VND",
  }));

  assert.equal(status, 422);
  // Hợp đồng cũ không đổi.
  assert.match(body.message, /ĐVT "Mét" chưa được khai/);
  assert.deepEqual(body.allowed_uoms, ["Cây"]);
  // Và vẫn từ chối TRƯỚC khi chạm tới bảng giá hay báo cáo kho.
  assert.equal(call.calls.some(({ path }) => path.includes("Item Price")), false);
  assert.equal(call.calls.some(({ path }) => path.includes("query_report")), false);

  // Cái thêm vào: lý do, chỗ sửa, và "đây là ô chờ chủ xưởng, không phải lỗi cấu hình".
  assert.equal(body.uom_gap.kind, "MISSING_CONVERSION");
  assert.equal(body.uom_gap.intentional, true);
  assert.match(body.uom_gap.fix_where, /Đơn vị quy đổi khác/);
  assert.equal(body.readiness.ready, false);
  assert.deepEqual(body.readiness.blocking.map((entry) => entry.code), ["UOM_FACTOR_MISSING"]);
  assert.equal(body.uom_ladder.purchase_uom, "Kg");
  assert.equal(body.uom_ladder.stock_uom, "Cây");
  assert.equal(body.uom_ladder.sales_uom, "Mét");
});

test("thang ĐVT phân biệt 'chưa khai' với 'cố ý không có hệ số' của hàng cân thực tế", async () => {
  const call = platform(new Map([["Item:RT_TRUC114_18", rayItem()]]));
  const { status, body } = await read(await salesItemContext(call, {
    item_code: "RT_TRUC114_18", uom: "Cây", currency: "VND", ...NO_COLORS,
  }));
  assert.equal(status, 200);

  const byUom = Object.fromEntries(body.uom_ladder.entries.map((entry) => [entry.uom, entry]));

  // Cây là ĐVT tồn ⇒ hệ số 1 thật.
  assert.equal(byUom["Cây"].conversion_factor, 1);
  assert.equal(byUom["Cây"].declared, true);

  // Mét chưa khai ⇒ `null`, KHÔNG phải 1.
  assert.equal(byUom["Mét"].conversion_factor, null);
  assert.equal(byUom["Mét"].declared, false);

  // Kg vắng mặt là ĐÚNG LUẬT: `validateCanonicalAluminumItem` từ chối mọi hệ số Kg↔Cây tĩnh vì
  // số cây và kg thực là hai quan sát độc lập. Nó không được đếm vào "thiếu dữ liệu".
  assert.equal(byUom["Kg"].conversion_factor, null);
  assert.equal(byUom["Kg"].factor_source, "catch_weight");
  assert.deepEqual(body.uom_ladder.missing_factors.map((entry) => entry.uom), ["Mét"]);
  assert.equal(body.uom_ladder.catch_weight, true);
});

test("tồn trả về HAI trục song song: số cây theo sổ kho và kg theo lô", async () => {
  const records = new Map([
    ["Item:RT_TRUC114_18", rayItem()],
    ["Batch:LO-1", { color: null, condition: "Thô", length_m: 5.85, is_offcut: 0 }],
    ["Batch:LO-2", { color: null, condition: "Thô", length_m: 6.2, is_offcut: 0 }],
  ]);
  const call = platform(records, {
    "Stock Balance": [{ item_code: "RT_TRUC114_18", warehouse: "K36", actual_qty: 9 }],
    "Batch Stock Balance": [
      { item_code: "RT_TRUC114_18", warehouse: "K36", batch_no: "LO-1", actual_qty: 4, actual_weight: 131.6 },
      { item_code: "RT_TRUC114_18", warehouse: "K36", batch_no: "LO-2", actual_qty: 5, actual_weight: 174.2 },
    ],
  });
  const { body } = await read(await salesItemContext(call, {
    item_code: "RT_TRUC114_18", uom: "Cây", warehouse: "K36", currency: "VND", ...NO_COLORS,
  }));

  assert.equal(body.stock_snapshot.stock_uom, "Cây");
  assert.equal(body.stock_snapshot.stock_qty, 9);
  // Trục tiền đi riêng — không cộng, không quy đổi lẫn nhau.
  assert.equal(body.stock_snapshot.weight_uom, "Kg");
  assert.equal(Math.round(body.stock_snapshot.weight_qty * 10) / 10, 305.8);
  assert.equal(body.stock_snapshot.batch_count, 2);
  assert.equal(body.stock_snapshot.batches.length, 2);
  // Lô dài nhất lên trước: người bán chọn cây theo khổ.
  assert.equal(body.stock_snapshot.batches[0].batch_no, "LO-2");
  assert.equal(body.stock_snapshot.batches[0].length_m, 6.2);
  assert.equal(body.stock_snapshot.read_error, null);
});

test("không đọc được báo cáo lô thì mất đúng khoá đó, không mất cả ngữ cảnh dòng hàng", async () => {
  const call = platform(new Map([["Item:RT_TRUC114_18", rayItem()]]), {
    "Stock Balance": [{ item_code: "RT_TRUC114_18", warehouse: "K36", actual_qty: 9 }],
    "Batch Stock Balance": new Error("Bạn không có quyền đọc báo cáo này."),
  });
  const { status, body } = await read(await salesItemContext(call, {
    item_code: "RT_TRUC114_18", uom: "Cây", warehouse: "K36", currency: "VND", ...NO_COLORS,
  }));

  assert.equal(status, 200);
  assert.equal(body.stock_snapshot.stock_qty, 9);
  assert.equal(body.stock_snapshot.weight_qty, null);
  assert.match(String(body.stock_snapshot.read_error), /Batch Stock Balance/);
  assert.ok(body.readiness.warnings.some((entry) => entry.code === "STOCK_UNREADABLE"));
});

test("bán vượt tồn thì CHẶN; không so được thì nói 'không so được', không nói 'đủ hàng'", async () => {
  const stocked = platform(new Map([["Item:RT_TRUC114_18", rayItem()]]), {
    "Stock Balance": [{ item_code: "RT_TRUC114_18", warehouse: "K36", actual_qty: 3 }],
    "Batch Stock Balance": [],
  });
  const over = await read(await salesItemContext(stocked, {
    item_code: "RT_TRUC114_18", uom: "Cây", warehouse: "K36", qty: 8, currency: "VND", ...NO_COLORS,
  }));
  assert.equal(over.body.shortage.severity, "over");
  assert.equal(over.body.shortage.short_by, 5);
  assert.equal(over.body.readiness.ready, false);
  assert.ok(over.body.readiness.blocking.some((entry) => entry.code === "STOCK_SHORT"));

  const enough = await read(await salesItemContext(platform(new Map([["Item:RT_TRUC114_18", rayItem()]]), {
    "Stock Balance": [{ item_code: "RT_TRUC114_18", warehouse: "K36", actual_qty: 20 }],
    "Batch Stock Balance": [],
  }), {
    item_code: "RT_TRUC114_18", uom: "Cây", warehouse: "K36", qty: 8, currency: "VND", ...NO_COLORS,
  }));
  assert.equal(enough.body.shortage.severity, "ok");
  assert.equal(enough.body.shortage.short_by, 0);

  // Không chọn kho ⇒ chưa có số tồn nào. Trạng thái phải là "unknown", không được là "ok".
  const unknown = await read(await salesItemContext(platform(new Map([["Item:RT_TRUC114_18", rayItem()]])), {
    item_code: "RT_TRUC114_18", uom: "Cây", qty: 8, currency: "VND", ...NO_COLORS,
  }));
  assert.equal(unknown.body.shortage.severity, "unknown");
  assert.notEqual(unknown.body.shortage.severity, "ok");
});

/**
 * 23/08/2026 — thu hẹp lại còn ĐÚNG cảnh báo sửa được:
 *
 *  · Bỏ `SPEC_MISSING_STANDARD_LENGTH`: 78/78 quy cách trong danh mục đều trống ô này, và
 *    `standard_length_m` không được PHÉP TÍNH nào đọc (chỉ chính cảnh báo cũ và một phép chiếu
 *    xuống UI). Nhôm cũng không có "chiều dài chuẩn" — mỗi đợt giao một chiều dài khác.
 *  · Bỏ `GEOMETRY_PROFILE_MISSING` cho hàng KHÔNG PHẢI CỬA: mọi nơi tiêu thụ đọc
 *    `Cutting Policy.geometry_profile` (khoá theo `door_type`), không nơi nào đọc
 *    `Item.geometry_profile`. Ray/trục không có loại cửa nên không bao giờ tắt được cảnh báo.
 *
 *  · GIỮ `SPEC_MISSING_KG_PER_M`: số này quy đổi Mét↔Kg, được đọc ở 39 chỗ, 36/78 còn thiếu.
 */
test("quy cách kỹ thuật chưa khai Kg/m thì báo đúng chỗ sửa", async () => {
  const records = new Map([
    ["Item:RT_TRUC114_18", rayItem()],
    ["Measurement Profile:Ống/trục", {
      profile_name: "Ống/trục", inventory_mode: "Nhôm cây/lá", stock_uom: "Cây",
      track_dimension_lot: 1, require_color: 0, require_length: 1, require_piece_qty: 1,
      weight_tolerance_pct: 13,
    }],
    ["Material Specification:QC-TRUC114-18", {
      spec_code: "QC-TRUC114-18", spec_type: "Ống/trục", thickness_mm: 1.8, section_code: "114",
      // Hai ô CỐ Ý trống của 23 quy cách `QC-*`.
      standard_length_m: 0, theoretical_kg_per_m: 0,
    }],
  ]);
  const { body } = await read(await salesItemContext(platform(records), {
    item_code: "RT_TRUC114_18", uom: "Cây", currency: "VND", ...NO_COLORS,
  }));

  assert.equal(body.spec_context.material_specification.standard_length_m, null);
  assert.equal(body.spec_context.material_specification.theoretical_kg_per_m, null);
  assert.equal(body.spec_context.measurement_profile.require_color, false);
  assert.equal(body.spec_context.measurement_profile.track_dimension_lot, true);

  const codes = body.spec_context.coverage_gaps.map((gap) => gap.code);
  assert.ok(codes.includes("SPEC_MISSING_KG_PER_M"));
  // Hai cảnh báo KHÔNG được xuất hiện nữa — xem lý do ở chú thích đầu test.
  assert.equal(codes.includes("SPEC_MISSING_STANDARD_LENGTH"), false);
  assert.equal(codes.includes("GEOMETRY_PROFILE_MISSING"), false, "ray/trục không có loại cửa nên không đòi bộ hình học của cửa");
  for (const gap of body.spec_context.coverage_gaps) assert.ok(gap.where.length > 0, `${gap.code} thiếu chỗ sửa`);
  // Không cái nào trong số này được chặn bán — chúng là cảnh báo.
  assert.ok(body.readiness.warnings.some((entry) => entry.code === "SPEC_MISSING_KG_PER_M"));
});

test("giải trình đơn giá nói rõ khi con số là GIÁ QUY ĐỔI chứ không phải giá ai đó khai", async () => {
  const item = {
    item_name: "Cửa", item_group: "Cửa CN Đức", is_sales_item: 1, disabled: 0, is_stock_item: 0,
    stock_uom: "Cái", default_sales_uom: "Thùng",
    uom_conversions: [{ uom: "Thùng", conversion_factor: 10 }],
  };
  const exact = await read(await salesItemContext(platform(new Map([
    ["Item:ITEM-1", item],
    ["Item Price:BẢNG GIÁ:ITEM-1:Thùng", {
      price_list: "BẢNG GIÁ", item_code: "ITEM-1", uom: "Thùng", currency: "VND",
      rate: "500000", area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD",
    }],
  ])), { item_code: "ITEM-1", uom: "Thùng", price_list: "BẢNG GIÁ", currency: "VND", ...NO_COLORS }));

  assert.equal(exact.body.price_explain.resolution, "exact_uom");
  assert.equal(exact.body.price_explain.price_uom, "Thùng");
  assert.equal(exact.body.price_explain.converted_from_uom, null);
  assert.equal(exact.body.price_explain.area_tier, "MOI-DIEN-TICH");
  assert.equal(exact.body.price_explain.rate, 500000);
  assert.equal(exact.body.readiness.ready, true);

  // Chỉ có giá cho ĐVT gốc ⇒ engine lùi về đó rồi nhân chéo. Đây đúng là lúc con số trên màn
  // khác con số người khai giá gõ vào, nên nó phải hiện ra chứ không được nuốt.
  const baseUomItem = { ...item, default_sales_uom: "Cái" };
  const converted = await read(await salesItemContext(platform(new Map([
    ["Item:ITEM-1", baseUomItem],
    ["Item Price:BẢNG GIÁ:ITEM-1:Cái", {
      price_list: "BẢNG GIÁ", item_code: "ITEM-1", uom: "Cái", currency: "VND", rate: "50000",
    }],
  ])), { item_code: "ITEM-1", uom: "Thùng", price_list: "BẢNG GIÁ", currency: "VND", ...NO_COLORS }));

  assert.equal(converted.body.price_explain.resolution, "base_uom_fallback");
  assert.equal(converted.body.price_explain.converted_from_uom, "Cái");
  assert.equal(converted.body.price_explain.rate, 500000);
  assert.match(converted.body.price_explain.note, /quy đổi/);
  assert.ok(converted.body.readiness.warnings.some((entry) => entry.code === "PRICE_CONVERTED_FROM_BASE_UOM"));
});

test("chưa khai giá thì CHẶN, và chỉ thẳng bản ghi giá phải tạo", async () => {
  const { body } = await read(await salesItemContext(platform(new Map([
    ["Item:ITEM-1", {
      item_name: "Cửa", item_group: "Cửa CN Đức", is_sales_item: 1, disabled: 0, is_stock_item: 0,
      stock_uom: "Cái",
    }],
  ])), { item_code: "ITEM-1", uom: "Cái", price_list: "BẢNG GIÁ", currency: "VND", ...NO_COLORS }));

  assert.equal(body.price_missing, true);
  assert.equal(body.price_explain.resolution, "not_found");
  assert.equal(body.readiness.ready, false);
  const blocked = body.readiness.blocking.find((entry) => entry.code === "PRICE_MISSING");
  assert.ok(blocked);
  assert.match(blocked.where, /BẢNG GIÁ:ITEM-1:Cái/);
});

test("màu về theo PHẠM VI (Bề mặt → màu), và tắt được để tiết kiệm lượt đọc", async () => {
  const records = new Map([
    ["Item:ITEM-1", {
      item_name: "Cửa", item_group: "Cửa CN Đức", is_sales_item: 1, disabled: 0, is_stock_item: 0,
      stock_uom: "Cái",
    }],
    ["Item Group:Cửa CN Đức", { item_group_name: "Cửa CN Đức", parent_item_group: "" }],
    ["Surface Finish:STD", {
      finish_code: "STD", finish_name: "Sơn tĩnh điện", requires_color: 1,
      applies_to_groups: [{ item_group: "Cửa CN Đức" }], usage_scope: "Mua & bán",
    }],
    ["Item Color:KEM", { color_code: "KEM", color_name: "Kem", surface_finish: "STD", usage_scope: "Mua & bán" }],
    ["Item Color:VAN_GO", { color_code: "VAN_GO", color_name: "Vân gỗ", surface_finish: "STD", usage_scope: "Mua & bán" }],
  ]);

  const withColors = await read(await salesItemContext(platform(records), {
    item_code: "ITEM-1", uom: "Cái", currency: "VND",
  }));
  assert.equal(withColors.body.color_scope.item_group, "Cửa CN Đức");
  assert.deepEqual(withColors.body.color_scope.allowed_finishes.map((entry) => entry.code), ["STD"]);
  assert.deepEqual(withColors.body.color_scope.colors_by_finish.STD, ["KEM", "VAN_GO"]);
  assert.equal(withColors.body.color_scope.requires_color, true);
  assert.equal(withColors.body.color_scope_error, null);

  const withoutColors = await read(await salesItemContext(platform(records), {
    item_code: "ITEM-1", uom: "Cái", currency: "VND", include_color_scope: false,
  }));
  // Tắt ⇒ khoá VẮNG MẶT (chưa đo), không phải `null` (đã đo, không có gì).
  assert.equal("color_scope" in withoutColors.body, false);
});

test("nhóm hàng chưa Bề mặt nào khai áp dụng thì CHẶN, không mở combobox màu rỗng", async () => {
  const { body } = await read(await salesItemContext(platform(new Map([
    ["Item:ITEM-1", {
      item_name: "Cửa", item_group: "Cửa lạ", is_sales_item: 1, disabled: 0, is_stock_item: 0,
      stock_uom: "Cái", measurement_profile: "Thành phẩm theo m2",
    }],
    ["Item Group:Cửa lạ", { item_group_name: "Cửa lạ", parent_item_group: "" }],
    ["Measurement Profile:Thành phẩm theo m2", { profile_name: "Thành phẩm theo m2", require_color: 1 }],
    ["Surface Finish:STD", {
      finish_code: "STD", finish_name: "Sơn tĩnh điện",
      applies_to_groups: [{ item_group: "Cửa CN Đức" }], usage_scope: "Mua & bán",
    }],
  ])), { item_code: "ITEM-1", uom: "Cái", currency: "VND" }));

  assert.deepEqual(body.color_scope.allowed_finishes, []);
  assert.ok(body.readiness.blocking.some((entry) => entry.code === "COLOR_SCOPE_EMPTY"));
});

test("mọi trường cũ vẫn nguyên nghĩa sau khi mở thêm dữ liệu", async () => {
  const { body } = await read(await salesItemContext(platform(new Map([
    ["Item:ITEM-1", {
      item_name: "Hàng thử", is_sales_item: 1, disabled: 0, is_stock_item: 1,
      stock_uom: "Cái", default_sales_uom: "Thùng",
      uom_conversions: [{ uom: "Thùng", conversion_factor: 10 }],
    }],
  ]), { "Stock Balance": [{ item_code: "ITEM-1", warehouse: "Kho A", actual_qty: 50 }] }), {
    item_code: "ITEM-1", uom: "Thùng", warehouse: "Kho A", currency: "VND", ...NO_COLORS,
  }));

  for (const key of [
    "item_code", "item_group", "door_type", "inventory_mode", "measurement_profile", "min_area_sqm",
    "purchase_kg_per_m2", "leaf_divisor_m", "default_color", "selected_uom", "allowed_uoms",
    "uom_options", "conversion_factor", "stock_uom", "warehouse", "managed_stock",
    "available_stock_qty", "available_qty", "availability_status", "rate", "currency", "item_price",
    "price_missing", "price_error", "stock_read_error",
  ]) {
    assert.ok(key in body, `trường cũ ${key} biến mất khỏi payload`);
  }
  assert.equal(body.conversion_factor, 10);
  assert.equal(body.available_stock_qty, 50);
  assert.equal(body.available_qty, 5);
  // Và số mới phải khớp số cũ — hai chỗ nói về cùng một tồn thì không được lệch nhau.
  assert.equal(body.stock_snapshot.stock_qty, body.available_stock_qty);
  assert.equal(body.stock_snapshot.selected_qty, body.available_qty);
});
