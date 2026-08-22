import test from "node:test";
import assert from "node:assert/strict";
import { resolveCommercialLine } from "../dist/packages/clouderp-selling/src/commercial-line-resolver.js";

function context() {
  const itemPrices = [
    { name: "RETAIL:DOOR-1:m2", data: { price_list: "RETAIL", item_code: "DOOR-1", uom: "m2", currency: "VND", rate: 1_626_000, disabled: 0 } },
    { name: "RETAIL:DOOR-1:m2:WITH_RAIL", data: { price_list: "RETAIL", item_code: "DOOR-1", uom: "m2", price_variant: "WITH_RAIL", currency: "VND", rate: 1_701_000, disabled: 0 } },
  ];
  const rules = [{ name: "DISC-15", data: { price_list: "RETAIL", item_code: "DOOR-1", discount_percentage: 15, priority: 10 } }];
  return { command: { tenant_id: "demo" }, reader: {
    async getMasterRecordData(_tenant, doctype, name) {
      if (doctype === "Currency" && name === "VND") return { currency_scale: 0 };
      if (doctype === "Item Price") return itemPrices.find((row) => row.name === name)?.data ?? null;
      return null;
    },
    async listMasterRecordData(_tenant, doctype) {
      if (doctype === "Item Price") return itemPrices;
      if (doctype === "Pricing Rule") return rules;
      return [];
    },
    async getDocument() { return null; },
  }};
}

test("WITH_RAIL may sell at its own rate while discount basis remains STANDARD", async () => {
  const line = await resolveCommercialLine(context(), {
    itemCode: "DOOR-1",
    priceList: "RETAIL",
    documentCurrency: "VND",
    postingDate: "2026-08-11",
    uom: "m2",
    priceVariant: "WITH_RAIL",
    discountBasisVariant: "STANDARD",
    pricedQty: 10,
    partyType: "Customer",
    party: "KH-1",
    customerGroup: "Lẻ",
    facts: {},
  });
  assert.equal(line.price_variant, "WITH_RAIL");
  assert.equal(line.selling_rate_minor, 1_701_000);
  assert.equal(line.discount_basis_variant, "STANDARD");
  assert.equal(line.discount_basis_rate_minor, 1_626_000);
  assert.equal(line.gross_amount_minor, 17_010_000);
  assert.equal(line.discount_amount_minor, 2_439_000);
  assert.equal(line.net_before_tax_minor, 14_571_000);
});

/**
 * Mặt hàng KHÔNG có dòng giá STANDARD thì để trống mã giá vẫn phải bán được.
 *
 * Trước 23/08/2026, ô trống bị hoá thành "STANDARD" ngay ở `commercial-line-resolver`, nên mọi
 * đường không tự chọn mã giá — Báo giá, và mọi form chung — đều chết với "Item Price … does not
 * exist for variant STANDARD". Đo trên tenant thật: bảng giá cửa đã bỏ hết dòng STANDARD, nên
 * KHÔNG cánh cửa nào lập nổi báo giá. Đơn hàng thoát nạn chỉ vì màn của nó tự điền mã giá.
 */
function contextMotMaGia() {
  const itemPrices = [
    { name: "RETAIL:DOOR-2:m2:TRON_BO:DT-3-4M2", data: { price_list: "RETAIL", item_code: "DOOR-2", uom: "m2", price_variant: "TRON_BO", area_tier: "DT-3-4M2", currency: "VND", rate: 590_000, disabled: 0 } },
    { name: "RETAIL:DOOR-2:m2:TRON_BO:DT-8-9M2", data: { price_list: "RETAIL", item_code: "DOOR-2", uom: "m2", price_variant: "TRON_BO", area_tier: "DT-8-9M2", currency: "VND", rate: 540_000, disabled: 0 } },
    // Cách bán đã NGỪNG DÙNG không được tính là "cách bán còn lại".
    { name: "RETAIL:DOOR-2:m2:TACH_MON", data: { price_list: "RETAIL", item_code: "DOOR-2", uom: "m2", price_variant: "TACH_MON", currency: "VND", rate: 480_000, disabled: 1 } },
  ];
  const tiers = [
    { name: "DT-3-4M2", data: { min_area_sqm: 3, max_area_sqm: 4 } },
    { name: "DT-8-9M2", data: { min_area_sqm: 8, max_area_sqm: 9 } },
  ];
  return { command: { tenant_id: "demo" }, reader: {
    async getMasterRecordData(_tenant, doctype, name) {
      if (doctype === "Currency" && name === "VND") return { currency_scale: 0 };
      if (doctype === "Item Price") return itemPrices.find((row) => row.name === name)?.data ?? null;
      if (doctype === "Bậc diện tích") return tiers.find((row) => row.name === name)?.data ?? null;
      return null;
    },
    async listMasterRecordData(_tenant, doctype) {
      if (doctype === "Item Price") return itemPrices;
      if (doctype === "Bậc diện tích") return tiers;
      return [];
    },
    async getDocument() { return null; },
  }};
}

test("bỏ trống mã giá thì suy ra cách bán DUY NHẤT đang bật, không rơi về STANDARD", async () => {
  const line = await resolveCommercialLine(contextMotMaGia(), {
    itemCode: "DOOR-2",
    priceList: "RETAIL",
    documentCurrency: "VND",
    postingDate: "2026-08-23",
    uom: "m2",
    pricedQty: 9,
    areaPerSetSqm: 9,
    partyType: "Customer",
    party: "KH-1",
    facts: {},
  });
  assert.equal(line.price_variant, "TRON_BO");
  assert.equal(line.base_rate_minor, 540_000, "phải tra đúng bậc 8-9 m², không lấy bậc đầu danh sách");
  // Gốc chiết khấu không khai thì bám theo chính dòng giá vừa tra, không quay về STANDARD.
  assert.equal(line.discount_basis_variant, "TRON_BO");
});

test("hai cách bán cùng bật mà không chọn thì TỪ CHỐI, không đoán hộ giá nào", async () => {
  const ctx = contextMotMaGia();
  const goc = ctx.reader.listMasterRecordData;
  ctx.reader.listMasterRecordData = async (tenant, doctype) => {
    const rows = await goc(tenant, doctype);
    // Bật lại dòng TACH_MON: nay mặt hàng có HAI cách bán khác giá.
    return doctype === "Item Price" ? rows.map((row) => ({ ...row, data: { ...row.data, disabled: 0 } })) : rows;
  };
  await assert.rejects(
    () => resolveCommercialLine(ctx, {
      itemCode: "DOOR-2", priceList: "RETAIL", documentCurrency: "VND", postingDate: "2026-08-23",
      uom: "m2", pricedQty: 9, areaPerSetSqm: 9, partyType: "Customer", party: "KH-1", facts: {},
    }),
    /STANDARD/,
    "chọn hộ người bán giữa hai giá là đoán tiền của khách — phải để lỗi nổ",
  );
});
