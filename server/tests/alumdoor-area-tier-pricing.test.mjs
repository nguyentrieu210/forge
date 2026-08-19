import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALL_AREA_TIER,
  areaTierBasisSqm,
  assertItemPriceTierIsUnambiguous,
  resolveServerPrice,
} from "../dist/packages/clouderp-pricing/src/index.js";
import { resolveAutoname } from "../dist/packages/frappe-model/src/autoname.js";
import { resolveCommercialLine } from "../dist/packages/clouderp-selling/src/commercial-line-resolver.js";
import { routeFrappeApi } from "../dist/packages/frappe-api/src/router.js";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";
import { classifyManagedItemPriceNames } from "../scripts/lib/alumdoor-item-price-alias.mjs";
import {
  ALUMDOOR_PRICE_LIST,
  ALL_AREA_TIER as PAYLOAD_ALL_AREA_TIER,
  itemPriceName,
} from "../scripts/build-alumdoor-pricing-payload.mjs";

const SERVER_ROOT = resolve(import.meta.dirname, "..");
const readSource = (relative) => readFileSync(resolve(SERVER_ROOT, relative), "utf8");

/**
 * Thang giá theo bậc diện tích.
 *
 * Con số lấy từ mã hàng thật đang chạy trên D1 (`TP-CUADL1LY … _TRONBO_<bậc>m²`): cùng một
 * cửa Đài Loan 1 ly, 3–4 m² là 590.000/m² còn trên 10 m² là 520.000/m². Trước 2026-08-19 thang
 * đó được biểu diễn bằng TÁM MÃ HÀNG; nay là một mặt hàng với tám dòng `Item Price` gắn
 * `area_tier`, và `Bậc diện tích` là danh mục thật.
 *
 * BRD §4.11 chốt cận trên ĐÓNG, cận dưới MỞ — `min < S ≤ max`. Hệ quả nêu thẳng trong BRD:
 * cửa đúng 5,0 m² ăn bậc 4-5, không phải 5-6.
 */

const TIERS = {
  "Bậc diện tích:BAC-3-4": { tier_code: "BAC-3-4", min_area_sqm: 3, max_area_sqm: 4, disabled: 0 },
  "Bậc diện tích:BAC-4-5": { tier_code: "BAC-4-5", min_area_sqm: 4, max_area_sqm: 5, disabled: 0 },
  "Bậc diện tích:BAC-5-6": { tier_code: "BAC-5-6", min_area_sqm: 5, max_area_sqm: 6, disabled: 0 },
  "Bậc diện tích:BAC-TREN-10": { tier_code: "BAC-TREN-10", min_area_sqm: 10, disabled: 0 },
};

const tierPrice = (tier, rate) => ({
  name: `BANG-GIA:CUA-DL-1LY:m2:STANDARD:${tier}`,
  data: {
    price_list: "BANG-GIA", item_code: "CUA-DL-1LY", uom: "m2",
    currency: "VND", rate: String(rate), area_tier: tier, disabled: 0,
  },
});

const LADDER = [
  tierPrice("BAC-3-4", 590000),
  tierPrice("BAC-4-5", 580000),
  tierPrice("BAC-5-6", 570000),
  tierPrice("BAC-TREN-10", 520000),
];

function context(itemPrices, named = TIERS) {
  return {
    command: { tenant_id: "demo" },
    reader: {
      async getDocument() { return null; },
      async getMasterRecordData(_t, doctype, name) {
        if (doctype === "Currency" && name === "VND") return { currency_scale: 2 };
        return named[`${doctype}:${name}`] ?? null;
      },
      async listMasterRecordData(_t, doctype) {
        if (doctype === "Item Price") return itemPrices;
        return [];
      },
    },
  };
}

const ask = (area, prices = LADDER) => resolveServerPrice(context(prices), {
  itemCode: "CUA-DL-1LY",
  qtyMicros: 1_000_000,
  postingDate: "2026-08-19",
  priceList: "BANG-GIA",
  documentCurrency: "VND",
  uom: "m2",
  partyType: "Customer",
  customerGroup: "Đại lý",
  billableAreaSqm: area,
});

test("một mặt hàng giữ được thang tám bậc mà không cần tám mã hàng", async () => {
  assert.equal((await ask(3.5)).rate, "590000.00");
  assert.equal((await ask(4.5)).rate, "580000.00");
  assert.equal((await ask(5.5)).rate, "570000.00");
  assert.equal((await ask(12)).rate, "520000.00");
});

test("cận trên ĐÓNG, cận dưới MỞ — cửa đúng 5,0 m² ăn bậc 4-5", async () => {
  // BRD §4.11 nêu đúng ví dụ này. Đảo chiều là lệch một bậc giá trên mọi đơn nằm ở mép.
  assert.equal((await ask(5)).rate, "580000.00", "5,0 m² phải là bậc 4-5");
  assert.equal((await ask(5.0001)).rate, "570000.00", "vừa quá 5 mới sang bậc 5-6");
  assert.equal((await ask(4)).rate, "590000.00", "4,0 m² vẫn là bậc 3-4");
});

test("dòng bán không khai diện tích thì TỪ CHỐI, không lấy bừa một bậc", async () => {
  // Thà báo lỗi còn hơn lấy nhầm bậc. Trước khi vá, đường dự phòng lấy `fieldMatches[0]` nên
  // đơn không khai diện tích lặng lẽ ăn giá bậc 3-4 — bậc ĐẮT NHẤT của thang.
  await assert.rejects(
    () => resolveServerPrice(context(LADDER), {
      itemCode: "CUA-DL-1LY", qtyMicros: 1_000_000, postingDate: "2026-08-19",
      priceList: "BANG-GIA", documentCurrency: "VND", uom: "m2", partyType: "Customer",
    }),
    /does not exist for variant STANDARD/,
  );
});

