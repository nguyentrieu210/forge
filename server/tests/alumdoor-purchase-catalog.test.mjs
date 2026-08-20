import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  indexDanhMucPurchaseRows,
  indexAluminiumWeights,
  loadPurchaseCatalog,
  applyPurchaseCatalog,
  __testing,
} from "../scripts/lib/alumdoor-purchase-catalog.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { normalizeName } = __testing;

const item = (over = {}) => ({
  doctype: "Item",
  item_code: "NVL-X",
  item_name: "VẬT TƯ X",
  stock_uom: "Mét",
  default_purchase_uom: "",
  is_purchase_item: 1,
  uom_conversions: [],
  ...over,
});

const catalogOf = (entries, weights = new Map()) => ({
  danhMuc: {
    entries,
    byCode: new Map(
      entries.flatMap((entry) =>
        [entry.sales_code, entry.purchase_code].filter(Boolean).map((code) => [code, entry]),
      ),
    ),
    duplicateKeys: [],
  },
  weights,
  available: true,
});

const entryOf = (over = {}) => ({
  source_row: 20,
  sales_code: null,
  purchase_code: null,
  purchase_price: null,
  purchase_uom: null,
  purchase_uom_source: null,
  suppliers: [],
  note: null,
  factors: [],
  ...over,
});

/* ─────────────── Luật cốt lõi: ĐVT mua và hệ số đi cùng nhau ─────────────── */

test("ĐVT mua chỉ được gán khi ĐÃ có hệ số cho nó", () => {
  const withFactor = applyPurchaseCatalog(
    [item({ item_code: "NVL-V4" })],
    catalogOf([
      entryOf({
        sales_code: "NVL-V4",
        purchase_uom: "Kg",
        factors: [{ from_uom: "Mét", to_uom: "Kg", factor: 1.464, kind: "weight_per_length", source_text: "TL 1.464KG/M" }],
      }),
    ]),
  );
  const patched = withFactor.items[0];
  assert.equal(patched.default_purchase_uom, "Kg");
  assert.deepEqual(patched.uom_conversions.map((row) => row.uom), ["Kg"]);
  assert.equal(withFactor.report.blocked_count, 0);
});

test("thiếu hệ số thì BỎ LUÔN ĐVT mua, không để payload bị chặn ở bước sau", () => {
  // `assertCanonicalItemPayload` từ chối cả lượt nhập nếu stock_uom !== default_purchase_uom
  // mà không có dòng quy đổi tương ứng. Gán một mình ĐVT mua là tự tay dựng chỗ chặn đó.
  const result = applyPurchaseCatalog(
    [item({ item_code: "NVL-VAIHAMXO", stock_uom: "Cái" })],
    catalogOf([entryOf({ sales_code: "NVL-VAIHAMXO", purchase_uom: "Kg" })]),
  );
  assert.equal(result.items[0].default_purchase_uom, "");
  assert.equal(result.report.blocked_count, 1);
  assert.equal(result.report.blocked[0].reason, "purchase_uom_without_conversion");
});

test("hệ số sai trục vẫn bị chặn — kg/con không nối được Bộ với Kg", () => {
  // Dòng nguồn `BẮN BƯỚM SẮT` khai 0,0195 kg/con nhưng mặt hàng tồn theo Bộ. Hệ số có thật,
  // chỉ là nó nói về trục khác. Nhận bừa là quy đổi tồn kho sai không có gì báo.
  const result = applyPurchaseCatalog(
    [item({ item_code: "TP-BUOMSAT-DL", stock_uom: "Bộ" })],
    catalogOf([
      entryOf({
        sales_code: "TP-BUOMSAT-DL",
        purchase_uom: "Kg",
        factors: [{ from_uom: "Con", to_uom: "Kg", factor: 0.0195, kind: "qty_per_unit", source_text: "0.0195 kg/con" }],
      }),
    ]),
  );
  assert.equal(result.items[0].default_purchase_uom, "");
  assert.equal(result.report.blocked_count, 1);
  assert.deepEqual(result.items[0].uom_conversions, []);
});

test("ĐVT mua trùng ĐVT tồn thì gán được mà không cần hệ số", () => {
  const result = applyPurchaseCatalog(
    [item({ item_code: "NVL-K", stock_uom: "Kg" })],
    catalogOf([entryOf({ sales_code: "NVL-K", purchase_uom: "Kg" })]),
  );
  assert.equal(result.items[0].default_purchase_uom, "Kg");
  assert.equal(result.report.blocked_count, 0);
});

/* ─────────────── Luật gộp: nguồn không sở hữu sự vắng mặt ─────────────── */

test("không xoá dòng quy đổi do người khác ghi", () => {
  // `import-alumdoor-bom-rule-local.mjs` cũng ghi vào ô này. So bằng-hệt-nhau từng làm 9 mặt
  // hàng báo xung đột giả — xem comment ở import-alumdoor-item-master-local.mjs:106-118.
  const existing = [{ uom: "Cây", conversion_factor: 5.85, note: "do BOM Rule tạo" }];
  const result = applyPurchaseCatalog(
    [item({ item_code: "NVL-R", uom_conversions: existing })],
    catalogOf([
      entryOf({
        sales_code: "NVL-R",
        factors: [{ from_uom: "Mét", to_uom: "Kg", factor: 2, kind: "weight_per_length", source_text: "TL 2KG/M" }],
      }),
    ]),
  );
  const uoms = result.items[0].uom_conversions.map((row) => row.uom).sort();
  assert.deepEqual(uoms, ["Cây", "Kg"], "dòng cũ phải còn nguyên");
});

