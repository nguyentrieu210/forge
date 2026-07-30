import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import alumdoorWorker, { allocateBarsFifo } from "../dist/apps-src/alumdoor-worker/src/index.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const app = compileBrief(brief);
const doctype = (name) => app.doctypes.find((entry) => entry.name === name);
const field = (doctypeName, fieldname) => doctype(doctypeName)?.fields.find((entry) => entry.fieldname === fieldname);
const v2Brief = JSON.parse(await readFile(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
const v2App = compileBrief(v2Brief);
const v2Doctype = (name) => v2App.doctypes.find((entry) => entry.name === name);
const v2Field = (doctypeName, fieldname) =>
  v2Doctype(doctypeName)?.fields.find((entry) => entry.fieldname === fieldname);

test("nhôm giao về được trừ FIFO và chỉ nhận dư trong tổng dung sai còn lại", () => {
  const sourceLine = { item_code: "AL71", length_m: 7.2, theoretical_kg_per_m: 0.389 };
  const balances = [
    { purchase_order: "PO-001", transaction_date: "2026-07-01", ordered_bars: 200, received_bars: 0, source_line: sourceLine },
    { purchase_order: "PO-002", transaction_date: "2026-07-02", ordered_bars: 100, received_bars: 0, source_line: sourceLine },
  ];
  assert.deepEqual(
    allocateBarsFifo(balances, 230, 5).map(({ purchase_order, allocated_bars, kind }) => ({
      purchase_order, allocated_bars, kind,
    })),
    [
      { purchase_order: "PO-001", allocated_bars: 200, kind: "Theo đơn" },
      { purchase_order: "PO-002", allocated_bars: 30, kind: "Theo đơn" },
    ],
  );
  assert.equal(allocateBarsFifo(balances, 315, 5).at(-1).kind, "Dung sai");
  assert.throws(() => allocateBarsFifo(balances, 315.00001, 5), /dung sai 5%/i);

  const afterPriorExcess = balances.map((row, index) => ({
    ...row,
    received_bars: index === 0 ? 210 : 0,
  }));
  assert.doesNotThrow(() => allocateBarsFifo(afterPriorExcess, 105, 5));
  assert.throws(() => allocateBarsFifo(afterPriorExcess, 105.00001, 5), /dung sai 5%/i);
});

test("Alumdoor Item declares reusable inventory measurement profiles", () => {
  assert.equal(doctype("Item Group")?.is_tree, true);
  assert.ok(doctype("UOM"));
  assert.ok(doctype("Brand"));
  assert.ok(doctype("Manufacturer"));
  assert.ok(doctype("Material Specification"));
  assert.ok(doctype("Supplier Item"));
  assert.ok(doctype("Measurement Profile"));
  assert.equal(doctype("Item Allowed Color")?.is_child, true);
  assert.equal(doctype("Item")?.allow_rename, true);
  assert.equal(field("Item", "item_code")?.read_only_depends_on, "eval: !doc.__islocal");
  assert.equal(field("Item", "item_group")?.options, "Item Group");
  assert.equal(field("Item", "item_nature")?.default, "Hàng tồn kho");
  assert.equal(field("Item", "is_stock_item")?.default, true);
  assert.equal(field("Item", "inventory_mode")?.default, "Hàng thường");
  assert.deepEqual(field("Item", "door_type")?.options.split("\n"), ["Cửa Đức", "Cửa Úc", "Cửa Lưới", "Cửa Đài Loan", "Cửa Siêu Trường"]);
  assert.match(field("Item", "purchase_kg_per_m2")?.depends_on ?? "", /door_type/);
  assert.equal(field("Item", "stock_uom")?.default, "Cái");
  assert.equal(field("Item", "stock_uom")?.options, "UOM");
  assert.equal(field("Item", "stock_uom")?.required, true);
  assert.equal(field("Item", "measurement_profile")?.options, "Measurement Profile");
  assert.match(field("Item", "measurement_profile")?.depends_on ?? "", /inventory_mode != 'Hàng thường'/);
  assert.match(field("Item", "measurement_profile")?.mandatory_depends_on ?? "", /inventory_mode != 'Hàng thường'/);
  assert.match(field("Item", "uom_conversions")?.depends_on ?? "", /default_purchase_uom != doc.stock_uom/);
  assert.match(field("Item", "variant_attributes")?.depends_on ?? "", /variant_of/);
  assert.equal(field("Item", "default_color")?.options, "Item Color");
  assert.equal(field("Item", "allowed_colors")?.options, "Item Allowed Color");
  assert.ok(field("Item", "tab_item_main"));
  assert.ok(field("Item", "tab_item_identity"));
  assert.ok(field("Item", "tab_item_accounts"));
  assert.ok(field("Item", "tab_item_tracking"));
  assert.equal(field("Item", "item_defaults"), undefined);
  assert.equal(field("Item", "default_warehouse")?.options, "Warehouse");
  assert.equal(field("Item", "inventory_account")?.options, "Account");
  assert.equal(field("Item", "cogs_account")?.options, "Account");
  assert.equal(field("Item", "income_account")?.options, "Account");
  assert.equal(field("Item", "expense_account")?.options, "Account");
  assert.equal(field("Item Price", "uom")?.options, "UOM");
  assert.equal(field("Item Price", "uom")?.fetch_from, "item_code.default_sales_uom");
  assert.equal(field("Pricing Rule", "party")?.fieldtype, "Dynamic Link");
  assert.equal(field("Pricing Rule", "party")?.options, "party_type");
  assert.equal(field("Payment Entry", "party")?.fieldtype, "Dynamic Link");

  const aluminium = brief.fixtures.find((entry) =>
    entry.type === "Measurement Profile" && entry.name === "Nhôm cây/lá");
  assert.deepEqual(
    {
      mode: aluminium?.data?.inventory_mode,
      uom: aluminium?.data?.stock_uom,
      length: aluminium?.data?.require_length,
      pieces: aluminium?.data?.require_piece_qty,
    },
    { mode: "Nhôm cây/lá", uom: "Kg", length: true, pieces: true },
  );
  assert.equal(aluminium?.data?.require_color, true);
  assert.equal(
    brief.fixtures.find((entry) => entry.type === "Measurement Profile" && entry.name === "Thành phẩm theo m2")?.data?.require_color,
    true,
  );
});

test("purchase rows expose aluminium dimensions only for aluminium items", () => {
  for (const child of ["Supplier Quotation Item", "Purchase Order Item", "Purchase Receipt Item"]) {
    assert.equal(field(child, "inventory_mode")?.hidden, true);
    assert.equal(field(child, "color")?.fieldtype, "Link");
    assert.equal(field(child, "color")?.options, "Item Color");
    assert.match(field(child, "length_m")?.depends_on ?? "", /Nhôm cây\/lá/);
    assert.match(field(child, "length_m")?.mandatory_depends_on ?? "", /Nhôm cây\/lá/);
    assert.match(field(child, "qty_bar")?.mandatory_depends_on ?? "", /Nhôm cây\/lá/);
    assert.equal(field(child, "total_length_m")?.read_only, true);
    if (child === "Purchase Order Item") {
      assert.equal(field(child, "length_m")?.label, "Kích thước (chiều rộng) (m)");
      assert.equal(field(child, "theoretical_kg_per_m")?.read_only, true);
      assert.equal(field(child, "theoretical_kg_per_m")?.precision, 3);
      assert.equal(field(child, "theoretical_kg")?.read_only, true);
      assert.equal(field(child, "theoretical_kg")?.precision, 3);
      assert.equal(field(child, "is_stamped")?.fieldtype, "Select");
      assert.equal(field(child, "is_stamped")?.options, "Có\nKhông");
      assert.equal(field(child, "is_stamped")?.required, true);
      assert.equal(field(child, "is_stamped")?.default, "Không");
      assert.equal(field(child, "qty")?.label, "Số lượng");
      assert.match(field(child, "qty")?.description ?? "", /Số lượng tính tiền/);
      assert.match(field(child, "qty")?.read_only_depends_on ?? "", /Nhôm cây\/lá/);
      assert.equal(field(child, "actual_weight_kg"), undefined);
    } else {
      assert.equal(field(child, "actual_weight_kg")?.non_negative, true);
      assert.match(field(child, "actual_weight_kg")?.depends_on ?? "", /uom != 'Kg'/);
      assert.equal(field(child, "actual_kg_per_m")?.read_only, true);
      assert.match(field(child, "actual_kg_per_m")?.description ?? "", /không coi số Bộ\/Cái là kg/);
    }
    if (child !== "Supplier Quotation Item") {
      assert.equal(field(child, "conversion_factor")?.label, "Hệ số quy đổi về ĐVT tồn");
    }
  }
  assert.deepEqual(app.validators, [
    { doctype: "Item", actions: ["create", "save"] },
    { doctype: "Purchase Order", actions: ["create", "save", "submit"] },
    { doctype: "Purchase Receipt", actions: ["create", "save", "submit"] },
    { doctype: "Purchase Invoice", actions: ["create", "save", "submit"] },
    { doctype: "Material Request", actions: ["create", "save", "submit"] },
    { doctype: "Request for Quotation", actions: ["create", "save", "submit"] },
    { doctype: "Supplier Quotation", actions: ["create", "save", "submit"] },
    { doctype: "Quotation", actions: ["create", "save", "submit"] },
    { doctype: "Sales Order", actions: ["create", "save", "submit"] },
    { doctype: "Delivery Note", actions: ["create", "save", "submit"] },
    { doctype: "Sales Invoice", actions: ["create", "save", "submit"] },
    { doctype: "Work Order", actions: ["create", "save", "submit"] },
    { doctype: "Aluminium Lot", actions: ["create", "save"] },
  ]);
  for (const [child, colorField] of [
    ["Quotation Item", "color"],
    ["Sales Order Item", "color"],
    ["Material Request Item", "color"],
    ["Aluminium Lot", "colour"],
    ["Work Order", "color"],
  ]) {
    assert.equal(field(child, colorField)?.fieldtype, "Link");
    assert.equal(field(child, colorField)?.options, "Item Color");
  }
  for (const child of ["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]) {
    assert.equal(field(child, "inventory_mode")?.hidden, true);
    assert.equal(field(child, "stock_uom")?.read_only, true);
    assert.equal(field(child, "uom")?.options, "UOM");
    assert.equal(field(child, "conversion_factor")?.read_only, true);
    assert.equal(field(child, "stock_qty")?.read_only, true);
    assert.deepEqual(field(child, "sales_mode")?.options.split("\n"), ["Trọn bộ", "Tách món"]);
    assert.ok(field(child, "has_butterfly_bracket"));
    assert.ok(field(child, "mesh_height_m"));
    assert.equal(field(child, "formula_policy")?.read_only, true);
    assert.equal(field(child, "width_basis")?.read_only, true);
    assert.equal(field(child, "cut_width_m")?.read_only, true);
    assert.equal(field(child, "billable_area_sqm")?.read_only, true);
  }
  assert.equal(field("Purchase Receipt", "supplier")?.fetch_from, "against_purchase_order.supplier");
  assert.equal(field("Purchase Receipt", "company")?.fetch_from, "against_purchase_order.company");
  assert.equal(field("Delivery Note", "customer")?.fetch_from, "against_sales_order.customer");
  assert.equal(field("Delivery Note", "install_address")?.fetch_from, "against_sales_order.install_address");
  assert.ok(field("Sales Order", "install_address"));
  assert.match(field("Delivery Note Item", "width_m")?.depends_on ?? "", /Thành phẩm theo m2/);
  assert.equal(brief.actions.find((entry) => entry.name === "don-ban-thanh-phieu-xuat")?.menu, false);
});

test("V2 purchase receipt exposes dimensions and area weight without mixing kg/m", () => {
  assert.equal(v2Brief.version, "2.0.4");
  const receiptItem = v2Doctype("Purchase Receipt Item");
  for (const fieldname of [
    "height_m", "width_m", "set_count", "actual_weight_kg", "actual_kg_per_m", "actual_kg_per_sqm",
  ]) {
    const entry = receiptItem?.fields.find((candidate) => candidate.fieldname === fieldname);
    assert.ok(entry, `thiếu ${fieldname}`);
    assert.equal(entry.in_list_view, true, `${fieldname} phải có trong bảng gọn`);
  }
  assert.equal(v2Field("Purchase Receipt Item", "set_count")?.label, "Số cái/bộ");
  assert.match(v2Field("Purchase Receipt Item", "set_count")?.depends_on ?? "", /Tấm\/Kính/);
  assert.match(v2Field("Purchase Receipt Item", "color")?.depends_on ?? "", /Thành phẩm theo m2/);
  assert.match(v2Field("Purchase Receipt Item", "actual_weight_kg")?.depends_on ?? "", /Thành phẩm theo m2/);
  assert.equal(v2Field("Purchase Receipt Item", "actual_kg_per_m")?.label, "TL thực (kg/m)");
  assert.equal(v2Field("Purchase Receipt Item", "actual_kg_per_sqm")?.label, "TL thực (kg/m²)");
  assert.equal(v2Field("Purchase Receipt Item", "actual_kg_per_sqm")?.read_only, true);
  assert.match(v2Field("Purchase Receipt Item", "actual_kg_per_sqm")?.description ?? "", /Cao × Rộng × Số cái\/bộ/);
  assert.equal(v2Field("Purchase Receipt Item", "is_stamped")?.fieldtype, "Select");
  assert.equal(v2Field("Purchase Receipt Item", "is_stamped")?.options, "Có\nKhông");
  assert.equal(v2Field("Purchase Receipt Item", "is_stamped")?.default, "Không");
  assert.equal(
    v2Brief.fixtures.find((entry) => entry.type === "Measurement Profile" && entry.name === "Nhôm cây/lá")?.data?.stock_uom,
    "Kg",
  );
});

function validatorRequest(items) {
  return new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Purchase Receipt",
      name: "NEW-PURCHASE-RECEIPT",
      action: "submit",
      payload: { items },
    }),
  });
}

