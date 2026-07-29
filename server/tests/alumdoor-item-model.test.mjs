import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileBrief } from "../scripts/lib/compile-brief.mjs";
import alumdoorWorker from "../dist/apps-src/alumdoor-worker/src/index.js";

const brief = JSON.parse(await readFile(new URL("../briefs/alumdoor.json", import.meta.url), "utf8"));
const app = compileBrief(brief);
const doctype = (name) => app.doctypes.find((entry) => entry.name === name);
const field = (doctypeName, fieldname) => doctype(doctypeName)?.fields.find((entry) => entry.fieldname === fieldname);

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
    assert.equal(field(child, "actual_kg_per_m")?.read_only, true);
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
  }
  assert.equal(field("Purchase Receipt", "supplier")?.fetch_from, "against_purchase_order.supplier");
  assert.equal(field("Purchase Receipt", "company")?.fetch_from, "against_purchase_order.company");
  assert.equal(field("Delivery Note", "customer")?.fetch_from, "against_sales_order.customer");
  assert.equal(field("Delivery Note", "install_address")?.fetch_from, "against_sales_order.install_address");
  assert.ok(field("Sales Order", "install_address"));
  assert.match(field("Delivery Note Item", "width_mm")?.depends_on ?? "", /Thành phẩm theo m2/);
  assert.equal(brief.actions.find((entry) => entry.name === "don-ban-thanh-phieu-xuat")?.menu, false);
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

  const wrongUom = await alumdoorWorker.fetch(request({ ...base, stock_uom: "Cây" }), validEnv, {});
  assert.equal(wrongUom.status, 422);
  assert.match((await wrongUom.json()).message, /không khớp Bộ quy cách/);
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
    width_mm: 1000, height_mm: 2000, set_count: 2,
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
    }]),
    env,
    {},
  );
  assert.equal(valid.status, 200, await valid.text());

  const wrongUnit = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "A282", color: "GS", uom: "Cây", qty: 51, length_m: 8.5, qty_bar: 51 }]),
    env,
    {},
  );
  assert.equal(wrongUnit.status, 422);
  assert.match((await wrongUnit.json()).message, /phải nhập theo Kg/);

  const missingDimensions = await alumdoorWorker.fetch(
    validatorRequest([{ item_code: "A282", color: "GS", uom: "Kg", qty: 191.4 }]),
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
    width_mm: 1000,
    height_mm: 2000,
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
