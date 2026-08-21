import test from "node:test";
import assert from "node:assert/strict";
import { salesItemContext } from "../dist/apps-src/alumdoor-worker/src/sales-item-context.js";
import { previewSalesCommercialLine } from "../dist/packages/frappe-api/src/alumdoor-commercial.js";
import { FrappeArgs } from "../dist/packages/frappe-api/src/args.js";

/**
 * CÁCH BÁN (biến thể giá) — chọn DÒNG GIÁ nào, không phải giảm bao nhiêu.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Vì sao file này tồn tại
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Đo trên D1 local ngày 21/08/2026, bảng giá `Alumdoor 2026` có 288 dòng `Item Price` đang bật:
 *
 *   STANDARD 173 · TRON_BO 56 · TANG_RAY 15 · CHI_LA 15 · TACH_MON 13 · KEO_TAY 9 · MOTOR_NGOAI 7
 *
 * 22/224 cặp (mã hàng + ĐVT) có từ HAI dòng đang bật trở lên, chia làm hai hình dạng khác hẳn nhau
 * mà trước đây bị gộp làm một lỗi:
 *
 *   · 15 cặp `CDUC_*` — hai CÁCH BÁN, cùng bậc `MOI-DIEN-TICH`. `CDUC_AL70_1LOP · m2` có
 *     `TANG_RAY` 1.221.000 và `CHI_LA` 1.146.000; lệch 75.000 đ/m², tức 675.000 đ trên một bộ
 *     9 m². Không có gì chọn giữa hai con số đó ngoài Ý ĐỊNH của người bán.
 *   · 7 cặp `LA_DLK_*` / `CDL_DLM_*` — MỘT cách bán (`TRON_BO`) với TÁM bậc diện tích. Đây là dữ
 *     liệu đúng: con số cuối lấy theo diện tích một bộ của dòng.
 *
 * Trước đợt này, cả 22 cặp đều chết ở hai đầu:
 *   · xem trước ném "Có nhiều đơn giá đang hoạt động…" — một câu không nói được phải làm gì;
 *   · lưu đơn ném "Item Price … does not exist for variant STANDARD", vì `Sales Order Item`
 *     không có ô nào chở cách bán nên đường lưu luôn rơi về `STANDARD`.
 */

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Nền cho `alumdoor.sales.item_context`
// ──────────────────────────────────────────────────────────────────────────────────────────────