function purchaseOrderValidatorRequest(items) {
  return new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Purchase Order",
      name: "NEW-PURCHASE-ORDER",
      action: "create",
      payload: { items },
    }),
  });
}

function platform(items) {
  return {
    fetch(request) {
      const code = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
      const item = items[code];
      return item
        ? Promise.resolve(Response.json({ data: item }))
        : Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
    },
  };
}

function masterPlatform(records) {
  return {
    fetch(request) {
      const parts = new URL(request.url).pathname.split("/").filter(Boolean);
      const doctypeName = decodeURIComponent(parts.at(-2));
      const name = decodeURIComponent(parts.at(-1));
      const value = records[`${doctypeName}:${name}`];
      return value
        ? Promise.resolve(Response.json({ data: value }))
        : Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
    },
  };
}

test("Item master rejects category containers and mismatched measurement profiles", async () => {
  const base = {
    item_code: "A282",
    item_group: "Nan/lá cửa",
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    stock_uom: "Kg",
    default_purchase_uom: "Kg",
  };
  const request = (payload) => new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({ doctype: "Item", name: "A282", action: "create", payload }),
  });
  const validEnv = {
    PLATFORM: masterPlatform({
      "Item Group:Nan/lá cửa": { is_group: 0 },
      "Measurement Profile:Nhôm cây/lá": { inventory_mode: "Nhôm cây/lá", stock_uom: "Kg" },
    }),
  };
  const valid = await alumdoorWorker.fetch(request(base), validEnv, {});
  assert.equal(valid.status, 200, await valid.text());

  const container = await alumdoorWorker.fetch(
    request({ ...base, item_group: "Nguyên vật liệu" }),
    {
      PLATFORM: masterPlatform({
        "Item Group:Nguyên vật liệu": { is_group: 1 },
        "Measurement Profile:Nhôm cây/lá": { inventory_mode: "Nhôm cây/lá", stock_uom: "Kg" },
      }),
    },
    {},
  );
  assert.equal(container.status, 422);
  assert.match((await container.json()).message, /nhóm chứa/);

  /**
   * Bộ quy cách ĐỀ XUẤT đơn vị tồn — nó không còn phủ quyết mặt hàng.
   *
   * Bản trước từ chối "Cây" vì bộ quy cách nhôm đề xuất "Kg". Chủ xưởng chốt ngày 2026-07-29
   * rằng nan/lá cửa tồn theo CÂY (thợ đếm lá, không cân kg) còn cửa Đài Loan vẫn tồn theo Kg —
   * hai mặt hàng cùng kiểu "Nhôm cây/lá" nhưng đếm khác nhau, vì chúng giống nhau ở CÁCH ĐO
   * (màu, khổ, số cây) chứ không phải ở đơn vị tồn.
   *
   * Luật thật sự giữ sổ khỏi lệch nằm ở phiếu nhập, không ở danh mục: mua theo Kg mà tồn theo
   * Cây thì hệ số quy đổi của dòng phải khớp `số cây ÷ số kg` của chính dòng đó.
   */
  const barsInStock = await alumdoorWorker.fetch(request({ ...base, stock_uom: "Cây" }), validEnv, {});
  assert.equal(barsInStock.status, 200, await barsInStock.text());
});