test("tám dòng giá cùng mặt hàng KHÔNG bị coi là trùng — bậc phân giải trước khi đếm", async () => {
  // Không lọc bậc trước thì cả tám dòng lọt vào ứng viên và hàm ném "Multiple active Item
  // Price records match" — tức thang giá vừa dựng lại làm chết chính nó.
  const result = await ask(4.5);
  assert.equal(result.item_price, "BANG-GIA:CUA-DL-1LY:m2:STANDARD:BAC-4-5");
});

test("dòng giá KHÔNG gắn bậc vẫn áp cho mọi diện tích", async () => {
  const flat = [{
    name: "BANG-GIA:PK-CONLAN:Cái",
    data: { price_list: "BANG-GIA", item_code: "PK-CONLAN", uom: "Cái", currency: "VND", rate: "15000", disabled: 0 },
  }];
  const result = await resolveServerPrice(context(flat), {
    itemCode: "PK-CONLAN", qtyMicros: 1_000_000, postingDate: "2026-08-19",
    priceList: "BANG-GIA", documentCurrency: "VND", uom: "Cái", partyType: "Customer",
    billableAreaSqm: 4.5,
  });
  assert.equal(result.rate, "15000.00");
});

test("bậc đã ngừng dùng thì TỪ CHỐI, không tụt sang bậc kế bên", async () => {
  const retired = { ...TIERS, "Bậc diện tích:BAC-4-5": { ...TIERS["Bậc diện tích:BAC-4-5"], disabled: 1 } };
  await assert.rejects(
    () => resolveServerPrice(context(LADDER, retired), {
      itemCode: "CUA-DL-1LY", qtyMicros: 1_000_000, postingDate: "2026-08-19",
      priceList: "BANG-GIA", documentCurrency: "VND", uom: "m2", partyType: "Customer",
      billableAreaSqm: 4.5,
    }),
    /does not exist for variant STANDARD/,
  );
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// KHOÁ ĐẶT TÊN
// ────────────────────────────────────────────────────────────────────────────────────────────

/** Lấy thẳng khoá đặt tên đang khai trong brief, không chép lại — chép lại là test tự nói với mình. */
const ITEM_PRICE_NAMING = JSON.parse(readSource("briefs/alumdoor-v2.json"))
  .doctypes.find((entry) => entry.name === "Item Price").naming;

const priceDocument = (overrides = {}) => ({
  price_list: "ALUMDOOR-SELLING", item_code: "PK-CONLAN", uom: "Cái",
  price_variant: "STANDARD", rate: 15000, currency: "VND", ...overrides,
});

test("khoá đặt tên Item Price có đúng năm đoạn và đoạn cuối là bậc", () => {
  assert.equal(ITEM_PRICE_NAMING, "format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}");
});

test("dòng giá KHÔNG bậc vẫn TẠO ĐƯỢC — nhờ sentinel, không nhờ ô rỗng", () => {
  /**
   * Đây là điểm gãy số 1, neo bằng chính nhân đặt tên chứ không mô tả lại.
   *
   * `resolveAutoname` (frappe-model/src/autoname.ts ~124) ném lỗi khi một khoá trong `format:`
   * rỗng. Bản chụp D1 `work/pricing-preimage.json` đếm được 558/558 dòng giá không có bậc — tức
   * để trống là TỪ CHỐI TẠO toàn bộ bảng giá đang chạy. Sentinel `MOI-DIEN-TICH` giữ khoá luôn
   * đủ năm đoạn.
   */
  assert.throws(
    () => resolveAutoname({
      doctype: "Item Price",
      pattern: ITEM_PRICE_NAMING,
      document: priceDocument({ area_tier: "" }),
      now: "2026-08-19T00:00:00.000Z",
    }),
    /area_tier is required/,
  );

  const plan = resolveAutoname({
    doctype: "Item Price",
    pattern: ITEM_PRICE_NAMING,
    document: priceDocument({ area_tier: ALL_AREA_TIER }),
    now: "2026-08-19T00:00:00.000Z",
  });
  assert.equal(plan.kind, "literal");
  assert.equal(plan.name, "ALUMDOOR-SELLING:PK-CONLAN:Cái:STANDARD:MOI-DIEN-TICH");
});

test("dòng giá có bậc lấy đúng mã bậc làm đoạn cuối của tên", () => {
  const plan = resolveAutoname({
    doctype: "Item Price",
    pattern: ITEM_PRICE_NAMING,
    document: priceDocument({ item_code: "TP-CUADL1LY XN-VK", uom: "m2", area_tier: "BAC-4-5" }),
    now: "2026-08-19T00:00:00.000Z",
  });
  assert.equal(plan.name, "ALUMDOOR-SELLING:TP-CUADL1LY XN-VK:m2:STANDARD:BAC-4-5");
});

test("một hằng số sentinel, ba nơi giữ bản sao — phải bằng nhau", () => {
  /**
   * Ba nơi buộc phải chép hằng số vì chúng không import được nhau: gói giá là TypeScript biên
   * dịch qua `tsc`, hai script kia là `.mjs` chạy thẳng bằng node. Lệch nhau MỘT ký tự thì
   * payload đặt tên một kiểu, đường tra giá hiểu một kiểu, và không chỗ nào báo lỗi cả.
   */
  assert.equal(ALL_AREA_TIER, "MOI-DIEN-TICH");
  assert.equal(PAYLOAD_ALL_AREA_TIER, ALL_AREA_TIER);
  assert.match(
    readSource("scripts/build-alumdoor-v2-brief.mjs"),
    new RegExp(`const ALL_AREA_TIER = "${ALL_AREA_TIER}"`),
  );
  assert.match(
    readSource("scripts/import-alumdoor-pricing-local.mjs"),
    new RegExp(`const ALL_AREA_TIER = "${ALL_AREA_TIER}"`),
  );
});

test("tên trong payload giá mang bậc — mặc định là sentinel, có bậc thì là mã bậc", () => {
  assert.equal(
    itemPriceName(ALUMDOOR_PRICE_LIST, "PK-CONLAN", "Cái"),
    "ALUMDOOR-SELLING:PK-CONLAN:Cái:STANDARD:MOI-DIEN-TICH",
  );
  assert.equal(
    itemPriceName(ALUMDOOR_PRICE_LIST, "TP-CUADL1LY XN-VK", "m2", "STANDARD", "BAC-4-5"),
    "ALUMDOOR-SELLING:TP-CUADL1LY XN-VK:m2:STANDARD:BAC-4-5",
  );
  // Tên payload phải trùng tên nền tảng tự sinh, nếu không thì importer TẠO MỚI thay vì cập nhật.
  const plan = resolveAutoname({
    doctype: "Item Price",
    pattern: ITEM_PRICE_NAMING,
    document: priceDocument({ item_code: "TP-CUADL1LY XN-VK", uom: "m2", area_tier: "BAC-4-5" }),
    now: "2026-08-19T00:00:00.000Z",
  });
  assert.equal(itemPriceName(ALUMDOOR_PRICE_LIST, "TP-CUADL1LY XN-VK", "m2", "STANDARD", "BAC-4-5"), plan.name);
});

test("importer coi area_tier là trường ĐƯỢC QUẢN LÝ", () => {
  /**
   * `diffs()` chỉ so những trường trong `MANAGED_FIELDS`. Thiếu `area_tier` ở đó thì đổi bậc của
   * một dòng giá cho ra 0 khác biệt ⇒ không PUT lại ⇒ `--expect-idempotent` báo "sạch" trong khi
   * D1 vẫn giữ bậc cũ. Bậc quyết định đơn giá, không phải ghi chú.
   */
  const source = readSource("scripts/import-alumdoor-pricing-local.mjs");
  const managed = /"Item Price":\s*\[([^\]]*)\]/.exec(source);
  assert.ok(managed, "không tìm thấy MANAGED_FIELDS[\"Item Price\"]");
  assert.match(managed[1], /"area_tier"/);
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// SENTINEL KHỚP MỌI DIỆN TÍCH
// ────────────────────────────────────────────────────────────────────────────────────────────

const FLAT_SENTINEL = [{
  name: "BANG-GIA:PK-CONLAN:Cái:STANDARD:MOI-DIEN-TICH",
  data: {
    price_list: "BANG-GIA", item_code: "PK-CONLAN", uom: "Cái", currency: "VND",
    rate: "15000", area_tier: ALL_AREA_TIER, disabled: 0,
  },
}];

const askFlat = (area) => resolveServerPrice(context(FLAT_SENTINEL), {
  itemCode: "PK-CONLAN", qtyMicros: 1_000_000, postingDate: "2026-08-19",
  priceList: "BANG-GIA", documentCurrency: "VND", uom: "Cái", partyType: "Customer",
  ...(area === undefined ? {} : { billableAreaSqm: area }),
});

test("bậc sentinel khớp MỌI diện tích, kể cả dòng bán không khai diện tích", async () => {
  /**
   * Nếu sentinel bị đối xử như một bậc thật thì `areaWithinTier` (không cận trên lẫn cận dưới ⇒
   * fail-closed) trả false và cả 558/558 dòng giá phẳng biến mất khỏi kết quả tra — phụ kiện,
   * motor, ray, tất cả. Đây là chốt chặn cho đúng chuyện đó.
   */
  assert.equal((await askFlat(undefined)).rate, "15000.00");
  assert.equal((await askFlat(0.5)).rate, "15000.00");
  assert.equal((await askFlat(4.5)).rate, "15000.00");
  assert.equal((await askFlat(120)).rate, "15000.00");
  assert.equal((await askFlat(4.5)).item_price, "BANG-GIA:PK-CONLAN:Cái:STANDARD:MOI-DIEN-TICH");
});

test("sentinel KHÔNG cần bản ghi danh mục để khớp — nó là cú pháp của tên, không phải một bậc", async () => {
  // Danh mục bậc rỗng hoàn toàn. Nếu đường tra giá đi hỏi `Bậc diện tích:MOI-DIEN-TICH` thì
  // một cú "ngừng dùng" nhầm — hoặc một lần seed thiếu — là chết toàn bộ bảng giá phẳng.
  const result = await resolveServerPrice(context(FLAT_SENTINEL, {}), {
    itemCode: "PK-CONLAN", qtyMicros: 1_000_000, postingDate: "2026-08-19",
    priceList: "BANG-GIA", documentCurrency: "VND", uom: "Cái", partyType: "Customer",
    billableAreaSqm: 4.5,
  });
  assert.equal(result.rate, "15000.00");
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// DÒNG CÓ BẬC CHỈ KHỚP ĐÚNG BẬC CỦA NÓ
// ────────────────────────────────────────────────────────────────────────────────────────────

test("dòng có bậc chỉ khớp đúng bậc — không bậc nào ôm trọn thang", async () => {
  /**
   * Bốn bậc trong `LADDER` phủ (3,4], (4,5], (5,6], (10,∞). Với mỗi diện tích chỉ ĐÚNG MỘT dòng
   * được khớp; khớp hai dòng thì `resolveServerPrice` ném "Multiple active Item Price records
   * match", còn khớp không dòng nào thì ném "does not exist" — cả hai đều bị bắt ở đây.
   */
  for (const [area, tier, rate] of [
    [3.01, "BAC-3-4", "590000.00"],
    [4, "BAC-3-4", "590000.00"],
    [4.99, "BAC-4-5", "580000.00"],
    [5, "BAC-4-5", "580000.00"],
    [6, "BAC-5-6", "570000.00"],
    [10.01, "BAC-TREN-10", "520000.00"],
    [999, "BAC-TREN-10", "520000.00"],
  ]) {
    const result = await ask(area);
    assert.equal(result.item_price, `BANG-GIA:CUA-DL-1LY:m2:STANDARD:${tier}`, `${area} m² phải rơi vào ${tier}`);
    assert.equal(result.rate, rate);
  }
});

test("diện tích nằm NGOÀI thang thì TỪ CHỐI, không bám vào bậc gần nhất", async () => {
  // Thang bắt đầu từ trên 3 m² và có lỗ hổng 6–10 m² trong bộ rút gọn này. Bám bậc gần nhất là
  // tự bịa giá; báo lỗi thì người bán biết bảng giá thiếu bậc.
  for (const area of [3, 2.5, 7.5]) {
    await assert.rejects(() => ask(area), /does not exist for variant STANDARD/, `${area} m² không được có giá`);
  }
});

test("đơn không khai diện tích KHÔNG ăn bậc đắt nhất, dù thang xếp theo thứ tự nào", async () => {
  /**
   * Điểm gãy cũ: đường dự phòng lấy `fieldMatches[0]`, nên kết quả phụ thuộc THỨ TỰ danh sách —
   * bậc 3-4 (590.000, đắt nhất) đứng đầu nên đơn không khai diện tích lặng lẽ ăn nó. Chạy cả hai
   * chiều xếp để chứng minh việc từ chối không phải nhờ may.
   */
  for (const rows of [LADDER, [...LADDER].reverse()]) {
    await assert.rejects(
      () => resolveServerPrice(context(rows), {
        itemCode: "CUA-DL-1LY", qtyMicros: 1_000_000, postingDate: "2026-08-19",
        priceList: "BANG-GIA", documentCurrency: "VND", uom: "m2", partyType: "Customer",
      }),
      /does not exist for variant STANDARD/,
    );
  }
});

test("thang bậc cộng thêm một dòng sentinel là HAI dòng cùng khớp — phải ném, không được chọn bừa", async () => {
  /**
   * Sentinel khớp mọi diện tích, dòng bậc khớp đúng bậc của nó — để cả hai cùng bật trên một mặt hàng
   * là mọi đơn rơi vào bậc đó có hai giá hợp lệ. Đây là cái bẫy của đợt gộp 88 mã: nếu payload
   * vừa giữ dòng phẳng của mã cũ vừa phát 8 dòng bậc cho mã mới thì nó chỉ lộ ra lúc bán.
   * `validate-alumdoor-pricing-payload.mjs` bắt trước bằng `item_price_flat_and_tiered_overlap`.
   */
  const mixed = [
    ...LADDER,
    {
      name: "BANG-GIA:CUA-DL-1LY:m2:STANDARD:MOI-DIEN-TICH",
      data: {
        price_list: "BANG-GIA", item_code: "CUA-DL-1LY", uom: "m2", currency: "VND",
        rate: "555000", area_tier: ALL_AREA_TIER, disabled: 0,
      },
    },
  ];
  await assert.rejects(() => ask(4.5, mixed), /Multiple active Item Price records match/);
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// DIỆN TÍCH PHẢI ĐI HẾT ĐƯỜNG TỪ DÒNG BÁN TỚI ĐƯỜNG TRA GIÁ
// ────────────────────────────────────────────────────────────────────────────────────────────

const commercialContext = (itemPrices) => ({
  ...context(itemPrices),
  reader: { ...context(itemPrices).reader, async getDocument() { return null; } },
});

const sellLine = (extra) => resolveCommercialLine(commercialContext(LADDER), {
  itemCode: "CUA-DL-1LY",
  priceList: "BANG-GIA",
  documentCurrency: "VND",
  postingDate: "2026-08-19",
  uom: "m2",
  pricedQty: 1,
  partyType: "Customer",
  customerGroup: "Đại lý",
  facts: {},
  ...extra,
});

test("resolveCommercialLine truyền diện tích của dòng bán xuống đường tra giá", async () => {
  /**
   * Điểm gãy số 2: `sharedPriceContext` dựng thiếu `billableAreaSqm` dù diện tích có sẵn ngay
   * trên nó. Hệ quả là `area_tier` khai được mà không bao giờ khớp — đúng trạng thái đo được:
   * 0/558 dòng giá trên D1 mang bậc, vì khai vào cũng vô dụng.
   */
  assert.equal((await sellLine({ areaSqm: 3.5, areaPerSetSqm: 3.5 })).base_rate, "590000.00");
  assert.equal((await sellLine({ areaSqm: 4.5, areaPerSetSqm: 4.5 })).base_rate, "580000.00");
  assert.equal((await sellLine({ areaSqm: 12, areaPerSetSqm: 12 })).base_rate, "520000.00");
  assert.equal(
    (await sellLine({ areaSqm: 4.5, areaPerSetSqm: 4.5 })).item_price,
    "BANG-GIA:CUA-DL-1LY:m2:STANDARD:BAC-4-5",
  );
});

test("dòng bán không khai diện tích thì resolveCommercialLine TỪ CHỐI, không lấy bậc bất kỳ", async () => {
  await assert.rejects(() => sellLine({}), /does not exist for variant STANDARD/);
});

test("BẬC TRA THEO MỘT BỘ: dòng nhiều bộ KHÔNG được tụt xuống bậc rẻ hơn", async () => {
  /**
   * Điểm gãy đắt nhất của đợt này, neo bằng đúng con số đo được trên dist trước khi vá.
   *
   * `billable_area_sqm` là diện tích CẢ DÒNG (`door-formulas.ts:369`:
   * `billable = max(rawArea, minimum) * sets`), còn cận bậc là của MỘT bộ (brief `Bậc diện tích`:
   * "Diện tích tối thiểu tính tiền cho một bộ"). Đưa nhầm số vào thì:
   *   2 bộ × 4,5 m² (billable 9,0)  → bậc 8-9,   580.000  thay vì bậc 4-5, 640.000
   *   3 bộ × 3,5 m² (billable 10,5) → bậc >10,   560.000  thay vì bậc 3-4, 660.000
   * Thang dưới đây dùng đúng giá của họ TP-TOLEKEM124_8D_MSK để con số trong test là tiền thật.
   */
  const ladder = [
    tierPrice("BAC-3-4", 660000),
    tierPrice("BAC-4-5", 640000),
    tierPrice("BAC-8-9", 580000),
    tierPrice("BAC-TREN-10", 560000),
  ];
  const line = (areaPerSetSqm, sets, qty) => resolveCommercialLine(commercialContext(ladder), {
    itemCode: "CUA-DL-1LY", priceList: "BANG-GIA", documentCurrency: "VND", postingDate: "2026-08-19",
    uom: "m2", pricedQty: qty, partyType: "Customer", customerGroup: "Đại lý", facts: {},
    areaSqm: qty, areaPerSetSqm, setCount: sets,
  });

  const one = await line(4.5, 1, 4.5);
  assert.equal(one.item_price, "BANG-GIA:CUA-DL-1LY:m2:STANDARD:BAC-4-5");
  assert.equal(one.gross_amount, "2880000.00");

  const two = await line(4.5, 2, 9);
  assert.equal(two.item_price, "BANG-GIA:CUA-DL-1LY:m2:STANDARD:BAC-4-5", "2 bộ 4,5 m² vẫn là bậc 4-5");
  assert.equal(two.base_rate, "640000.00");
  // 9,0 m² × 640.000. Trước khi vá là 9,0 × 580.000 = 5.220.000 — hụt 540.000đ/dòng.
  assert.equal(two.gross_amount, "5760000.00");

  const three = await line(3.5, 3, 10.5);
  assert.equal(three.item_price, "BANG-GIA:CUA-DL-1LY:m2:STANDARD:BAC-3-4", "3 bộ 3,5 m² vẫn là bậc 3-4");
  // 10,5 × 660.000. Trước khi vá là 10,5 × 560.000 = 5.880.000 — hụt 1.050.000đ/dòng.
  assert.equal(three.gross_amount, "6930000.00");
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// SUY DIỆN TÍCH MỘT BỘ TỪ DÒNG BÁN
// ────────────────────────────────────────────────────────────────────────────────────────────

test("areaTierBasisSqm: ưu tiên số đã khai, chỉ chia khi không có", () => {
  // Có `area_per_set_sqm` thì dùng thẳng, kể cả khi chia ra số khác (bộ nhỏ hơn mức tối thiểu
  // tính tiền: raw 3,2 nhưng billable/bộ 4,0).
  assert.equal(areaTierBasisSqm({ area_per_set_sqm: 3.2, billable_area_sqm: 8, set_count: 2 }), 3.2);
  // Không có thì chia — đây là đường của mọi dòng bán cũ chưa mang `area_per_set_sqm`.
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 9, set_count: 2 }), 4.5);
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 10.5, set_count: 3 }), 3.5);
  // Không khai số bộ = một bộ. Giữ nguyên hành vi của dòng phụ kiện/motor một bộ.
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 4.5 }), 4.5);
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 4.5, set_count: "" }), 4.5);
  // Không có diện tích thì không có bậc — fail-closed, không quy về 0.
  assert.equal(areaTierBasisSqm({}), undefined);
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 0 }), undefined);
  // Số bộ CÓ khai mà không đọc ra số dương là dữ liệu hỏng: thà mất giá còn hơn coi là một bộ.
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 9, set_count: "hai" }), undefined);
  assert.equal(areaTierBasisSqm({ billable_area_sqm: 9, set_count: 0 }), undefined);
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// CHỐT CHẶN LÚC LƯU: HAI DÒNG GIÁ KHÔNG ĐƯỢC CÙNG KHỚP MỘT KHOÁ
// ────────────────────────────────────────────────────────────────────────────────────────────

