/**
 * Neo QUYẾT ĐỊNH CỦA CHỦ XƯỞNG 2026-08-20: **lấy giá có mộc**.
 *
 * `BANG-GIA-CHINH-THUC-31-07-2026 §3` thắng `ĐM.md` khi hai bên nói khác nhau về giá. Bộ test
 * này khoá cả quyết định lẫn PHẠM VI của nó — đè đúng 4 ô, không đè lan sang 84 ô còn lại.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applySealedPriceAuthority,
  loadSealedTierTable,
  parseSealedTierTable,
  sealedRateFor,
  stripTierSuffix,
  tierCodeFromItemCode,
  verifySealedMapping,
  SEALED_PRICE_SOURCE,
  __testing,
} from "../scripts/lib/alumdoor-sealed-price-authority.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PREIMAGE = resolve(REPO_ROOT, "work/pricing-preimage.json");

let cached = null;
async function realTable() {
  if (!cached) cached = await loadSealedTierTable(REPO_ROOT);
  return cached;
}

/** Giá ĐANG chạy trên D1, gom theo mã gốc → bậc. */
async function observedFromD1() {
  const snapshot = JSON.parse(await readFile(PREIMAGE, "utf8"));
  const observed = new Map();
  for (const row of snapshot.records.item_prices) {
    if (!row.name.includes("STANDARD")) continue;
    const match = row.name.match(/:(TP-[^:]+):/u);
    if (!match) continue;
    const tier = tierCodeFromItemCode(match[1]);
    if (!tier) continue;
    const base = stripTierSuffix(match[1]);
    if (!observed.has(base)) observed.set(base, new Map());
    observed.get(base).set(tier, Number(row.doc.rate));
  }
  return observed;
}

/* ───────────────────────── Đọc bảng có mộc ───────────────────────── */

test("bảng §3 đọc ra đúng 7 cột × 8 bậc, không nuốt bảng §4..§6", async () => {
  const table = await realTable();
  assert.deepEqual(table.columns, ["6D", "7D", "8D", "1LY", "8 DEM STĐ", "1LY STĐ", "1.2LY STĐ"]);
  for (const column of table.columns) {
    assert.equal(table.byColumn.get(column).size, 8, `cột ${column} phải đủ 8 bậc`);
  }
});

test("bảng xếp NGƯỢC nhưng đọc ra đúng bậc — lệch một dòng là sai giá cả bảng", async () => {
  const table = await realTable();
  const col = table.byColumn.get("1LY STĐ");
  // Dòng ĐẦU của bảng là "Trên 10m²" (rẻ nhất), dòng CUỐI là "3m²–4m²" (đắt nhất).
  assert.equal(col.get("BAC-TREN-10"), 560_000);
  assert.equal(col.get("BAC-3-4"), 630_000);
  assert.ok(col.get("BAC-3-4") > col.get("BAC-TREN-10"), "diện tích nhỏ thì đơn giá CAO hơn");
});

test("bảng đổi hình dạng thì CHẾT, không đọc lệch", () => {
  // Bảng hẹp hơn 8 cột không bao giờ được nhận làm tiêu đề → chết vì "không đọc được dòng tiêu đề".
  assert.throws(() => parseSealedTierTable("## 3. X\n\n| Khu vực | 6D |\n|---|---|\n| a | 1 |"),
    /không đọc được dòng tiêu đề/u);
  // Đủ 8 cột nhưng cột đầu không phải "Diện tích" → chết vì đúng lý do đó, không đọc lệch.
  assert.throws(
    () => parseSealedTierTable(
      "## 3. X\n\n| Khu vực | A | B | C | D | E | F | G |\n" +
      "|---|---|---|---|---|---|---|---|\n| 3m²–4m² | 1 | 2 | 3 | 4 | 5 | 6 | 7 |\n",
    ),
    /cột đầu phải là "Diện tích"/u,
  );
  assert.throws(
    () => parseSealedTierTable(
      "## 3. X\n\n| Diện tích | A | B | C | D | E | F | G |\n" +
      "|---|---|---|---|---|---|---|---|\n| 3m²–4m² | 1 | 2 | 3 | 4 | 5 | 6 | 7 |\n",
    ),
    /đọc được 1 bậc, chờ 8/u,
    "thiếu bậc phải chết, không im lặng nạp bảng cụt",
  );
});

