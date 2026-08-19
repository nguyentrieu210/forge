import test from "node:test";
import assert from "node:assert/strict";
import { resolveServerPrice } from "../dist/packages/clouderp-pricing/src/index.js";

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