const priceRow = (name, overrides = {}) => ({
  name,
  data: {
    price_list: "ALUMDOOR-SELLING", item_code: "TP-CUADL6D", uom: "m2",
    price_variant: "STANDARD", currency: "VND", rate: "560000", disabled: 0, ...overrides,
  },
});

const guardReader = (rows) => ({
  async getMasterRecordData(_t, doctype, name) { return TIERS[`${doctype}:${name}`] ?? null; },
  async listMasterRecordData(_t, doctype) { return doctype === "Item Price" ? rows : []; },
});

const guard = (rows, candidate, name = "") =>
  assertItemPriceTierIsUnambiguous(guardReader(rows), "demo", candidate.data ?? candidate, name);

test("chặn dòng giá thứ hai khi tên cũ 4 đoạn và tên mới 5 đoạn cùng trỏ một mặt hàng", async () => {
  /**
   * Khoá đặt tên năm đoạn đã GỠ MẤT chốt trùng tên của nền tảng: trước đây dòng thứ hai sinh
   * đúng một tên nên `lifecycle.ts:10` ném 409, nay `…:STANDARD` và `…:STANDARD:MOI-DIEN-TICH`
   * là hai tên khác nhau nên cả hai cùng bật lọt vào D1. Đo trên dist: mọi lượt tra giá của mã
   * đó sau đấy đều ném "Multiple active Item Price records match", tức mã đó không bán được nữa.
   */
  const legacy = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD");
  const tiered = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:MOI-DIEN-TICH", { area_tier: ALL_AREA_TIER });
  await assert.rejects(() => guard([legacy], tiered), /trùng bậc/);
  // Dòng cũ ngừng dùng rồi thì không còn nhập nhằng — đúng lối "NGHỈ HƯU, KHÔNG XOÁ".
  await assert.doesNotReject(() => guard([priceRow(legacy.name, { disabled: 1 })], tiered));
  // Và chính nó lưu lại (sửa giá) thì không tự chặn mình.
  await assert.doesNotReject(() => guard([tiered], tiered, tiered.name));
});