/* ──────────────── Ánh xạ mã→cột: theo GIÁ và TÊN, không theo token trong mã ──────────────── */

test("token độ dày trong MÃ sai một nấc ở ba họ MSK — ánh xạ vẫn đúng", async () => {
  const table = await realTable();
  // Mã nói `6D`, nhưng tên hàng là "STĐ MSK 8D" và giá khớp cột "8 DEM STĐ".
  assert.equal(sealedRateFor(table, "TP-TOLEKEM124_6D_TRONBO_3-4m²_MSK", "BAC-3-4"), 570_000);
  // Mã nói `1LY`, tên hàng là "STĐ MSK 1.2LY", giá khớp cột "1.2LY STĐ".
  assert.equal(sealedRateFor(table, "TP-TOLEKEM124_1LY_TRONBO_3-4m²_MSK", "BAC-3-4"), 690_000);
  // Mã nói `8D`, tên hàng là "STĐ MSK 1LY", giá đúng phải là cột "1LY STĐ".
  assert.equal(sealedRateFor(table, "TP-TOLEKEM124_8D_TRONBO_3-4m²_MSK", "BAC-3-4"), 630_000);

  for (const code of ["TP-TOLEKEM124_6D", "TP-TOLEKEM124_8D", "TP-TOLEKEM124_1LY"]) {
    assert.equal(__testing.CODE_TO_COLUMN.get(code).code_thickness_mismatch, true, code);
  }
});

test("mã không thuộc bảng §3 thì KHÔNG bị đụng tới", async () => {
  const table = await realTable();
  assert.equal(sealedRateFor(table, "NVL-CHNHUA", "BAC-3-4"), null);
  assert.equal(sealedRateFor(table, "TP-CUADL6D XN-VK", null), null, "không có bậc thì không có giá bậc");
});

test("bỏ hậu tố bậc và đọc bậc từ mã", () => {
  assert.equal(stripTierSuffix("TP-CUADL6D XN-VK_TRONBO_4-5m²"), "TP-CUADL6D XN-VK");
  assert.equal(stripTierSuffix("TP-TOLEKEM124_8D_TRONBO>10m²_MSK"), "TP-TOLEKEM124_8D");
  assert.equal(tierCodeFromItemCode("TP-CUADL6D XN-VK_TRONBO_4-5m²"), "BAC-4-5");
  assert.equal(tierCodeFromItemCode("TP-TOLEKEM124_8D_TRONBO>10m²_MSK"), "BAC-TREN-10");
  assert.equal(tierCodeFromItemCode("TP-CUADL6D XN-VK"), null, "mã không nhồi bậc trả null");
});

test("cổng ánh xạ: 11 mã, 10 khớp 8/8, cột nhì luôn 0/8", async () => {
  const table = await realTable();
  const report = verifySealedMapping(table, await observedFromD1());
  assert.equal(report.length, 11);
  const perfect = report.filter((row) => row.matched === 8);
  assert.equal(perfect.length, 10);
  const partial = report.filter((row) => row.matched !== 8);
  assert.deepEqual(partial, [
    { item_code: "TP-TOLEKEM124_8D", column: "1LY STĐ", matched: 4, of: 8 },
  ]);
});