test("a service cannot masquerade as stock", async () => {
  const response = await alumdoorWorker.fetch(
    new Request("https://app.internal/hooks/validate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cloudforge-tenant": "tenant-test",
        "x-cloudforge-callback": "https://tenant.test/_app/",
      },
      body: JSON.stringify({
        doctype: "Item",
        name: "LAP-DAT",
        action: "create",
        payload: {
          item_code: "LAP-DAT",
          item_group: "Dịch vụ",
          item_nature: "Dịch vụ",
          is_stock_item: 1,
          inventory_mode: "Hàng thường",
        },
      }),
    }),
    { PLATFORM: masterPlatform({ "Item Group:Dịch vụ": { is_group: 0 } }) },
    {},
  );
  assert.equal(response.status, 422);
  assert.match((await response.json()).message, /dịch vụ không được bật Quản lý tồn kho/);
});

test("Item color policy rejects duplicates and a default outside the allowed list", async () => {
  const base = {
    item_code: "CUA-01",
    item_group: "Thành phẩm",
    item_nature: "Hàng tồn kho",
    material_stage: "Thành phẩm",
    supply_type: "Tự sản xuất",
    is_stock_item: 1,
    inventory_mode: "Thành phẩm theo m2",
    measurement_profile: "Thành phẩm theo m2",
    stock_uom: "Bộ",
  };
  const request = (payload) => new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({ doctype: "Item", name: "CUA-01", action: "create", payload }),
  });
  const env = {
    PLATFORM: masterPlatform({
      "Item Group:Thành phẩm": { is_group: 0 },
      "Measurement Profile:Thành phẩm theo m2": { inventory_mode: "Thành phẩm theo m2", stock_uom: "Bộ", require_color: 1 },
      "Item Color:GS": { disabled: 0 },
      "Item Color:CF": { disabled: 0 },
    }),
  };

  const duplicate = await alumdoorWorker.fetch(
    request({ ...base, allowed_colors: [{ color: "GS" }, { color: "GS" }] }),
    env,
    {},
  );
  assert.equal(duplicate.status, 422);
  assert.match((await duplicate.json()).message, /khai lặp/);

  const outside = await alumdoorWorker.fetch(
    request({ ...base, default_color: "CF", allowed_colors: [{ color: "GS" }] }),
    env,
    {},
  );
  assert.equal(outside.status, 422);
  assert.match((await outside.json()).message, /chưa nằm trong Các màu được phép/);

  const dynamicArea = await alumdoorWorker.fetch(
    request({ ...base, default_sales_uom: "m2", allowed_colors: [{ color: "GS" }] }),
    env,
    {},
  );
  assert.equal(dynamicArea.status, 200, await dynamicArea.text());

  const manufacturedOnly = await alumdoorWorker.fetch(
    request({ ...base, is_purchase_item: 0, is_sales_item: 1, default_purchase_uom: "Kg", default_sales_uom: "m2" }),
    env,
    {},
  );
  assert.equal(manufacturedOnly.status, 200, await manufacturedOnly.text());
});