function platform(records) {
  const calls = [];
  const call = async (path, init = {}) => {
    calls.push({ path, init });
    if (path === "method/frappe.desk.query_report.run") {
      return new Response(JSON.stringify({ message: { result: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const listMatch = /^resource\/([^/?]+)\?(.*)$/.exec(path);
    if (listMatch) {
      const doctype = decodeURIComponent(listMatch[1]);
      const filters = JSON.parse(new URLSearchParams(listMatch[2]).get("filters") ?? "[]");
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
    const record = records.get(`${decodeURIComponent(match[1])}:${decodeURIComponent(match[2])}`);
    if (!record) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    return new Response(JSON.stringify({ data: record }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  call.calls = calls;
  return call;
}

/** Cửa CN Đức: bán m², tồn Bộ — đúng hình dạng 15 mã `CDUC_*` có hai cách bán. */
function doorItem(overrides = {}) {
  return {
    item_name: "Cửa cuốn Đức AL70 một lớp",
    item_group: "Cửa CN Đức",
    is_sales_item: 1,
    disabled: 0,
    is_stock_item: 1,
    stock_uom: "Bộ",
    default_sales_uom: "m2",
    measurement_profile: "Thành phẩm theo m2",
    uom_conversions: [],
    ...overrides,
  };
}

function priceRow(overrides = {}) {
  return {
    price_list: "Alumdoor 2026",
    item_code: "CDUC_AL70_1LOP",
    uom: "m2",
    area_tier: "MOI-DIEN-TICH",
    currency: "VND",
    disabled: 0,
    ...overrides,
  };
}

/** Đúng hai dòng của `CDUC_AL70_1LOP` trên D1, không phải số bịa. */
function twoVariants() {
  return new Map([
    ["Item:CDUC_AL70_1LOP", doorItem()],
    ["Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:TANG_RAY:MOI-DIEN-TICH",
      priceRow({ price_variant: "TANG_RAY", rate: 1221000 })],
    ["Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:CHI_LA:MOI-DIEN-TICH",
      priceRow({ price_variant: "CHI_LA", rate: 1146000 })],
  ]);
}

const ASK = { item_code: "CDUC_AL70_1LOP", uom: "m2", price_list: "Alumdoor 2026", currency: "VND", include_color_scope: false };

async function read(response) {
  return { status: response.status, body: await response.json() };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Xem trước dòng hàng
// ──────────────────────────────────────────────────────────────────────────────────────────────

test("hai cách bán mà chưa chọn: KHÔNG ra tiền, và trả về danh sách kèm ĐƠN GIÁ của từng cách", async () => {
  const { status, body } = await read(await salesItemContext(platform(twoVariants()), ASK));

  assert.equal(status, 200);
  // Không ra một con số nào — đây là chỗ duy nhất trong dòng mà im lặng sẽ ra số SAI, không ra 0.
  assert.equal(body.rate, null);
  assert.equal(body.price_missing, true);
  // Và KHÔNG gọi là lỗi: danh mục không thiếu gì, người bán mới là bên còn thiếu một quyết định.
  assert.equal(body.price_error, null);

  const explain = body.price_explain;
  assert.equal(explain.resolution, "variant_required");
  assert.equal(explain.price_variant_required, true);
  assert.equal(explain.price_variant, null);
  assert.equal(explain.price_variant_source, null);

  // Đơn giá đi kèm là thứ giúp người bán chọn đúng mà không cần ai dịch TANG_RAY sang tiếng Việt.
  assert.deepEqual(
    explain.price_variant_options.map((option) => [option.price_variant, option.rate, option.uom]),
    [["CHI_LA", 1146000, "m2"], ["TANG_RAY", 1221000, "m2"]],
  );
  assert.match(explain.note, /CHI_LA/);
  assert.match(explain.note, /TANG_RAY/);

  // Chốt chặn chỉ về ĐÚNG Ô TRÊN DÒNG, không đẩy người bán đi sửa Danh mục — sửa nhầm chỗ ở đây
  // nghĩa là có người sẽ ngừng dùng một trong hai dòng giá thật để "cho hết lỗi".
  assert.equal(body.readiness.ready, false);
  const blocking = body.readiness.blocking.find((entry) => entry.code === "PRICE_VARIANT_REQUIRED");
  assert.ok(blocking, "thiếu chốt chặn PRICE_VARIANT_REQUIRED");
  assert.match(blocking.where, /Dòng bán/);
  assert.equal(body.readiness.blocking.some((entry) => entry.code === "PRICE_MISSING"), false);
  assert.equal(body.readiness.blocking.some((entry) => entry.code === "PRICE_ERROR"), false);
  assert.match(body.availability_status, /Chưa chọn mã giá/);
});

test("chọn cách bán rồi thì ra ĐÚNG con số của cách đó — hai cách lệch 75.000 đ/m²", async () => {
  const chiLa = await read(await salesItemContext(platform(twoVariants()), { ...ASK, price_variant: "CHI_LA" }));
  const tangRay = await read(await salesItemContext(platform(twoVariants()), { ...ASK, price_variant: "TANG_RAY" }));

  assert.equal(chiLa.body.rate, 1146000);
  assert.equal(chiLa.body.price_explain.price_variant, "CHI_LA");
  assert.equal(chiLa.body.price_explain.price_variant_source, "requested");
  assert.equal(chiLa.body.price_explain.resolution, "field_lookup");
  assert.equal(chiLa.body.readiness.ready, true);
  assert.match(chiLa.body.price_explain.note, /cách bán CHI_LA/);

  assert.equal(tangRay.body.rate, 1221000);
  assert.equal(tangRay.body.price_explain.price_variant, "TANG_RAY");

  // 675.000 đ trên một bộ 9 m² — con số này là lý do ô "Cách bán" không được phép đoán hộ.
  assert.equal((tangRay.body.rate - chiLa.body.rate) * 9, 675000);
});

test("chữ thường vẫn nhận: cách bán là mã kỹ thuật, không phân biệt hoa thường", async () => {
  const { body } = await read(await salesItemContext(platform(twoVariants()), { ...ASK, price_variant: "chi_la" }));
  assert.equal(body.rate, 1146000);
  assert.equal(body.price_explain.price_variant, "CHI_LA");
});

test("một cách bán duy nhất thì TỰ ĐIỀN, không hỏi — 202/224 cặp rơi vào đây", async () => {
  const records = new Map([
    ["Item:CDUC_AL70_1LOP", doorItem()],
    ["Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:CHI_LA:MOI-DIEN-TICH",
      priceRow({ price_variant: "CHI_LA", rate: 1146000 })],
  ]);
  const { body } = await read(await salesItemContext(platform(records), ASK));

  assert.equal(body.rate, 1146000);
  assert.equal(body.price_explain.price_variant, "CHI_LA");
  assert.equal(body.price_explain.price_variant_source, "only_option");
  assert.equal(body.price_explain.price_variant_required, false);
  assert.equal(body.readiness.ready, true);
  // Vẫn liệt kê ra để client biết đây là giá trị PHẢI gửi kèm lúc lưu: đường lưu mặc định
  // STANDARD, nên ô để trống là đơn bị từ chối ở bước cuối dù xem trước đã ra tiền.
  assert.deepEqual(body.price_explain.price_variant_options.map((option) => option.price_variant), ["CHI_LA"]);
});

test("có dòng STANDARD thì STANDARD thắng khi chưa chọn — đúng bằng mặc định của đường lưu", async () => {
  const records = twoVariants();
  records.set("Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:STANDARD:MOI-DIEN-TICH",
    priceRow({ price_variant: "STANDARD", rate: 1100000 }));
  const { body } = await read(await salesItemContext(platform(records), ASK));

  // Xem trước và lưu phải ra CÙNG một con số. Hỏi cách bán ở đây trong khi đường lưu vẫn lặng lẽ
  // chọn STANDARD là dựng lại đúng cái lệch mà cả đợt này đang chống.
  assert.equal(body.rate, 1100000);
  assert.equal(body.price_explain.price_variant, "STANDARD");
  assert.equal(body.price_explain.price_variant_source, "standard_default");
  assert.equal(body.price_explain.price_variant_required, false);
  assert.equal(body.readiness.ready, true);
  // Nhưng vẫn nói ra hai cách còn lại, nếu không thì người bán không biết chúng tồn tại.
  assert.deepEqual(
    body.price_explain.price_variant_options.map((option) => option.price_variant),
    ["CHI_LA", "STANDARD", "TANG_RAY"],
  );
});

test("cách bán không có giá thì nói rõ THIẾU CÁCH NÀO, không lặng lẽ rơi về STANDARD", async () => {
  const records = twoVariants();
  records.set("Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:STANDARD:MOI-DIEN-TICH",
    priceRow({ price_variant: "STANDARD", rate: 1100000 }));
  const { body } = await read(await salesItemContext(platform(records), { ...ASK, price_variant: "KEO_TAY" }));

  assert.equal(body.rate, null);
  assert.equal(body.price_explain.resolution, "not_found");
  assert.match(body.price_explain.note, /KEO_TAY/);
  assert.equal(body.readiness.blocking.some((entry) => entry.code === "PRICE_MISSING"), true);
});

test("thang BẬC DIỆN TÍCH không phải lỗi: nói ra khoảng giá, cảnh báo chứ không chặn", async () => {
  // Đúng hình dạng 7 mã `LA_DLK_*` / `CDL_DLM_*`: một cách bán TRON_BO, tám bậc.
  const bac = ["DT-3-4M2", "DT-4-5M2", "DT-5-6M2", "DT-6-7M2", "DT-7-8M2", "DT-8-9M2", "DT-9-10M2", "DT-TREN-10M2"];
  const records = new Map([["Item:LA_DLK_1LY_TRONBO", doorItem({ item_name: "Lá Đài Loan 1 ly trọn bộ" })]]);
  bac.forEach((tier, index) => {
    records.set(`Item Price:Alumdoor 2026:LA_DLK_1LY_TRONBO:m2:TRON_BO:${tier}`, priceRow({
      item_code: "LA_DLK_1LY_TRONBO", price_variant: "TRON_BO", area_tier: tier, rate: 630000 - index * 10000,
    }));
  });
  const { body } = await read(await salesItemContext(platform(records), {
    ...ASK, item_code: "LA_DLK_1LY_TRONBO",
  }));

  // Không ném "Có nhiều đơn giá đang hoạt động" nữa — đây là dữ liệu ĐÚNG.
  assert.equal(body.price_error, null);
  assert.equal(body.price_explain.resolution, "area_tier_ladder");
  assert.equal(body.price_explain.price_variant, "TRON_BO");
  assert.equal(body.price_explain.price_tiered_by_area, true);
  const [option] = body.price_explain.price_variant_options;
  assert.equal(option.tier_count, 8);
  assert.equal(option.rate, null);
  assert.equal(option.rate_min, 560000);
  assert.equal(option.rate_max, 630000);
  // Lời gọi này không nhận kích thước nên nó KHÔNG có quyền chốt một con số; con số cuối do
  // `metaforge.api.preview_sales_commercial_line` ra sau khi có diện tích một bộ.
  assert.equal(body.rate, null);
  assert.equal(body.readiness.blocking.some((entry) => entry.code.startsWith("PRICE_")), false);
  assert.equal(body.readiness.warnings.some((entry) => entry.code === "PRICE_TIERED_BY_AREA"), true);
});

test("hai dòng trùng khoá mà KHÔNG có bậc phân biệt vẫn là lỗi khai báo, vẫn phải kêu", async () => {
  const records = new Map([
    ["Item:CDUC_AL70_1LOP", doorItem()],
    ["Item Price:IP-A", priceRow({ price_variant: "CHI_LA", rate: 1146000, area_tier: "" })],
    ["Item Price:IP-B", priceRow({ price_variant: "CHI_LA", rate: 1150000, area_tier: "" })],
  ]);
  const { body } = await read(await salesItemContext(platform(records), { ...ASK, price_variant: "CHI_LA" }));

  assert.equal(body.rate, null);
  assert.match(body.price_error, /Có nhiều đơn giá đang hoạt động/);
  assert.match(body.price_error, /CHI_LA/);
  assert.equal(body.readiness.blocking.some((entry) => entry.code === "PRICE_ERROR"), true);
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Xem trước thương mại — nơi ra con số cuối
// ──────────────────────────────────────────────────────────────────────────────────────────────

function commercialContext(masters) {
  const documents = {
    async getDocument(_tenant, doctype, name) {
      const data = masters.get(`${doctype}:${name}`);
      return data ? { name, doctype, owner: "admin", version: 1, data } : null;
    },
    async getMasterRecordData(_tenant, doctype, name) {
      return masters.get(`${doctype}:${name}`) ?? null;
    },
    async listMasterRecordData(_tenant, doctype) {
      const prefix = `${doctype}:`;
      return [...masters.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, data]) => ({ name: key.slice(prefix.length), data }));
    },
  };
  return {
    tenantId: "demo",
    traceId: "trace-variant",
    actor: { user_id: "u1", roles: ["Sales User"] },
    now: () => "2026-08-21T08:00:00.000Z",
    documents,
    permissions: {
      async assert() {},
      async redactDocumentWithPolicies(_tenant, _meta, document) { return document; },
    },
    metadata: { async getDocType() { return null; } },
    access: { async getShare() { return null; } },
  };
}

function commercialMasters() {
  return new Map(Object.entries({
    "Currency:VND": { currency_scale: 0 },
    "Item:CDUC_AL70_1LOP": {
      item_code: "CDUC_AL70_1LOP", item_group: "Cửa CN Đức", door_type: "Cửa Đức",
      inventory_mode: "Thành phẩm theo m2", measurement_profile: "Thành phẩm theo m2",
      stock_uom: "Bộ", default_sales_uom: "m2",
    },
    "Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:TANG_RAY:MOI-DIEN-TICH": {
      price_list: "Alumdoor 2026", item_code: "CDUC_AL70_1LOP", uom: "m2",
      area_tier: "MOI-DIEN-TICH", price_variant: "TANG_RAY", currency: "VND", rate: 1221000,
    },
    "Item Price:Alumdoor 2026:CDUC_AL70_1LOP:m2:CHI_LA:MOI-DIEN-TICH": {
      price_list: "Alumdoor 2026", item_code: "CDUC_AL70_1LOP", uom: "m2",
      area_tier: "MOI-DIEN-TICH", price_variant: "CHI_LA", currency: "VND", rate: 1146000,
    },
  }));
}

function commercialArgs(line) {
  return new FrappeArgs(new Map(Object.entries({
    line, price_list: "Alumdoor 2026", currency: "VND", posting_date: "2026-08-21",
  })));
}

test("xem trước thương mại ĐI THEO cách bán của dòng, không tự rơi về STANDARD", async () => {
  /**
   * Đây là chốt chặn thứ hai của cùng một lỗi. `commercial-sales-order-controller.ts:125` (lưu
   * đơn) truyền `priceVariant`, còn `previewSalesCommercialLine` thì KHÔNG — nên trước bản vá,
   * xem trước ném "does not exist for variant STANDARD" trong khi lưu lại ra giá đúng. Xem một
   * đằng, lưu một nẻo.
   */
  const chiLa = await previewSalesCommercialLine(
    commercialArgs({ item_code: "CDUC_AL70_1LOP", uom: "m2", qty: 9, set_count: 1, price_variant: "CHI_LA" }),
    commercialContext(commercialMasters()),
  );
  assert.equal(chiLa.price_explain.price_variant, "CHI_LA");
  assert.equal(chiLa.price_explain.price_rate, "1146000");

  const tangRay = await previewSalesCommercialLine(
    commercialArgs({ item_code: "CDUC_AL70_1LOP", uom: "m2", qty: 9, set_count: 1, price_variant: "TANG_RAY" }),
    commercialContext(commercialMasters()),
  );
  assert.equal(tangRay.price_explain.price_variant, "TANG_RAY");
  assert.equal(tangRay.price_explain.price_rate, "1221000");

  // Cùng một dòng 9 m², chỉ khác cách bán ⇒ lệch đúng 675.000 đ.
  assert.equal(Number(tangRay.selling_rate) * 9 - Number(chiLa.selling_rate) * 9, 675000);
});

test("dòng không mang cách bán vẫn hỏng như cũ — bản vá KHÔNG lặng lẽ đoán hộ", async () => {
  await assert.rejects(
    () => previewSalesCommercialLine(
      commercialArgs({ item_code: "CDUC_AL70_1LOP", uom: "m2", qty: 9, set_count: 1 }),
      commercialContext(commercialMasters()),
    ),
    /does not exist for variant STANDARD/,
  );
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Ô trên dòng bán phải TỒN TẠI thì ba tầng mới nối được với nhau
// ──────────────────────────────────────────────────────────────────────────────────────────────

test("dòng bán có ô chở cách bán — thiếu nó thì năng lực ở tầng giá không có gì chuyên chở", async () => {
  const { readFileSync } = await import("node:fs");
  const brief = JSON.parse(readFileSync(new URL("../briefs/alumdoor-v2.json", import.meta.url), "utf8"));
  const nameOf = (field) => (typeof field === "string" ? field.split(":")[0].trim() : field.fieldname);

  for (const doctypeName of ["Quotation Item", "Sales Order Item", "Sales Invoice Item"]) {
    const doctype = brief.doctypes.find((entry) => entry.name === doctypeName);
    const field = (doctype?.fields ?? []).find((entry) => nameOf(entry) === "price_variant");
    assert.ok(field, `${doctypeName} thiếu ô price_variant`);
    // Ô này KHÔNG được là Select với danh sách ghim: biến thể là DỮ LIỆU của bảng giá, thêm một
    // cách bán mới trong Danh mục mà phải sửa metadata thì luật lại ngủ tiếp.
    assert.equal(field.fieldtype, "Data", `${doctypeName}.price_variant không được ghim danh sách`);
    // `sales_mode` vẫn phải đứng riêng: ánh xạ TANG_RAY/CHI_LA ↔ Trọn bộ/Tách món CHƯA AI CHỐT,
    // và gộp hai thứ lại là tự trả lời một câu hỏi thuộc về chủ xưởng.
    assert.ok((doctype.fields ?? []).some((entry) => nameOf(entry) === "sales_mode"),
      `${doctypeName} mất sales_mode`);
  }
});