test("ánh xạ trôi sang cột khác thì CHẾT, không gán giá cột khác", async () => {
  const table = await realTable();
  // Bịa một mã mang nguyên thang giá của cột "6D" nhưng khai là "TP-TOLEKEM124_1LY" (1.2LY STĐ).
  const wrong = new Map([["TP-TOLEKEM124_1LY", new Map(table.byColumn.get("6D"))]]);
  assert.throws(() => verifySealedMapping(table, wrong), /Ánh xạ giá có mộc lệch/u);
});

/* ───────────────────── Phạm vi đè: đúng 4 ô, không lan ───────────────────── */

test("QUYẾT ĐỊNH: 88 dòng phủ, 84 khớp sẵn, ĐÚNG 4 dòng bị đè", async () => {
  const table = await realTable();
  const rows = [];
  for (const [code, tiers] of await observedFromD1()) {
    for (const [tier, rate] of tiers) rows.push({ item_code: code, price_variant: "STANDARD", area_tier: tier, rate });
  }

  const result = applySealedPriceAuthority(rows, table);
  assert.equal(result.report.applied, true);
  assert.equal(result.report.covered_row_count, 88, "11 mã × 8 bậc");
  assert.equal(result.report.confirmed_count, 84, "84 ô ĐM.md vốn đã khớp bảng có mộc");
  assert.equal(result.report.override_count, 4, "chỉ 4 ô lệch — không có thiệt hại phụ");

  assert.deepEqual(
    result.report.overrides.map((row) => `${row.item_code}:${row.area_tier}:${row.rate_from_dm}→${row.rate_sealed}`),
    [
      "TP-TOLEKEM124_8D:BAC-3-4:660000→630000",
      "TP-TOLEKEM124_8D:BAC-4-5:640000→620000",
      "TP-TOLEKEM124_8D:BAC-5-6:620000→610000",
      "TP-TOLEKEM124_8D:BAC-6-7:610000→600000",
    ],
  );
  // Bốn bậc RẺ của chính mã đó vốn đã khớp — nếu chúng lọt vào rổ đè là ánh xạ sai cột.
  for (const tier of ["BAC-7-8", "BAC-8-9", "BAC-9-10", "BAC-TREN-10"]) {
    assert.equal(result.report.overrides.some((row) => row.area_tier === tier), false, tier);
  }
});

test("dòng BIẾN THỂ không bị đè — phụ thu kéo tay không bị xoá", async () => {
  /**
   * Đo trên payload thật: 105 dòng có bậc, 17 trong đó là `ALUMDOOR_HAND_PULL_CONVERSION`.
   * Hôm nay chúng mang ĐÚNG giá gốc nên đè vào không đổi gì — nhưng bảng có mộc ghi *"cửa cuốn
   * lò xo kéo tay +20.000đ/m²"*, tức dòng kéo tay LẼ RA là gốc + 20.000. Ngày ai đó nạp đúng
   * con số đó, thẩm quyền sẽ lặng lẽ kéo về giá gốc và xoá mất phụ thu.
   */
  const table = await realTable();
  const result = applySealedPriceAuthority(
    [
      { item_code: "TP-TOLEKEM124_8D_TRONBO_3-4m²_MSK", price_variant: "STANDARD", area_tier: "", rate: 660_000 },
      { item_code: "TP-TOLEKEM124_8D_TRONBO_3-4m²_MSK", price_variant: "ALUMDOOR_HAND_PULL_CONVERSION", area_tier: "", rate: 650_000 },
    ],
    table,
  );
  assert.equal(result.report.override_count, 1, "chỉ dòng chuẩn bị đè");
  assert.equal(result.report.skipped_variant_count, 1);
  assert.equal(result.item_prices[0].rate, 630_000, "dòng chuẩn nhận giá có mộc");
  assert.equal(result.item_prices[1].rate, 650_000, "dòng kéo tay GIỮ NGUYÊN, kể cả khi khác giá gốc");
});