test("sales and production documents require an active allowed color", async () => {
  const request = (color) => new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Sales Order",
      name: "NEW-SALES-ORDER",
      action: "create",
      payload: { items: [{ item_code: "CUA-01", color }] },
    }),
  });
  const env = {
    PLATFORM: masterPlatform({
      "Item:CUA-01": {
        inventory_mode: "Thành phẩm theo m2",
        measurement_profile: "Thành phẩm theo m2",
        allowed_colors: [{ color: "GS" }],
      },
      "Measurement Profile:Thành phẩm theo m2": { require_color: 1 },
      "Item Color:GS": { disabled: 0 },
      "Item Color:CF": { disabled: 0 },
    }),
  };

  const missing = await alumdoorWorker.fetch(request(""), env, {});
  assert.equal(missing.status, 422);
  assert.match((await missing.json()).message, /cần chọn Mã màu/);

  const disallowed = await alumdoorWorker.fetch(request("CF"), env, {});
  assert.equal(disallowed.status, 422);
  assert.match((await disallowed.json()).message, /không nằm trong Các màu được phép/);

  const valid = await alumdoorWorker.fetch(request("GS"), env, {});
  assert.equal(valid.status, 200, await valid.text());
});

test("ordinary items keep the simple qty/uom path", async () => {
  const response = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "MOTOR-01", qty: 2, uom: "Cái", rate: 1_000_000 }]),
    { PLATFORM: platform({ "MOTOR-01": { inventory_mode: "Hàng thường", stock_uom: "Cái" } }) },
    {},
  );
  assert.equal(response.status, 200);
});