test("chặn dòng phẳng MOI-DIEN-TICH đứng cạnh một dòng CÓ BẬC", async () => {
  // Đây là thao tác bình thường trên màn Danh mục: ô "Bậc diện tích" HIỆN trên form. Sentinel
  // khớp mọi diện tích nên nó chồng lên mọi bậc thật; để cả hai cùng bật là đơn 3,5 m² hỏng
  // còn đơn 6 m² vẫn chạy — hỏng chập chờn theo diện tích, khó lần nhất.
  const flat = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:MOI-DIEN-TICH", { area_tier: ALL_AREA_TIER });
  const tiered = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-3-4", { area_tier: "BAC-3-4", rate: "660000" });
  await assert.rejects(() => guard([flat], tiered), /trùng bậc/);
  await assert.rejects(() => guard([tiered], flat), /trùng bậc/);
});

test("hai bậc KHÔNG chồng nhau thì lưu được — thang 8 bậc phải dựng được", async () => {
  const rows = [
    priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-3-4", { area_tier: "BAC-3-4" }),
    priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-5-6", { area_tier: "BAC-5-6" }),
  ];
  // Bậc 4-5 nằm lọt giữa hai bậc đã có; cận trên ĐÓNG/cận dưới MỞ nên chạm mép không phải chồng.
  const middle = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-4-5", { area_tier: "BAC-4-5" });
  await assert.doesNotReject(() => guard(rows, middle));
  // Cùng một bậc hai lần thì chồng.
  await assert.rejects(() => guard([...rows, middle], middle, "TEN-KHAC"), /trùng bậc/);
});