test("nguồn nói khác dòng đã có thì BÁO, không đè", () => {
  const result = applyPurchaseCatalog(
    [item({ item_code: "TP-RAYHOP", uom_conversions: [{ uom: "Kg", conversion_factor: 1.083 }] })],
    catalogOf([], new Map([["TP-RAYHOP", { from_uom: "Mét", to_uom: "Kg", factor: 1.119, kind: "weight_per_length", source_text: "RHM8 = 1.119 kg/m" }]])),
  );
  assert.equal(result.report.conflict_count, 1);
  // Giá trị cũ giữ nguyên — người quyết, không phải bộ nhập.
  assert.equal(result.items[0].uom_conversions[0].conversion_factor, 1.083);
});

test("lệch dưới nửa phần trăm không tính là xung đột", () => {
  const result = applyPurchaseCatalog(
    [item({ item_code: "NVL-R", uom_conversions: [{ uom: "Kg", conversion_factor: 0.5 }] })],
    catalogOf([], new Map([["NVL-R", { from_uom: "Mét", to_uom: "Kg", factor: 2.001, kind: "weight_per_length", source_text: "x" }]])),
  );
  assert.equal(result.report.conflict_count, 0);
});

/* ─────────────── Đối chiếu theo tên: chỉ khi duy nhất hai phía ─────────────── */

test("đối chiếu theo tên khi mã nguồn thật ra là tên gọi ở xưởng", () => {
  const result = applyPurchaseCatalog(
    [item({ item_code: "TP-COI", item_name: "CÒI BÁO ĐỘNG", stock_uom: "Cái" })],
    catalogOf([entryOf({ sales_code: "CÒI BÁO ĐỘNG", purchase_code: "CÒI", purchase_price: 22000, purchase_uom: "Cái", suppliers: ["ANH ĐẠT MOTOR"] })]),
  );
  assert.equal(result.report.matched_by_name_count, 1);
  assert.deepEqual(result.purchase_prices, [
    { item_code: "TP-COI", rate: 22000, uom: "Cái", source_row: 20 },
  ]);
  assert.equal(result.supplier_items[0].supplier, "ANH ĐẠT MOTOR");
  assert.equal(result.supplier_items[0].supplier_item_code, "CÒI");
});

test("tên trùng thì KHÔNG gán, ghi vào ambiguous", () => {
  // `docs/ALUMDOOR-SOAT-MA-TRUNG.md` đếm 25 nhóm trùng tên. Gán bừa một trong số đó là gán
  // giá nhập cho nhầm vật tư.
  const result = applyPurchaseCatalog(
    [
      item({ item_code: "PK-PULY-140", item_name: "PULY 140", stock_uom: "Cái" }),
      item({ item_code: "PK-PL140", item_name: "PULY 140", stock_uom: "Cái" }),
    ],
    catalogOf([entryOf({ sales_code: "PULY 140", purchase_price: 19000, purchase_uom: "Cái" })]),
  );
  assert.equal(result.report.matched_by_name_count, 0);
  assert.equal(result.report.ambiguous_name_match_count, 1);
  assert.deepEqual(result.report.ambiguous_name_matches[0], {
    name: "PULY 140",
    reason: "item_name_duplicated",
  });
  assert.equal(result.purchase_prices.length, 0);
});

test("tên chuẩn hoá: bỏ dấu, giữ phân biệt LỚN/NHỎ", () => {
  assert.equal(normalizeName(" Còi  Báo Động "), "COI BAO DONG");
  assert.equal(normalizeName("ĐỨC AL548N"), "DUC AL548N");
  assert.notEqual(normalizeName("PULY 114 LỚN"), normalizeName("PULY 114 NHỎ"));
});

/* ─────────────── Đọc nguồn thật ─────────────── */

test("nguồn thật: đọc được 63 dòng, khoá trùng được ghi lại chứ không nuốt", async () => {
  const text = await readFile(resolve(REPO_ROOT, "apps/alumdoor/docs/nguon/ms-lien/DANH-MỤC.md"), "utf8");
  const indexed = indexDanhMucPurchaseRows(text);
  assert.equal(indexed.entries.length, 63);
  // Năm dòng khác nhau đều ghi MÃ NHẬP là "CON LĂN" — giữ bản đầu, ghi lại bốn bản bị bỏ.
  const conLan = indexed.duplicateKeys.filter((row) => row.key === "CON LĂN");
  assert.equal(conLan.length, 4);
  assert.equal(indexed.byCode.get("CON LĂN").source_row, 8);
});

test("nguồn thật: chỉ 12/40 bản ghi trọng lượng đã khớp được về mã", async () => {
  const json = JSON.parse(await readFile(resolve(REPO_ROOT, "data/trong-luong-nhom.json"), "utf8"));
  const weights = indexAluminiumWeights(json);
  assert.equal(json.weights.length, 40);
  assert.equal(weights.size, 12, "28 bản ghi còn để trống item_code — nguồn dặn KHÔNG đoán");
  assert.equal(weights.get("TP-TD325").factor, 0.619);
});

test("nguồn thật: nạp được cả hai nguồn từ gốc repo", async () => {
  const catalog = await loadPurchaseCatalog(REPO_ROOT);
  assert.equal(catalog.available, true);
  assert.equal(catalog.danhMuc.entries.length, 63);
  assert.equal(catalog.weights.size, 12);
});

test("không có nguồn thì im lặng bỏ qua, không ném", async () => {
  const catalog = await loadPurchaseCatalog("/khong-ton-tai-o-dau-ca");
  assert.equal(catalog.available, false);
  const result = applyPurchaseCatalog([item()], catalog);
  assert.equal(result.report.change_count, 0);
  assert.deepEqual(result.items[0], item());
});