test("purchase order uses width, kg-per-m and trees to derive barem kg", async () => {
  const baremKg = 7.2 * 0.389 * 200;
  const rate = 105_000;
  const env = {
    PLATFORM: masterPlatform({
      "Item:AL71": {
        inventory_mode: "Nhôm cây/lá",
        stock_uom: "Kg",
        measurement_profile: "Nhôm cây/lá",
        material_specification: "ĐM-AL71",
        allowed_colors: [{ color: "GS" }],
      },
      "Measurement Profile:Nhôm cây/lá": { require_color: 1 },
      "Material Specification:ĐM-AL71": {
        theoretical_kg_per_m: 0.389,
      },
      "Item Color:GS": { disabled: 0 },
    }),
  };
  const line = {
    item_code: "AL71",
    color: "GS",
    uom: "Kg",
    length_m: 7.2,
    theoretical_kg_per_m: 0.389,
    qty_bar: 200,
    theoretical_kg: baremKg,
    qty: baremKg,
    rate,
    amount: baremKg * rate,
    is_stamped: "Không",
  };
  const valid = await alumdoorWorker.fetch(purchaseOrderValidatorRequest([line]), env, {});
  assert.equal(valid.status, 200, await valid.text());

  const forgedKg = await alumdoorWorker.fetch(
    purchaseOrderValidatorRequest([{ ...line, theoretical_kg: 500, qty: 500 }]),
    env,
    {},
  );
  assert.equal(forgedKg.status, 422);
  assert.match((await forgedKg.json()).message, /số kg barem phải là 560\.160000/);

  const forgedAmount = await alumdoorWorker.fetch(
    purchaseOrderValidatorRequest([{ ...line, amount: 1 }]),
    env,
    {},
  );
  assert.equal(forgedAmount.status, 422);
  assert.match((await forgedAmount.json()).message, /thành tiền phải là/);
});