test("khác mặt hàng / khác ĐVT / khác biến thể là khác khoá — không đụng nhau", async () => {
  const flat = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:MOI-DIEN-TICH", { area_tier: ALL_AREA_TIER });
  for (const other of [
    priceRow("X", { item_code: "TP-KHAC", area_tier: ALL_AREA_TIER }),
    priceRow("X", { uom: "Bộ", area_tier: ALL_AREA_TIER }),
    priceRow("X", { price_variant: "ALUMDOOR_MOTOR_NO_LAC", area_tier: ALL_AREA_TIER }),
    priceRow("X", { price_list: "BANG-GIA-KHAC", area_tier: ALL_AREA_TIER }),
  ]) await assert.doesNotReject(() => guard([other], flat));
});

test("bậc không đọc được cận thì coi như CHỒNG — fail-closed", async () => {
  /**
   * Bậc bị ngừng dùng, bị xoá khỏi danh mục, hoặc khai thiếu cả hai cận đều rơi vào đây. Không
   * chứng minh được là KHÔNG chồng thì phải từ chối: từ chối nhầm tốn một lần soát tay, cho qua
   * nhầm thì mã đó mất khả năng bán và chỉ lộ ra lúc đang lập đơn.
   */
  const known = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-3-4", { area_tier: "BAC-3-4" });
  const unknown = priceRow("ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-KHONG-CO", { area_tier: "BAC-KHONG-CO" });
  await assert.rejects(() => guard([known], unknown), /trùng bậc/);
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// TẠO DÒNG GIÁ QUA API MÀ KHÔNG KHAI BẬC
// ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lấy thẳng khai báo trường `area_tier` trong brief, không chép lại: giá trị `default` ở đó là
 * thứ đang được kiểm, chép sang test là test tự nói với mình.
 */
const AREA_TIER_FIELD = JSON.parse(readSource("briefs/alumdoor-v2.json"))
  .doctypes.find((entry) => entry.name === "Item Price")
  .fields.find((entry) => entry && typeof entry === "object" && entry.fieldname === "area_tier");

const ITEM_PRICE_META = {
  name: "Item Price", module: "Selling", revision: 1, is_single: false, is_submittable: false,
  autoname: ITEM_PRICE_NAMING,
  permissions: [],
  fields: [
    { fieldname: "price_list", label: "Bảng giá", fieldtype: "Link", options: "Price List", required: true },
    { fieldname: "item_code", label: "Mã hàng", fieldtype: "Link", options: "Item", required: true },
    { fieldname: "uom", label: "ĐVT", fieldtype: "Link", options: "UOM", required: true },
    { fieldname: "price_variant", label: "Biến thể", fieldtype: "Data", default: "STANDARD" },
    AREA_TIER_FIELD,
    { fieldname: "rate", label: "Đơn giá", fieldtype: "Currency", required: true },
    { fieldname: "currency", label: "Tiền tệ", fieldtype: "Link", options: "Currency" },
    { fieldname: "disabled", label: "Ngừng dùng", fieldtype: "Check" },
  ],
};

/** Bộ khung tối thiểu cho đúng đường `POST/PUT /api/resource/Item Price`. */
function routerHarness(seed = []) {
  const documents = new Map();
  for (const row of seed) documents.set(row.name, { tenant_id: "demo", doctype: "Item Price", name: row.name, owner: "kt@alumdoor", docstatus: 0, status: "Draft", version: 1, created_at: NOW, modified_at: NOW, data: row.data, children: [] });
  const context = {
    tenantId: "demo",
    actor: { user_id: "chuxuong@alumdoor", roles: ["Chủ xưởng"] },
    traceId: "test-trace",
    now: () => NOW,
    metadata: {
      async getDocType(_t, doctype) { return doctype === "Item Price" ? ITEM_PRICE_META : null; },
      async getWorkflow() { return null; },
      // Nhân đặt tên thật, không phải bản mô phỏng: đây chính là chỗ lỗi F2 nổ ra.
      async nextName(_t, doctype, pattern, now, document) {
        const plan = resolveAutoname({ doctype, pattern, document, now });
        if (plan.kind !== "literal") throw new Error(`Unexpected autoname plan ${plan.kind}`);
        return plan.name;
      },
    },
    permissions: {
      async assert() {},
      async redactDocumentWithPolicies(_t, _m, document) { return document; },
    },
    documents: {
      async getDocument(_t, doctype, name) { return doctype === "Item Price" ? documents.get(name) ?? null : null; },
      async getMasterRecordData(_t, doctype, name) {
        if (doctype === "Item Price") return documents.get(name)?.data ?? null;
        return TIERS[`${doctype}:${name}`] ?? null;
      },
      async listMasterRecordData(_t, doctype) {
        return doctype === "Item Price" ? [...documents.values()].map((row) => ({ name: row.name, data: row.data })) : [];
      },
    },
    access: { async getShare() { return null; } },
    async runCommand(command) {
      documents.set(command.aggregate.name, {
        tenant_id: "demo", doctype: command.aggregate.doctype, name: command.aggregate.name,
        owner: "chuxuong@alumdoor", docstatus: 0, status: "Draft", version: 1,
        created_at: NOW, modified_at: NOW, data: command.document, children: [],
      });
      return { command_id: command.command_id, version: 1 };
    },
  };
  const post = (body) => routeFrappeApi(
    new Request("http://local/api/resource/Item%20Price", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    new URL("http://local/api/resource/Item%20Price"),
    context,
  );
  return { post, documents };
}

const NOW = "2026-08-19T00:00:00.000Z";

test("tạo Item Price KHÔNG khai bậc vẫn ra tên năm đoạn — default phải tới được nhân đặt tên", async () => {
  /**
   * Điểm gãy F2, neo bằng đúng đường mà chủ xưởng đi: màn Danh mục → Đơn giá theo bảng giá →
   * thêm dòng, điền bảng giá/mã/ĐVT/đơn giá, KHÔNG chạm ô "Bậc diện tích".
   *
   * Trước bản vá: `createDocument` áp default vào `payload` nhưng gọi `resolveNewName` bằng
   * `submitted` (thân yêu cầu thô), nên lượt tạo này ném "area_tier is required because it
   * appears in the Item Price naming format" — mà `default` trong brief lại làm người đọc tin
   * là đã lo xong. Đường importer không dính vì payload luôn tự phát `area_tier` (558/558).
   */
  const { post, documents } = routerHarness();
  const response = await post({
    price_list: "ALUMDOOR-SELLING", item_code: "JG_BODK", uom: "Cái", rate: 15000, currency: "VND",
  });
  assert.equal(response.status, 201, await response.clone().text());
  const body = await response.json();
  assert.equal(body.data.name, "ALUMDOOR-SELLING:JG_BODK:Cái:STANDARD:MOI-DIEN-TICH");
  // Và giá trị phải nằm THẬT trên bản ghi, không chỉ trong tên.
  assert.equal(documents.get(body.data.name).data.area_tier, ALL_AREA_TIER);
});

test("tạo Item Price CÓ khai bậc thì tên mang đúng mã bậc đó", async () => {
  const { post } = routerHarness();
  const response = await post({
    price_list: "ALUMDOOR-SELLING", item_code: "TP-CUADL6D", uom: "m2", rate: 660000,
    currency: "VND", area_tier: "BAC-3-4",
  });
  assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await response.json()).data.name, "ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:BAC-3-4");
});

test("API TỪ CHỐI dòng giá thứ hai chồng bậc, thay vì để nó nổ lúc lập đơn", async () => {
  // Cùng một thao tác Danh mục, nhưng mã hàng đã có một dòng giá phẳng dưới TÊN CŨ bốn đoạn.
  const { post } = routerHarness([{
    name: "ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD",
    data: { price_list: "ALUMDOOR-SELLING", item_code: "TP-CUADL6D", uom: "m2", price_variant: "STANDARD", currency: "VND", rate: "560000", disabled: 0 },
  }]);
  const response = await post({
    price_list: "ALUMDOOR-SELLING", item_code: "TP-CUADL6D", uom: "m2", rate: 570000, currency: "VND",
  });
  assert.equal(response.ok, false, "lượt tạo phải bị từ chối");
  assert.match(JSON.stringify(await response.json()), /trùng bậc/);
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// HOÁ ĐƠN BÁN KHÔNG LẬP TỪ ĐƠN
// ────────────────────────────────────────────────────────────────────────────────────────────

test("hoá đơn bán KHÔNG lập từ đơn vẫn tra được giá theo bậc", async () => {
  /**
   * Điểm gãy F5: diện tích mới chỉ được nối vào 1 trong 4 chỗ gọi `resolveServerPrice`.
   * `applySellingPricing` (`clouderp-selling/src/controllers.ts` ~1017) là đường tra giá của
   * `SalesInvoiceController` khi hoá đơn KHÔNG khai `against_sales_order` — hoá đơn lập từ đơn
   * thì đóng băng dòng của đơn nên không đi qua đây.
   *
   * `priceTierMatches` fail-closed khi thiếu diện tích, nên trước bản vá: ngay khi mặt hàng đầu
   * tiên có dòng giá theo bậc, báo giá và đơn hàng vẫn ra giá bình thường còn hoá đơn bán lẻ
   * cùng mặt hàng đó ném "Item Price … does not exist for variant STANDARD".
   */
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-0001", currency: "VND", items: [],
    warehouses: ["Stores"], accounts: ["Debtors", "Sales", "Output Tax"],
  });
  store.seedMaster("Item", "CUA-DL-1LY", "demo", { stock_uom: "m2", default_sales_uom: "m2" });
  store.seedMaster("Price List", "BANG-GIA", "demo", { currency: "VND", selling: 1 });
  for (const [code, tier] of Object.entries(TIERS)) store.seedMaster("Bậc diện tích", code.split(":")[1], "demo", tier);
  for (const row of LADDER) store.seedMaster("Item Price", row.name, "demo", row.data);

  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, undefined, () => NOW);
  await mutate(kernel, {
    commandId: "si-area-tier", doctype: "Sales Invoice", name: "SI-AREA-TIER",
    action: "create", expectedVersion: null,
    document: {
      customer: "CUST-0001", company: "Demo", currency: "VND", currency_scale: 2, posting_at: NOW,
      selling_price_list: "BANG-GIA", debit_to: "Debtors", default_income_account: "Sales",
      // 2 bộ × 4,5 m² = 9,0 m² cả dòng. Bậc phải đọc theo MỘT bộ, tức bậc 4-5.
      items: [{
        row_id: "SII-1", item_code: "CUA-DL-1LY", uom: "m2", qty: "9", rate: "0",
        income_account: "Sales", billable_area_sqm: 9, area_per_set_sqm: 4.5, set_count: 2,
      }],
      taxes: [],
    },
  });
  const invoice = await store.getDocument("demo", "Sales Invoice", "SI-AREA-TIER");
  assert.equal(invoice.data.items[0].item_price, "BANG-GIA:CUA-DL-1LY:m2:STANDARD:BAC-4-5");
  assert.equal(invoice.data.items[0].rate, "580000.00");
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// ĐƯỜNG ỐNG GIÁ PHẢI CHẠY ĐƯỢC, KHÔNG DỪNG Ở TIỀN KIỂM
// ────────────────────────────────────────────────────────────────────────────────────────────

/** Bản chụp D1 thật, không phải dữ liệu bịa: `work/pricing-preimage.json`, chụp 2026-08-19. */
const PREIMAGE = JSON.parse(readFileSync(resolve(SERVER_ROOT, "..", "work", "pricing-preimage.json"), "utf8"));
const PREIMAGE_PRICES = PREIMAGE.records.item_prices;

test("bản chụp D1 vẫn là 558/558 dòng giá tên BỐN đoạn — con số mà mọi kết luận dưới đây dựa vào", () => {
  assert.equal(PREIMAGE.managed_price_list, ALUMDOOR_PRICE_LIST);
  assert.equal(PREIMAGE_PRICES.length, 558);
  assert.equal(PREIMAGE_PRICES.filter((row) => row.name.split(":").length === 4).length, 558);
  assert.equal(PREIMAGE_PRICES.filter((row) => row.doc?.area_tier).length, 0);
});

test("payload năm đoạn KHÔNG biến 558 dòng đang chạy thành 558 dòng thừa", () => {
  /**
   * Điểm gãy F3: nếu lệch tên bị xếp là "dòng thừa" thì `import-alumdoor-pricing-local.mjs` ném
   * `ALUMDOOR_PRICING_PREFLIGHT_BLOCKED count=558; zero writes performed`, mà
   * `scripts/local-runner/pricing-adapter.mjs` gọi chính script đó BÊN TRONG `preflightPricing`
   * ⇒ adapter `pricing` trả `failureClass=DATA` ⇒ EXECUTION_STATUS=DATA_BLOCKED. Giá cũ vẫn bán
   * được, nhưng mọi thay đổi giá từ nguồn đứng lại vô thời hạn.
   *
   * Tên chuẩn dựng lại bằng chính `itemPriceName()` của payload trên đúng các trường mà D1 đang
   * giữ — không chép tay danh sách tên.
   */
  const expectedNames = PREIMAGE_PRICES.map((row) => itemPriceName(
    row.doc.price_list, row.doc.item_code, row.doc.uom, row.doc.price_variant,
  ));
  assert.equal(new Set(expectedNames).size, 558, "tên chuẩn phải vẫn duy nhất");
  assert.equal(expectedNames.filter((name) => name.split(":").length === 5).length, 558);

  const { alias, blockers } = classifyManagedItemPriceNames({
    existingNames: PREIMAGE_PRICES.map((row) => row.name),
    expectedNames,
    allAreaTier: ALL_AREA_TIER,
  });
  assert.deepEqual(blockers, [], "0 blocker — adapter pricing phải chạy tiếp");
  assert.equal(alias.size, 558, "cả 558 dòng phải ghép được về tên đang có trên D1");
  // Ghép đúng dòng, không phải ghép bừa cho đủ số.
  const sample = "ALUMDOOR-SELLING:JG_BODK:Cái:STANDARD";
  assert.equal(alias.get(`${sample}:${ALL_AREA_TIER}`), sample);
});

test("dòng giá thừa thật vẫn bị chặn, và trùng hai tên cũng bị chặn", () => {
  // Bí danh không được nới tay: một dòng payload không còn phát ra nữa vẫn phải bị báo.
  const orphan = classifyManagedItemPriceNames({
    existingNames: ["ALUMDOOR-SELLING:MA-DA-BO:Cái:STANDARD"],
    expectedNames: [],
    allAreaTier: ALL_AREA_TIER,
  });
  assert.deepEqual(orphan.blockers, [{ type: "extra_managed_item_price", name: "ALUMDOOR-SELLING:MA-DA-BO:Cái:STANDARD" }]);

  // Cùng danh tính dưới HAI tên là nhập nhằng thật — đúng cái mà `resolveServerPrice` sẽ ném
  // "Multiple active Item Price records match". Ghi đè im lặng thì mã đó mất khả năng bán.
  const legacy = "ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD";
  const both = classifyManagedItemPriceNames({
    existingNames: [legacy, `${legacy}:${ALL_AREA_TIER}`],
    expectedNames: [`${legacy}:${ALL_AREA_TIER}`],
    allAreaTier: ALL_AREA_TIER,
  });
  assert.equal(both.alias.size, 0);
  assert.deepEqual(both.blockers, [{
    type: "item_price_duplicate_legacy_and_tiered_name",
    name: legacy,
    tiered_name: `${legacy}:${ALL_AREA_TIER}`,
  }]);
});

test("dòng giá đã mang tên năm đoạn thì không cần bí danh", () => {
  const canonical = `ALUMDOOR-SELLING:TP-CUADL6D:m2:STANDARD:${ALL_AREA_TIER}`;
  const { alias, blockers } = classifyManagedItemPriceNames({
    existingNames: [canonical], expectedNames: [canonical], allAreaTier: ALL_AREA_TIER,
  });
  assert.equal(alias.size, 0);
  assert.deepEqual(blockers, []);
});