test("bậc đọc được từ MÃ khi area_tier chưa dùng — quyết định có hiệu lực NGAY", async () => {
  /**
   * `area_tier` là đích, nhưng tới 2026-08-20 nó là 0/558: bậc đang nhồi trong MÃ HÀNG và đường
   * ống phát sentinel `MOI-DIEN-TICH`. Chỉ đọc `area_tier` thì thẩm quyền phủ 0 dòng — quyết
   * định "lấy giá có mộc" không có hiệu lực nào cho tới khi gộp xong 88 mã.
   */
  const table = await realTable();
  const result = applySealedPriceAuthority(
    [{ item_code: "TP-TOLEKEM124_8D_TRONBO_3-4m²_MSK", price_variant: "STANDARD", area_tier: "MOI-DIEN-TICH", rate: 660_000 }],
    table,
  );
  assert.equal(result.report.override_count, 1);
  assert.equal(result.report.overrides[0].tier_from, "item_code");
  assert.equal(result.item_prices[0].rate, 630_000);

  // Khi bậc đã nằm ở `area_tier` thì lấy từ đó, không suy từ mã nữa.
  const merged = applySealedPriceAuthority(
    [{ item_code: "TP-TOLEKEM124_8D", price_variant: "STANDARD", area_tier: "BAC-3-4", rate: 660_000 }],
    table,
  );
  assert.equal(merged.report.overrides[0].tier_from, "area_tier");
  assert.equal(merged.item_prices[0].rate, 630_000);
});

test("mỗi lần đè để lại vết đủ để giải thích lại sau ba tháng", async () => {
  const table = await realTable();
  const result = applySealedPriceAuthority(
    [{ item_code: "TP-TOLEKEM124_8D", area_tier: "BAC-3-4", rate: 660_000, name: "X" }],
    table,
  );
  const [override] = result.report.overrides;
  assert.equal(override.rate_from_dm, 660_000);
  assert.equal(override.rate_sealed, 630_000);
  assert.equal(override.delta, -30_000);
  assert.equal(override.column, "1LY STĐ");
  assert.equal(override.authority, SEALED_PRICE_SOURCE);
  // Dòng giá tự mang theo dấu vết, không chỉ nằm trong báo cáo rời.
  assert.deepEqual(result.item_prices[0]._price_authority, {
    source: SEALED_PRICE_SOURCE,
    replaced_rate: 660_000,
  });
});

test("không có bảng có mộc thì giá GIỮ NGUYÊN, và nói rõ là không áp", () => {
  const rows = [{ item_code: "TP-TOLEKEM124_8D", area_tier: "BAC-3-4", rate: 660_000 }];
  const result = applySealedPriceAuthority(rows, null);
  assert.equal(result.report.applied, false);
  assert.equal(result.report.reason, "no-sealed-source");
  assert.equal(result.item_prices[0].rate, 660_000, "không im lặng đổi giá khi thiếu thẩm quyền");
});

/* ───────────────────── Phạm vi: KHÔNG đụng phụ thu ───────────────────── */

test("phụ thu KHÔNG lọt vào bảng giá gốc", async () => {
  const table = await realTable();
  /**
   * §3 có ba dòng phụ thu ngay dưới bảng: kéo tay +20.000/m², ngang 6m–7m5 +40.000/m²,
   * 7m5–9m +60.000/m². Chúng là SỬA GIÁ, không phải GIÁ — chỗ của chúng là `Pricing Rule`
   * với `adjustment_basis = AREA_SQM`. Lọt vào đây là biến ba luật điều chỉnh thành ba dòng
   * giá gốc không có mặt hàng nào.
   */
  const everyRate = table.columns.flatMap((column) => [...table.byColumn.get(column).values()]);
  for (const surcharge of [20_000, 40_000, 60_000]) {
    assert.equal(everyRate.includes(surcharge), false, `${surcharge} là phụ thu, không phải giá gốc`);
  }
  assert.equal(Math.min(...everyRate), 380_000, "giá gốc rẻ nhất của bảng là 380.000");
});