test("purchase receipt validates actual kg per square metre from height, width and pieces", async () => {
  const item = {
    inventory_mode: "Thành phẩm theo m2",
    stock_uom: "m2",
    default_purchase_uom: "m2",
    min_area_sqm: 0,
    is_purchase_item: 1,
    allowed_colors: [{ color: "GS" }],
  };
  const base = {
    item_code: "CUA-M2",
    uom: "m2",
    qty: 24,
    width_m: 3,
    height_m: 2,
    set_count: 4,
    color: "GS",
    actual_weight_kg: 48,
    actual_kg_per_sqm: 2,
    conversion_factor: 1,
    stock_qty: 24,
  };
  const env = { PLATFORM: platform({ "CUA-M2": item, GS: { disabled: 0 } }) };

  const valid = await alumdoorWorker.fetch(validatorRequest([base]), env, {});
  assert.equal(valid.status, 200, await valid.text());

  const forged = await alumdoorWorker.fetch(
    validatorRequest([{ ...base, actual_kg_per_sqm: 3 }]),
    env,
    {},
  );
  assert.equal(forged.status, 422);
  assert.match((await forged.json()).message, /TL thực phải là 2\.000000 kg\/m²/);

  const missingPieces = await alumdoorWorker.fetch(
    validatorRequest([{ ...base, set_count: 0, actual_kg_per_sqm: undefined }]),
    env,
    {},
  );
  assert.equal(missingPieces.status, 422);
  assert.match((await missingPieces.json()).message, /Số cái\/bộ phải lớn hơn 0/);
});

test("m2 sales derives a dynamic conversion to exact set stock", async () => {
  const request = (line) => new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cloudforge-tenant": "tenant-test",
      "x-cloudforge-callback": "https://tenant.test/_app/",
    },
    body: JSON.stringify({
      doctype: "Sales Order",
      name: "NEW-SALES-ORDER",
      action: "create",
      payload: { items: [line] },
    }),
  });
  const env = {
    PLATFORM: masterPlatform({
      "Item:CUA-M2": {
        inventory_mode: "Thành phẩm theo m2",
        measurement_profile: "Thành phẩm theo m2",
        stock_uom: "Bộ",
        default_sales_uom: "m2",
        min_area_sqm: 3,
        is_sales_item: 1,
        allowed_colors: [{ color: "GS" }],
      },
      "Measurement Profile:Thành phẩm theo m2": { require_color: 1 },
      "Item Color:GS": { disabled: 0 },
    }),
  };
  const base = {
    item_code: "CUA-M2", color: "GS", uom: "m2", qty: 6,
    width_m: 1, height_m: 2, set_count: 2,
    conversion_factor: 2 / 6, stock_qty: 2,
  };
  const valid = await alumdoorWorker.fetch(request(base), env, {});
  assert.equal(valid.status, 200, await valid.text());

  const forged = await alumdoorWorker.fetch(request({ ...base, conversion_factor: 1, stock_qty: 6 }), env, {});
  assert.equal(forged.status, 422);
  assert.match((await forged.json()).message, /hệ số quy đổi phải là/);
});

test("aluminium is authoritative Kg stock plus required physical dimensions", async () => {
  const env = { PLATFORM: platform({
    A282: { inventory_mode: "Nhôm cây/lá", stock_uom: "Kg", allowed_colors: [{ color: "GS" }] },
    GS: { disabled: 0 },
  }) };
  const valid = await alumdoorWorker.fetch(
    validatorRequest([{
      item_code: "A282",
      inventory_mode: "Hàng thường",
      uom: "Kg",
      conversion_factor: 1,
      qty: 191.4,
      length_m: 8.5,
      qty_bar: 51,
      qty_bundle: 6,
      so_no: "14JJ",
      color: "GS",
      is_stamped: "Không",
    }]),
    env,
    {},
  );
  assert.equal(valid.status, 200, await valid.text());

  const wrongUnit = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "A282", color: "GS", is_stamped: "Không", uom: "Cây", qty: 51, length_m: 8.5, qty_bar: 51 }]),
    env,
    {},
  );
  assert.equal(wrongUnit.status, 422);
  assert.match((await wrongUnit.json()).message, /phải nhập theo Kg/);

  const missingDimensions = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "A282", color: "GS", is_stamped: "Không", uom: "Kg", qty: 191.4 }]),
    env,
    {},
  );
  assert.equal(missingDimensions.status, 422);
  assert.match((await missingDimensions.json()).message, /chiều dài/);
});

test("supplier quotation to purchase order preserves color and aluminium dimensions", async () => {
  const sourceLine = {
    item_code: "A282",
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    color: "GS",
    length_m: 8.5,
    qty_bundle: 6,
    qty_bar: 51,
    total_length_m: 433.5,
    actual_kg_per_m: 0.4415,
    so_no: "14JJ",
    qty: 191.4,
    uom: "Kg",
    conversion_factor: 1,
    rate: 105_000,
    note: "Lô màu GS",
  };
  const response = await alumdoorWorker.fetch(
    new Request("https://app.internal/api/method/alumdoor.purchase.preview_order", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cloudforge-tenant": "tenant-test",
        "x-cloudforge-callback": "https://tenant.test/_app/",
      },
      body: JSON.stringify({ args: { supplier_quotation: "SQ-1", warehouse: "K12" } }),
    }),
    {
      PLATFORM: {
        fetch(request) {
          const path = decodeURIComponent(new URL(request.url).pathname);
          if (path.endsWith("/resource/Supplier Quotation/SQ-1")) {
            return Promise.resolve(Response.json({
              data: {
                name: "SQ-1",
                docstatus: 1,
                supplier: "TIEN-DAT",
                items: [sourceLine],
              },
            }));
          }
          return Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
        },
      },
    },
    {},
  );
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = JSON.parse(text);
  assert.deepEqual(body.items, [{ row_id: "R1", ...sourceLine, warehouse: "K12" }]);
});

test("sales order to delivery preserves Item snapshots and exact remaining stock", async () => {
  const sourceLine = {
    item_code: "CUA-M2",
    item_name: "Cửa Đức",
    inventory_mode: "Thành phẩm theo m2",
    measurement_profile: "Thành phẩm theo m2",
    stock_uom: "Bộ",
    min_area_sqm: 3,
    color: "GS",
    width_m: 1,
    height_m: 2,
    set_count: 2,
    qty: 6,
    uom: "m2",
    conversion_factor: 2 / 6,
    stock_qty: 2,
    rate: 1_000_000,
    warehouse: "K12",
  };
  const response = await alumdoorWorker.fetch(
    new Request("https://app.internal/api/method/alumdoor.sales.preview_delivery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cloudforge-tenant": "tenant-test",
        "x-cloudforge-callback": "https://tenant.test/_app/",
      },
      body: JSON.stringify({ args: { sales_order: "SO-1" } }),
    }),
    {
      PLATFORM: {
        fetch(request) {
          const url = new URL(request.url);
          const path = decodeURIComponent(url.pathname);
          if (path.endsWith("/resource/Sales Order/SO-1")) {
            return Promise.resolve(Response.json({ data: {
              name: "SO-1", docstatus: 1, customer: "KH-1", company: "ALUMDOOR", currency: "VND",
              install_address: "Xưởng K12", items: [sourceLine],
            } }));
          }
          if (path.endsWith("/resource/Delivery Note")) return Promise.resolve(Response.json({ data: [] }));
          return Promise.resolve(Response.json({ message: "not found" }, { status: 404 }));
        },
      },
    },
    {},
  );
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = JSON.parse(text);
  assert.equal(body.items[0].qty, 6);
  assert.equal(body.items[0].stock_qty, 2);
  assert.equal(body.items[0].set_count, 2);
  assert.equal(body.items[0].warehouse, "K12");
  assert.equal(body.items[0].color, "GS");
});

/**
 * Nhóm giá của khách chi phối HAI thứ, và cái thứ hai mới là cái đắt.
 *
 * Thứ nhất là tiền: đại lý khai bề rộng theo phủ bì nhựa, khách lẻ theo phủ bì ray, nên cùng
 * một bộ cửa ra hai con số mét vuông khác nhau. Thứ hai là RỘNG CẮT LÁ: đại lý trừ 0,02, khách
 * lẻ trừ 0,08 — và cắt sai thì cây nhôm thành phế, không nối lại được.
 *
 * Vì vậy nhóm giá không được là một ô chọn rỗng trên chứng từ để người lập tự điền: nó phải
 * đến từ hồ sơ khách. Xem docs/ALUMDOOR-LUAT-DO-VA-GIA.md.
 */
test("nhóm giá đến từ hồ sơ khách, không phải người lập chứng từ tự chọn", () => {
  const priceGroup = field("Customer", "price_group");
  assert.ok(priceGroup, "Customer phải có trường Nhóm giá");
  assert.equal(priceGroup.fieldtype, "Select");
  assert.deepEqual(priceGroup.options.split("\n"), ["Đại lý", "Lẻ"]);
  // Không mặc định: 321/439 khách hiện mang đúng giá trị mặc định của trường cũ, và đó là lý do
  // phân loại khách hiện có không dùng lại được.
  assert.equal(priceGroup.default, undefined);

  for (const doctypeName of ["Quotation", "Sales Order"]) {
    const group = field(doctypeName, "customer_group");
    assert.equal(group?.fetch_from, "customer.price_group", `${doctypeName} phải lấy nhóm giá từ khách`);
    assert.equal(group?.read_only, true, `${doctypeName} không được cho sửa tay nhóm giá`);
  }
});

test("công thức cửa tách khỏi chính sách giá và phủ đủ năm loại cửa", () => {
  const policy = doctype("Cutting Policy");
  assert.ok(policy, "phải có doctype Công thức cửa");
  for (const required of [
    "door_type", "dealer_width_basis", "retail_width_basis",
    "dealer_cut_deduction_m", "retail_cut_deduction_m",
    "dealer_split_sales_basis", "dealer_full_sales_basis", "retail_sales_basis",
    "purchase_formula",
  ]) assert.equal(field("Cutting Policy", required)?.required, true, `${required} phải bắt buộc`);

  const rules = brief.fixtures.filter((entry) => entry.type === "Cutting Policy");
  const active = rules.filter((rule) => !rule.data.disabled);
  assert.equal(active.length, 5, "mỗi loại cửa có đúng một luật hoạt động");
  const byType = new Map(active.map((rule) => [rule.data.door_type, rule.data]));
  assert.deepEqual([...byType.keys()].sort(), ["Cửa Đức", "Cửa Úc", "Cửa Lưới", "Cửa Đài Loan", "Cửa Siêu Trường"].sort());
  assert.deepEqual(
    {
      dealerBasis: byType.get("Cửa Đức").dealer_width_basis,
      dealerCut: byType.get("Cửa Đức").dealer_cut_deduction_m,
      retailBasis: byType.get("Cửa Đức").retail_width_basis,
      retailCut: byType.get("Cửa Đức").retail_cut_deduction_m,
    },
    { dealerBasis: "Phủ bì nhựa", dealerCut: 0.02, retailBasis: "Phủ bì ray", retailCut: 0.08 },
  );
  assert.equal(byType.get("Cửa Lưới").dealer_split_sales_basis, "Rộng cắt lá");
  assert.equal(byType.get("Cửa Lưới").dealer_full_sales_basis, "Phủ bì ray");
  assert.equal(byType.get("Cửa Đài Loan").manual_pull_sales_basis, "Phủ bì ray");
  assert.equal(byType.get("Cửa Siêu Trường").dealer_full_sales_basis, "Rộng cắt lá");
  for (const type of ["Cửa Úc", "Cửa Lưới", "Cửa Đài Loan", "Cửa Siêu Trường"]) {
    assert.equal(byType.get(type).purchase_formula, "Barem kg/m2");
    assert.equal(byType.get(type).purchase_width_basis, "Rộng cắt lá");
  }
  const gap = byType.get("Cửa Đức").retail_cut_deduction_m - byType.get("Cửa Đức").dealer_cut_deduction_m;
  assert.ok(Math.abs(gap - 0.06) < 1e-9, "khoảng cách hai cách đo phải là 0,06 m");
  assert.ok(brief.actions.find((entry) => entry.name === "tinh-cong-thuc-cua"), "phải có màn tính thử dùng đúng Worker");
});
